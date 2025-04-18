import { useState, useEffect, useCallback, useRef } from 'react'
import useWebsocket from './useWebsocket'
import { useSession } from './useAuth'

// Simple toast notification functions until we install a proper toast library
const toast = {
  error: (message: string) => console.error(`TOAST: ${message}`),
  success: (message: string) => console.log(`TOAST: ${message}`)
}

interface AgentConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages?: AgentMessage[]
}

interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  conversationId?: string  // Added to fix linter error
  actions?: AgentAction[]
}

interface AgentAction {
  id: string
  type: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  details: any
  result?: any
}

interface AgentStreamChunk {
  content: string
  done?: boolean
}

type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Hook for managing WebSocket communication with the agent
 * @param documentId - The current document ID
 * @returns Object with conversation data and methods for interacting with the agent
 */
export function useAgentWebSocket(documentId: string) {
  const socket = useWebsocket()
  const session = useSession({ redirectToLogin: false })
  const userId = session.data?.id
  
  const connected = !!socket?.connected
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeConversation, setActiveConversation] = useState<AgentConversation | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  
  // Keep track of the active conversation ID
  const activeConversationId = useRef<string | null>(null)

  // Keep track of the rooms we've joined
  const joinedRooms = useRef<Set<string>>(new Set())
  
  /**
   * Fetch conversations for the current document
   */
  const fetchConversations = useCallback(() => {
    console.log('[AgentWS] fetchConversations called', { connected, socket, documentId });
    if (!connected || !socket || !documentId) {
      setIsLoading(false); // Ensure loading is false if we can't fetch
      console.warn('[AgentWS] Not connected or missing socket/documentId', { connected, socket, documentId });
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    // Add timeout to prevent hanging loading state
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
      setError('Request timed out. Please try again.');
      toast.error('Request timed out while loading conversations');
      console.error('[AgentWS] Request timed out while loading conversations');
    }, 10000); // 10 seconds timeout
    
    console.log('[AgentWS] Emitting agent:get-document-conversations', { documentId });
    socket.emit('agent:get-document-conversations', { documentId }, (response: any) => {
      clearTimeout(timeoutId); // Clear the timeout
      console.log('[AgentWS] Received response for agent:get-document-conversations', response);
      
      if (response?.success) {
        setConversations(response.conversations || []);
        setIsLoading(false);
        console.log('[AgentWS] Conversations loaded', response.conversations);
      } else if (response?.error && response.error.includes('Feature not available')) {
        // Special case for missing database tables
        setError('Feature not available. Agent database tables have not been created yet.');
        setConversations([]);
        setIsLoading(false);
        console.warn('[AgentWS] Feature not available error', response.error);
      } else {
        console.error('[AgentWS] Failed to fetch conversations:', response?.error);
        setError('Failed to load conversations. Please try again.');
        toast.error('Failed to load conversations');
        setIsLoading(false);
      }
    });
  }, [connected, socket, documentId]);
  
  /**
   * Join a conversation room to receive updates
   */
  const joinConversationRoom = useCallback((conversationId: string) => {
    if (!connected || !socket || !conversationId) return
    
    const roomId = `agent:conversation:${conversationId}`
    
    // Only join if we haven't joined already
    if (!joinedRooms.current.has(roomId)) {
      socket.emit('join', roomId, (response: any) => {
        if (response.success) {
          joinedRooms.current.add(roomId)
          console.log(`Joined room: ${roomId}`)
        } else {
          console.error(`Failed to join room ${roomId}:`, response.error)
        }
      })
    }
  }, [connected, socket])
  
  /**
   * Leave a conversation room when no longer needed
   */
  const leaveConversationRoom = useCallback((conversationId: string) => {
    if (!connected || !socket || !conversationId) return
    
    const roomId = `agent:conversation:${conversationId}`
    
    if (joinedRooms.current.has(roomId)) {
      socket.emit('leave', roomId, (response: any) => {
        if (response.success) {
          joinedRooms.current.delete(roomId)
          console.log(`Left room: ${roomId}`)
        } else {
          console.error(`Failed to leave room ${roomId}:`, response.error)
        }
      })
    }
  }, [connected, socket])
  
  // Setup socket event listeners when connection state changes
  useEffect(() => {
    if (!connected || !socket || !documentId) return
    
    // Request conversations for this document when the connection is established
    fetchConversations()
    
    // Set up socket event listeners for agent communication
    const handleNewMessage = (data: { conversationId: string, message: AgentMessage }) => {
      // If this is for the active conversation, add it to messages
      if (data.conversationId === activeConversationId.current) {
        setMessages(prev => {
          // Don't add if we already have this message (prevent duplicates)
          if (prev.some(m => m.id === data.message.id)) {
            return prev
          }
          return [...prev, data.message]
        })
        
        // If streaming was happening, stop it
        if (isStreaming) {
          setIsStreaming(false)
          setStreamingContent('')
        }
      }
      
      // Update the conversation in the list
      setConversations(prev => 
        prev.map(conv => 
          conv.id === data.conversationId 
            ? { 
                ...conv, 
                updatedAt: new Date().toISOString(),
                // If conversation title is not set, use first few words of first user message
                title: conv.title || generateTitleFromMessage(data.message.content)
              } 
            : conv
        )
      )
    }
    
    const handleStreamChunk = (data: { conversationId: string, chunk: AgentStreamChunk }) => {
      // Only handle if this is for the active conversation
      if (data.conversationId === activeConversationId.current) {
        if (data.chunk.done) {
          // Stream is complete
          setIsStreaming(false)
        } else {
          // Append content
          setIsStreaming(true)
          setStreamingContent(prev => prev + (data.chunk.content || ''))
        }
      }
    }
    
    const handleNewAction = (data: { 
      conversationId: string, 
      messageId: string, 
      action: AgentAction 
    }) => {
      // Only handle if this is for the active conversation
      if (data.conversationId === activeConversationId.current) {
        // Find the message and add/update the action
        setMessages(prev => 
          prev.map(msg => 
            msg.id === data.messageId 
              ? {
                  ...msg,
                  actions: [...(msg.actions || []), data.action]
                }
              : msg
          )
        )
      }
    }
    
    const handleActionUpdate = (data: { 
      conversationId: string, 
      messageId: string, 
      actionId: string,
      status: ActionStatus,
      result?: any
    }) => {
      // Only handle if this is for the active conversation
      if (data.conversationId === activeConversationId.current) {
        // Find the message and action, and update it
        setMessages(prev => 
          prev.map(msg => 
            msg.id === data.messageId && msg.actions
              ? {
                  ...msg,
                  actions: msg.actions.map(action =>
                    action.id === data.actionId
                      ? {
                          ...action,
                          status: data.status,
                          result: data.result || action.result
                        }
                      : action
                  )
                }
              : msg
          )
        )
      }
    }
    
    const handleSocketError = (err: any) => {
      console.error('Socket error:', err)
      setError('Connection error. Please reload the page.')
      toast.error('Agent connection error')
    }
    
    const handleConnectError = (err: any) => {
      console.error('Socket connection error:', err)
      setError('Failed to connect to the server. Please reload the page.')
      toast.error('Connection error')
    }
    
    const handleReconnect = () => {
      console.log('Socket reconnected')
      toast.success('Reconnected to server')
      setError(null)
      
      // Refetch conversations after reconnect
      fetchConversations()
      
      // Rejoin the active conversation room if needed
      if (activeConversationId.current) {
        joinConversationRoom(activeConversationId.current)
      }
    }
    
    // Register event listeners
    socket.on('agent:message', handleNewMessage)
    socket.on('agent:stream', handleStreamChunk)
    socket.on('agent:action', handleNewAction)
    socket.on('agent:action:update', handleActionUpdate)
    socket.on('error', handleSocketError)
    socket.on('connect_error', handleConnectError)
    socket.on('reconnect', handleReconnect)
    
    // Cleanup function
    return () => {
      socket.off('agent:message', handleNewMessage)
      socket.off('agent:stream', handleStreamChunk)
      socket.off('agent:action', handleNewAction)
      socket.off('agent:action:update', handleActionUpdate)
      socket.off('error', handleSocketError)
      socket.off('connect_error', handleConnectError)
      socket.off('reconnect', handleReconnect)
      
      // Leave all rooms when unmounting
      joinedRooms.current.forEach(roomId => {
        socket.emit('leave', roomId)
      })
      
      joinedRooms.current.clear()
    }
  }, [connected, socket, documentId, isStreaming, fetchConversations, joinConversationRoom])
  
  // Helper function to generate a title from the first user message
  const generateTitleFromMessage = (content: string) => {
    const words = content.split(' ').slice(0, 5);
    return words.join(' ') + (words.length >= 5 ? '...' : '');
  }
  
  /**
   * Function to create a new conversation
   * @returns Promise resolving to the new conversation ID
   */
  const createConversation = useCallback(async (title?: string): Promise<string | null> => {
    if (!connected || !socket || !documentId) {
      throw new Error('Cannot create conversation: not connected');
    }
    
    return new Promise((resolve, reject) => {
      socket.emit('agent:create-conversation', 
        { documentId, title }, 
        (response: any) => {
          if (response?.success && response?.conversation?.id) {
            // Join the conversation room
            joinConversationRoom(response.conversation.id);
            
            // Set this as the active conversation
            activeConversationId.current = response.conversation.id;
            
            // Update the conversations list
            setConversations(prev => [response.conversation, ...prev]);
            
            resolve(response.conversation.id);
          } else if (response?.error && response.error.includes('Feature not available')) {
            // Special case for missing database tables
            reject(new Error('Feature not available. Agent database tables have not been created yet.'));
          } else {
            console.error('Failed to create conversation:', response?.error);
            reject(new Error('Failed to create conversation'));
          }
        }
      );
    });
  }, [connected, socket, documentId, joinConversationRoom]);
  
  /**
   * Function to load a specific conversation
   * @param conversationId - The ID of the conversation to load
   * @returns Promise resolving to success status
   */
  const loadConversation = useCallback(async (conversationId: string) => {
    if (!connected || !socket) {
      toast.error('Cannot load conversation: Not connected')
      return false
    }
    
    // Join the room for this conversation
    joinConversationRoom(conversationId)
    
    // Update the active conversation ID ref
    activeConversationId.current = conversationId
    
    // Reset streaming state
    setIsStreaming(false)
    setStreamingContent('')
    setError(null)
    
    // Find the conversation in our list
    const conversation = conversations.find(c => c.id === conversationId) || null
    setActiveConversation(conversation)
    
    // Request messages for this conversation
    return new Promise<boolean>((resolve, reject) => {
      setIsLoading(true)
      
      socket.emit('agent:get-conversation', { conversationId }, (response: any) => {
        setIsLoading(false)
        
        if (response.success) {
          setMessages(response.messages || [])
          resolve(true)
        } else {
          console.error('Failed to fetch conversation:', response.error)
          setError('Failed to load conversation messages')
          toast.error('Failed to load conversation')
          reject(new Error(response.error || 'Failed to load conversation'))
        }
      })
    })
  }, [connected, socket, conversations, joinConversationRoom])
  
  /**
   * Function to send a message to the active conversation
   * @param conversationId - The ID of the conversation to send to
   * @param content - The message content
   * @returns Promise resolving to success status
   */
  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    if (!connected || !socket) {
      toast.error('Cannot send message: Not connected')
      return false
    }
    
    // Make sure we're in the right room
    joinConversationRoom(conversationId)
    
    // Optimistically add the user message to the UI
    const optimisticId = `temp-${Date.now()}`
    const optimisticMessage: AgentMessage = {
      id: optimisticId,
      conversationId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    
    setMessages(prev => [...prev, optimisticMessage])
    
    // Reset any previous errors
    setError(null)
    
    // Send the message
    return new Promise<boolean>((resolve, reject) => {
      socket.emit('agent:send-message', { conversationId, content }, (response: any) => {
        if (response.success) {
          // Message sent successfully, it will come back through socket events
          // We'll replace our optimistic message when the real one arrives
          resolve(true)
        } else {
          // Remove the optimistic message on error
          setMessages(prev => prev.filter(m => m.id !== optimisticId))
          setError('Failed to send message')
          toast.error('Failed to send message')
          reject(new Error(response.error || 'Failed to send message'))
        }
      })
    })
  }, [connected, socket, joinConversationRoom])
  
  /**
   * Function to provide feedback on an agent response
   * @param messageId - The ID of the message to provide feedback for
   * @param isPositive - Whether the feedback is positive (thumbs up) or negative (thumbs down)
   * @param feedbackText - Optional detailed feedback text
   */
  const provideFeedback = useCallback(async (
    messageId: string, 
    isPositive: boolean, 
    feedbackText?: string
  ) => {
    if (!connected || !socket || !activeConversationId.current) {
      toast.error('Cannot send feedback: Not connected')
      return false
    }
    
    return new Promise<boolean>((resolve, reject) => {
      socket.emit('agent:provide-feedback', {
        conversationId: activeConversationId.current,
        messageId,
        isPositive,
        feedbackText
      }, (response: any) => {
        if (response.success) {
          toast.success('Thank you for your feedback!')
          resolve(true)
        } else {
          toast.error('Failed to send feedback')
          reject(new Error(response.error || 'Failed to send feedback'))
        }
      })
    })
  }, [connected, socket])
  
  /**
   * Delete a conversation
   * @param conversationId - The ID of the conversation to delete
   */
  const deleteConversation = useCallback(async (conversationId: string) => {
    if (!connected || !socket) {
      toast.error('Cannot delete conversation: Not connected')
      return false
    }
    
    return new Promise<boolean>((resolve, reject) => {
      socket.emit('agent:delete-conversation', { conversationId }, (response: any) => {
        if (response.success) {
          // Remove from our list
          setConversations(prev => prev.filter(c => c.id !== conversationId))
          
          // If this was the active conversation, clear it
          if (activeConversationId.current === conversationId) {
            activeConversationId.current = null
            setActiveConversation(null)
            setMessages([])
          }
          
          // Leave the room
          leaveConversationRoom(conversationId)
          
          toast.success('Conversation deleted')
          resolve(true)
        } else {
          toast.error('Failed to delete conversation')
          reject(new Error(response.error || 'Failed to delete conversation'))
        }
      })
    })
  }, [connected, socket, leaveConversationRoom])
  
  /**
   * Refresh the conversation list
   */
  const refreshConversations = useCallback(() => {
    fetchConversations()
  }, [fetchConversations])
  
  // Add connection state logging
  useEffect(() => {
    if (socket) {
      const onConnect = () => console.log('[AgentWS] Socket connected');
      const onDisconnect = () => console.log('[AgentWS] Socket disconnected');
      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
      };
    }
  }, [socket]);
  
  return {
    connected,
    isLoading,
    error,
    conversations,
    activeConversation,
    messages,
    isStreaming,
    streamingContent,
    createConversation,
    loadConversation,
    sendMessage,
    provideFeedback,
    deleteConversation,
    refreshConversations
  }
} 