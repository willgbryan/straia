#!/usr/bin/env python3
"""
Command-line utility to send requests to the agent API.

Usage:
  python send_request.py query "What tables are available?" --document-id <UUID>
  python send_request.py stream "Show me a query to analyze sales." --document-id <UUID>
"""
import argparse
import asyncio
import json
import os
import sys
import httpx

# Default settings
DEFAULT_API_URL = "http://localhost:8000"
DEFAULT_USERNAME = "admin"
DEFAULT_PASSWORD = "password"


async def send_query_request(args):
    """Send a request to the synchronous query endpoint."""
    api_url = args.api_url or os.environ.get("API_BASE_URL", DEFAULT_API_URL)
    username = args.username or os.environ.get("API_USERNAME", DEFAULT_USERNAME)
    password = args.password or os.environ.get("API_PASSWORD", DEFAULT_PASSWORD)
    
    url = f"{api_url}/v2/agent/query"
    auth = (username, password)
    
    request_data = {
        "question": args.question,
    }
    
    if args.document_id:
        request_data["documentId"] = args.document_id
    
    print(f"Sending query to {url}")
    print(f"Question: {args.question}")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url, 
            json=request_data, 
            auth=auth,
            timeout=60.0
        )
        
    print(f"\nStatus: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print("\nResponse:")
        print(json.dumps(result, indent=2))
    else:
        print(f"Error: {response.text}")


async def send_stream_request(args):
    """Send a request to the streaming endpoint."""
    api_url = args.api_url or os.environ.get("API_BASE_URL", DEFAULT_API_URL)
    username = args.username or os.environ.get("API_USERNAME", DEFAULT_USERNAME)
    password = args.password or os.environ.get("API_PASSWORD", DEFAULT_PASSWORD)
    
    url = f"{api_url}/v2/agent/stream"
    auth = (username, password)
    
    request_data = {
        "question": args.question,
    }
    
    if args.document_id:
        request_data["documentId"] = args.document_id
    
    print(f"Sending streaming request to {url}")
    print(f"Question: {args.question}")
    
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST", 
            url, 
            json=request_data, 
            auth=auth,
            timeout=120.0
        ) as response:
            print(f"\nStatus: {response.status_code}")
            
            if response.status_code != 200:
                print(f"Error: {response.text}")
                return
            
            print("\nStreaming response:\n")
            message_count = 0
            async for line in response.aiter_lines():
                if line.strip():
                    try:
                        message = json.loads(line)
                        print(f"[Message {message_count+1}] {message.get('role', 'unknown')}: {message.get('content', '')}")
                        message_count += 1
                    except json.JSONDecodeError:
                        print(f"Raw data: {line}")
            
            print(f"\nReceived {message_count} messages.")


def main():
    """Parse arguments and run the appropriate command."""
    parser = argparse.ArgumentParser(description="Send requests to the agent API")
    parser.add_argument("--api-url", help="Base URL for the API")
    parser.add_argument("--username", help="API username")
    parser.add_argument("--password", help="API password")
    
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Query command
    query_parser = subparsers.add_parser("query", help="Send a synchronous query")
    query_parser.add_argument("question", help="Question to ask the agent")
    query_parser.add_argument("--document-id", help="Document ID for context")
    
    # Stream command
    stream_parser = subparsers.add_parser("stream", help="Send a streaming request")
    stream_parser.add_argument("question", help="Question to ask the agent")
    stream_parser.add_argument("--document-id", help="Document ID for context")
    
    args = parser.parse_args()
    
    if args.command == "query":
        asyncio.run(send_query_request(args))
    elif args.command == "stream":
        asyncio.run(send_stream_request(args))
    else:
        parser.print_help()
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main()) 