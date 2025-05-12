import { v4 as uuidv4 } from 'uuid'
import {
  useCallback,
  useEffect,
  useRef,
  MouseEventHandler,
  useMemo,
  useState,
} from 'react'
import { Menu, Transition } from '@headlessui/react'
import { Syne } from 'next/font/google'
import PagePath from '@/components/PagePath'
import {
  ChevronUpIcon,
  ArrowLeftOnRectangleIcon,
  PlusSmallIcon,
  CircleStackIcon,
  TrashIcon,
  UserIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  UsersIcon,
  AdjustmentsHorizontalIcon,
  PuzzlePieceIcon,
  MagnifyingGlassIcon,
  RocketLaunchIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Page } from '@/components/PagePath'
import { useDocuments } from '@/hooks/useDocuments'
import { useFavorites } from '@/hooks/useFavorites'
import { useStringQuery } from '@/hooks/useQueryArgs'
import { CpuChipIcon, SparklesIcon } from '@heroicons/react/24/solid'
import type { UserWorkspaceRole } from '@briefer/database'
import ReactDOM from 'react-dom'
import useDropdownPosition from '@/hooks/dropdownPosition'
import DocumentTree from './DocumentsTree'
import useSideBar, {
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
} from '@/hooks/useSideBar'
import MobileWarning from './MobileWarning'
import CommandPalette from './commandPalette'
import { useHotkeys } from 'react-hotkeys-hook'
import GitHubButton from 'react-github-btn'
import { useDataSources } from '@/hooks/useDatasources'
import {
  ConfigurationsMenuButton,
  ConfigurationsMenuLink,
} from './ConfigurationsMenuItem'
import { FeaturesDialog } from './SubscriptionBadge'
import { SessionUser, useSignout } from '@/hooks/useAuth'
import DragLayer from './DragLayer'

const syne = Syne({ subsets: ['latin'] })

type ConfigItem = {
  id: string
  name: string
  href: string
  icon: React.ComponentType<React.ComponentProps<any>>
  hidden?: boolean
  allowedRoles: Set<UserWorkspaceRole>
  openInNewTab: boolean
}

const configs = (workspaceId: string): ConfigItem[] => [
  {
    id: 'environments-sidebar-item',
    name: 'Environments',
    href: `/workspaces/${workspaceId}/environments`,
    hidden: true,
    icon: CpuChipIcon,
    allowedRoles: new Set<UserWorkspaceRole>(['admin']),
    openInNewTab: false,
  },
  {
    id: 'data-sources-sidebar-item',
    name: 'Data sources',
    href: `/workspaces/${workspaceId}/data-sources`,
    icon: CircleStackIcon,
    allowedRoles: new Set<UserWorkspaceRole>(['admin', 'editor']),
    openInNewTab: false,
  },
  {
    id: 'users-sidebar-item',
    name: 'Users',
    href: `/workspaces/${workspaceId}/users`,
    icon: UsersIcon,
    allowedRoles: new Set<UserWorkspaceRole>(['admin', 'editor', 'viewer']),
    openInNewTab: false,
  },
  {
    id: 'integrations-sidebar-item',
    name: 'Integrations',
    href: `/workspaces/${workspaceId}/integrations`,
    icon: PuzzlePieceIcon,
    allowedRoles: new Set<UserWorkspaceRole>(['admin', 'editor']),
    openInNewTab: false,
  },
  {
    id: 'docs-sidebar-item',
    name: 'Documentation',
    href: `https://docs.briefer.cloud`,
    icon: AcademicCapIcon,
    allowedRoles: new Set<UserWorkspaceRole>(['admin', 'editor', 'viewer']),
    openInNewTab: true,
  },
  {
    id: 'settings-sidebar-item',
    name: 'Settings',
    href: `/workspaces/${workspaceId}/settings`,
    icon: AdjustmentsHorizontalIcon,
    allowedRoles: new Set<UserWorkspaceRole>(['admin']),
    openInNewTab: false,
  },
  {
    id: 'thrash-sidebar-item',
    name: 'Trash',
    href: `/workspaces/${workspaceId}/trash`,
    icon: TrashIcon,
    allowedRoles: new Set<UserWorkspaceRole>(['admin', 'editor']),
    openInNewTab: false,
  },
]

interface Props {
  children: React.ReactNode
  pagePath?: Page[]
  topBarClassname?: string
  topBarContent?: React.ReactNode
  hideOnboarding?: boolean
  user: SessionUser
}

export default function Layout({
  children,
  pagePath,
  topBarClassname,
  topBarContent,
  user,
  hideOnboarding,
}: Props) {
  const [isSearchOpen, setSearchOpen] = useState(false)
  useHotkeys(['mod+k'], () => {
    setSearchOpen((prev) => !prev)
  })

  const {
    state: { isOpen: isSideBarOpen, width: sideBarWidth },
    api: sideBarApi,
  } = useSideBar()

  const toggleSideBar = useCallback(
    (state: boolean) => {
      return () => sideBarApi.toggle(state)
    },
    [sideBarApi.toggle]
  )

  const router = useRouter()
  const workspaceId = useStringQuery('workspaceId')
  const documentId = useStringQuery('documentId')

  const [{ datasources: allDataSources, isLoading: isLoadingDataSources }] =
    useDataSources(workspaceId)
  const userDataSources = allDataSources.filter((ds) => !ds.config.data.isDemo)
  const hasUserDataSource = !isLoadingDataSources && userDataSources.size > 0

  const [
    documentsState,
    {
      createDocument,
      duplicateDocument,
      setIcon,
      deleteDocument,
      updateParent: updateDocumentParent,
    },
  ] = useDocuments(workspaceId)

  const documents = documentsState.documents.filter(
    (doc) => doc.deletedAt === null && doc.version > 1
  )

  const [favorites, { favoriteDocument, unfavoriteDocument }] =
    useFavorites(workspaceId)

  const favoriteDocuments = useMemo(
    () => documents.filter((d) => favorites.has(d.id)),
    [documents]
  )

  const onCreateDocument = useCallback(
    async (parentId: string | null) => {
      if (documentsState.loading) {
        return
      }

      const id = uuidv4()
      try {
        await createDocument({ id, parentId, version: 2 })
        router.push(`/workspaces/${workspaceId}/documents/${id}`)
      } catch (err) {
        console.error(err)
      }
    },
    [documentsState, createDocument, router, workspaceId]
  )

  const onCreateDocumentHandler: MouseEventHandler<HTMLButtonElement> =
    useCallback(
      (e) => {
        e.preventDefault()
        onCreateDocument(null)
      },
      [onCreateDocument]
    )

  const onDeleteDocument = useCallback(
    (id: string) => {
      if (documentsState.loading) {
        return
      }

      deleteDocument(id)
    },
    [documentsState, deleteDocument]
  )

  const onDuplicateDocument = useCallback(
    async (id: string) => {
      if (documentsState.loading) {
        return
      }

      const doc = await duplicateDocument(id)
      router.push(`/workspaces/${workspaceId}/documents/${doc.id}`)
    },
    [documentsState, duplicateDocument, router, workspaceId]
  )

  const onFavoriteDocument = useCallback(
    (documentId: string) => {
      if (documentsState.loading) {
        return
      }

      favoriteDocument(documentId)
    },
    [documentsState, workspaceId, favoriteDocument]
  )

  const onUnfavoriteDocument = useCallback(
    (documentId: string) => {
      if (documentsState.loading) {
        return
      }

      unfavoriteDocument(documentId)
    },
    [workspaceId, unfavoriteDocument]
  )

  const onSetIcon = useCallback(
    (id: string, icon: string) => {
      if (documentsState.loading) {
        return
      }

      setIcon(id, icon)
    },
    [documentsState, setIcon]
  )

  const onUpdateDocumentParent = useCallback(
    async (id: string, parentId: string | null, orderIndex: number) => {
      if (documentsState.loading) {
        return
      }

      await updateDocumentParent(id, parentId, orderIndex)
    },
    [documentsState, updateDocumentParent]
  )

  const showConfigItem = useCallback(
    (item: ConfigItem) => {
      if (item.hidden) {
        return false
      }

      const role = user.roles[workspaceId]
      if (!role) {
        return false
      }

      return item.allowedRoles.has(role)
    },
    [user, workspaceId]
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onBeforeUnload = () => {
      if (scrollRef.current) {
        localStorage.setItem(
          `scroll-${workspaceId}`,
          scrollRef.current.scrollTop.toString()
        )
      }
    }

    router.events.on('routeChangeStart', onBeforeUnload)
    return () => {
      router.events.off('routeChangeStart', onBeforeUnload)
    }
  }, [workspaceId, scrollRef, router])
  useEffect(() => {
    const scroll = localStorage.getItem(`scroll-${workspaceId}`)
    if (scroll && scrollRef.current) {
      scrollRef.current.scrollTop = parseInt(scroll)
    }
  }, [workspaceId, scrollRef])

  const [isUpgradeDialogOpen, setUpgradeDialogOpen] = useState(false)

  // For sidebar resizing
  const isResizingRef = useRef(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isResizingRef.current = true

      function handleMouseMove(e: MouseEvent) {
        if (!isResizingRef.current) return

        const newWidth = Math.max(
          MIN_SIDEBAR_WIDTH,
          Math.min(MAX_SIDEBAR_WIDTH, e.clientX)
        )

        sideBarApi.resize(newWidth)
      }

      function handleMouseUp() {
        isResizingRef.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      // Clean up any existing listeners first to prevent duplicates
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)

      // Add the event listeners
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [sideBarApi.resize]
  )

  return (
    <div
      className={`flex w-full h-full overflow-hidden ${syne.className} relative`}
    >
      <MobileWarning />

      <DragLayer />

      <CommandPalette
        workspaceId={workspaceId}
        isOpen={isSearchOpen}
        setOpen={setSearchOpen}
      />

      <FeaturesDialog
        open={isUpgradeDialogOpen}
        setOpen={setUpgradeDialogOpen}
        currentPlan="open-source"
      />

      {/* Overlay for the collapse button only (always on top) */}
      {isSideBarOpen && (
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000]">
          <button
            className="absolute top-3 bg-ceramic-50 rounded-full h-6 w-6 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer border border-gray-200 hover:bg-ceramic-100 shadow-sm pointer-events-auto"
            onClick={toggleSideBar(false)}
            style={{
              left: `calc(${sideBarWidth}px - 12px)`,
            }}
          >
            <ChevronDoubleLeftIcon className="w-3 h-3" />
          </button>
        </div>
      )}

      {isSideBarOpen && (
        <>
          <div
            ref={sidebarRef}
            className="flex flex-col h-full bg-ceramic-50/60 overflow-auto border-r border-gray-200 flex-shrink-0 relative"
            style={{
              width: `${sideBarWidth}px`,
              minWidth: `${Math.max(MIN_SIDEBAR_WIDTH, sideBarWidth)}px`,
              maxWidth: `${Math.min(MAX_SIDEBAR_WIDTH, sideBarWidth)}px`,
              transition: 'width 0.2s ease-in-out',
              background: 'rgb(var(--tw-color-primary-light))',
            }}
          >
            <div className="flex items-center justify-between pt-0.5 pl-4 pr-5">
              <div className="font-trap tracking-tight text-2xl antialiased text-gray-800 flex items-center gap-x-1 scale-90">
                {/* <SparklesIcon className="h-4 w-4" /> */}
                <span className="leading-4 mt-4">Straia</span>
              </div>

              {/* <div className="mt-2.5 scale-90 flex items-center">
                <GitHubButton
                  href="https://github.com/briefercloud/briefer"
                  data-color-scheme="no-preference: light; light: light; dark: dark;"
                  data-size="large"
                  data-show-count="true"
                  aria-label="Star briefercloud/briefer on GitHub"
                >
                  Star
                </GitHubButton>
              </div> */}
            </div>

            <div className="flex-1 overflow-y-auto" ref={scrollRef}>
              {/* Favorites */}
              <div
                className={clsx(
                  favoriteDocuments.size === 0 ? 'hidden' : 'block',
                  'pt-8 overflow-x-hidden'
                )}
              >
                <div className="flex items-center text-xs font-semibold leading-6 text-gray-400 pl-6 pr-1.5 pb-1">
                  <span>Favorites</span>
                </div>
                <DocumentTree
                  workspaceId={workspaceId}
                  current={documentId}
                  documents={favoriteDocuments}
                  onDuplicate={onDuplicateDocument}
                  onDelete={onDeleteDocument}
                  onFavorite={onFavoriteDocument}
                  onUnfavorite={onUnfavoriteDocument}
                  onSetIcon={onSetIcon}
                  role={user.roles[workspaceId] ?? 'viewer'}
                  flat={true}
                  onCreate={onCreateDocument}
                  onUpdateParent={onUpdateDocumentParent}
                />
              </div>

              {/* Pages */}
              <div
                className={clsx(
                  'overflow-hidden',
                  favoriteDocuments.size === 0 ? 'pt-8' : ''
                )}
              >
                <div className="flex items-center text-xs font-semibold leading-6 text-gray-400 pl-6 pr-1.5 pb-1 justify-between">
                  <span>Pages</span>

                  <div className="flex items-center">
                    <button
                      onClick={() => setSearchOpen(true)}
                      className="p-1 hover:text-ceramic-500 hover:bg-ceramic-100/70 rounded-md hover:cursor-pointer"
                    >
                      <MagnifyingGlassIcon
                        className="h-4 w-4 "
                        aria-hidden="true"
                      />
                    </button>

                    {user.roles[workspaceId] !== 'viewer' && (
                      <button
                        id="create-workspace-doc"
                        onClick={onCreateDocumentHandler}
                        className="p-1 hover:text-ceramic-500 hover:bg-ceramic-100/70 rounded-md hover:cursor-pointer"
                      >
                        <PlusSmallIcon
                          className="h-4 w-4 "
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>
                </div>

                <DocumentTree
                  workspaceId={workspaceId}
                  current={documentId}
                  documents={documents}
                  onDuplicate={onDuplicateDocument}
                  onDelete={onDeleteDocument}
                  onFavorite={onFavoriteDocument}
                  onUnfavorite={onUnfavoriteDocument}
                  onSetIcon={onSetIcon}
                  role={user.roles[workspaceId] ?? 'viewer'}
                  onCreate={onCreateDocument}
                  onUpdateParent={onUpdateDocumentParent}
                />
              </div>
            </div>

            {/* Configurations */}
            <div className="pt-8 pb-4">
              <div className="text-xs font-semibold leading-6 text-gray-400 px-4">
                Configurations
              </div>
              <ul role="list">
                {/* <li>
                  <ConfigurationsMenuButton
                    text="Upgrade Briefer"
                    icon={RocketLaunchIcon}
                    onClick={() => setUpgradeDialogOpen(true)}
                  />
                </li> */}
                {configs(workspaceId)
                  .filter(showConfigItem)
                  .map((item) => (
                    <li id={item.id} key={item.name}>
                      <ConfigurationsMenuLink
                        href={item.href}
                        text={item.name}
                        icon={item.icon}
                        openInNewTab={item.openInNewTab}
                        blink={
                          item.id === 'data-sources-sidebar-item' &&
                          !hasUserDataSource
                        }
                      />
                    </li>
                  ))}

                <li>
                  <a
                    href="#"
                    className="text-gray-500 hover:bg-[rgb(var(--tw-color-primary-100))] group text-sm font-medium leading-6 w-full flex py-1 rounded-sm hover:text-ceramic-600"
                  >
                    <div className="w-full flex items-center gap-x-2 px-4">
                      {user.picture ? (
                        <img
                          className="h-4 w-4 rounded-full"
                          src={user.picture}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <UserIcon className="h-4 w-4 rounded-full" />
                      )}
                      <span className="sr-only">Your profile</span>
                      <span aria-hidden="true" className="mt-0.5">
                        {user.name}
                      </span>
                    </div>
                    <UserDropdown workspaceId={workspaceId} />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Resize handle with invisible padding for easier grabbing */}
          <div
            className="flex items-center h-full relative flex-shrink-0 group"
            onMouseDown={startResizing}
          >
            <div className="w-[2px] h-full cursor-col-resize hover:bg-ceramic-200 group-hover:bg-ceramic-200 active:bg-ceramic-300 group-active:bg-ceramic-300 transition-colors duration-150 z-10" />
            {/* Invisible wider click area */}
            <div className="absolute w-[8px] h-full cursor-col-resize bg-transparent left-1/2 -translate-x-1/2" />
          </div>
        </>
      )}

      <main
        className="flex flex-col h-screen flex-1 overflow-hidden relative"
        style={{
          transition: 'flex 0.2s ease-in-out',
        }}
      >
        <div
          className={clsx(
            isSideBarOpen ? 'px-8' : 'pr-8',
            'shrink-0 w-full h-12 border-b b-1 border-gray-200 flex justify-between',
            topBarClassname
          )}
        >
          <div className="flex w-full">
            {/* Original expand sidebar button (visible when sidebar is closed) */}
            <div
              className={clsx(
                isSideBarOpen ? 'hidden' : 'mr-8',
                'relative h-12 w-12 border-b border-gray-200 bg-ceramic-50 text-gray-500 cursor-pointer hover:bg-ceramic-100 flex-shrink-0'
              )}
              onClick={toggleSideBar(true)}
            >
              <ChevronDoubleRightIcon className="w-5 h-5 absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2" />
            </div>
            {pagePath && <PagePath pages={pagePath} />}
            {topBarContent}
          </div>
        </div>
        <div className="flex-grow flex overflow-hidden">{children}</div>
      </main>
    </div>
  )
}

function UserDropdown(props: { workspaceId: string }) {
  const signOut = useSignout()

  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const { onOpen, dropdownPosition } = useDropdownPosition(buttonRef)

  return (
    <Menu as="div" className="relative inline-flex text-left">
      <Menu.Button className="pr-2" ref={buttonRef} onClick={onOpen}>
        <div className="p-1 hover:bg-ceramic-200/50 rounded-md">
          <ChevronUpIcon className="h-4 w-4 shrink-0" />
        </div>
      </Menu.Button>

      {ReactDOM.createPortal(
        <Transition
          as="div"
          id="doc-dropdown"
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
          style={{
            position: 'absolute',
            top: dropdownPosition.top - 5,
            left: dropdownPosition.left,
          }}
          className="absolute z-[2000]"
        >
          <Menu.Items className="absolute left-2 bottom-2 z-20 w-56 origin-bottom-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            <div className="py-2 px-2">
              <Menu.Item>
                {({ active }) => (
                  <Link
                    href={`/workspaces/${props.workspaceId}/profile`}
                    className={clsx(
                      active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                      'w-full px-4 py-2 text-left text-sm flex items-center gap-x-2 rounded-md'
                    )}
                  >
                    <UserIcon className="h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => {
                      signOut()
                    }}
                    className={clsx(
                      active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                      'w-full px-4 py-2 text-left text-sm flex items-center gap-x-2 rounded-md'
                    )}
                  >
                    <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                    <span>Sign Out</span>
                  </button>
                )}
              </Menu.Item>
            </div>
          </Menu.Items>
        </Transition>,
        document.body
      )}
    </Menu>
  )
}
