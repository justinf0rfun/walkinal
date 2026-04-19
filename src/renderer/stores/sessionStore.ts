import { create } from 'zustand'
import type { TabStatus, TabState, Attachment, CatalogPlugin, PluginStatus, QueueItem, HistoryEntry, DraftsFile, DraftTabState, WalkinalConfig, SentEntry } from '../../shared/types'
import { useThemeStore } from '../theme'
import notificationSrc from '../../../resources/notification.mp3'

// ─── Store ───

interface StaticInfo {
  version: string
  email: string | null
  subscriptionType: string | null
  projectPath: string
  homePath: string
}

interface State {
  draftsBootstrapStarted: boolean
  draftsReady: boolean
  tabs: TabState[]
  activeTabId: string
  /** Global expand/collapse — user-controlled, not per-tab */
  isExpanded: boolean
  /** Global info fetched on startup (not per-session) */
  staticInfo: StaticInfo | null
  walkinalConfig: WalkinalConfig | null
  // Marketplace state
  marketplaceOpen: boolean
  marketplaceCatalog: CatalogPlugin[]
  marketplaceLoading: boolean
  marketplaceError: string | null
  marketplaceInstalledNames: string[]
  marketplacePluginStates: Record<string, PluginStatus>
  marketplaceSearch: string
  marketplaceFilter: string

  // Actions
  initStaticInfo: () => Promise<void>
  loadWalkinalConfig: () => Promise<void>
  setWalkinalStorageDir: (dir: string) => Promise<void>
  setDraftsBootstrapStarted: (started: boolean) => void
  setDraftsReady: (ready: boolean) => void
  createTab: () => Promise<string>
  renameTab: (tabId: string, title: string) => void
  selectTab: (tabId: string) => void
  closeTab: (tabId: string) => void
  clearTab: () => void
  toggleExpanded: () => void
  toggleMarketplace: () => void
  closeMarketplace: () => void
  loadMarketplace: (forceRefresh?: boolean) => Promise<void>
  setMarketplaceSearch: (query: string) => void
  setMarketplaceFilter: (filter: string) => void
  installMarketplacePlugin: (plugin: CatalogPlugin) => Promise<void>
  uninstallMarketplacePlugin: (plugin: CatalogPlugin) => Promise<void>
  buildYourOwn: () => void
  loadDrafts: (defaultDir: string) => Promise<boolean>
  persistDrafts: () => Promise<void>
  restoreHistoryEntry: (entry: HistoryEntry) => Promise<string>
  enqueueDraft: (prompt: string) => void
  sendQueuedItems: (run: boolean) => Promise<void>
  removeQueueItem: (itemId: string) => void
  editQueueItem: (itemId: string) => string | null
  moveQueueItem: (itemId: string, direction: 'up' | 'down') => void
  addDirectory: (dir: string) => void
  removeDirectory: (dir: string) => void
  setBaseDirectory: (dir: string) => void
  addAttachments: (attachments: Attachment[]) => void
  removeAttachment: (attachmentId: string) => void
  clearAttachments: () => void
}

// ─── Notification sound (plays when task completes while window is hidden) ───
const notificationAudio = new Audio(notificationSrc)
notificationAudio.volume = 1.0

async function playNotificationIfHidden(): Promise<void> {
  if (!useThemeStore.getState().soundEnabled) return
  try {
    const visible = await window.clui.isVisible()
    if (!visible) {
      notificationAudio.currentTime = 0
      notificationAudio.play().catch(() => {})
    }
  } catch {}
}

function makeLocalTab(): TabState {
  return {
    id: crypto.randomUUID(),
    status: 'idle',
    hasUnread: false,
    currentActivity: '',
    title: 'New Tab',
    workingDirectory: '~',
    hasChosenDirectory: false,
    additionalDirs: [],
    attachments: [],
    queueItems: [],
    sentEntries: [],
  }
}

function queueItemsFromAttachments(attachments: Attachment[]): QueueItem[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    type: attachment.type === 'image' ? 'screenshot' : 'file',
    content: attachment.type === 'image'
      ? `Attached image: ${attachment.name}`
      : `Attached file: ${attachment.name}`,
    createdAt: Date.now(),
    metadata: {
      filePath: attachment.path,
      fileName: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      dataUrl: attachment.dataUrl,
    },
  }))
}

function formatQueueItemForWarp(item: QueueItem): string {
  if (item.type === 'text') return item.content.trim()
  if (item.type === 'file') {
    const filePath = item.metadata?.filePath?.trim()
    const fileName = item.metadata?.fileName?.trim()
    if (filePath) return `[Attached file: ${filePath}]`
    if (fileName) return `[Attached file: ${fileName}]`
    return item.content.trim()
  }

  const label = 'Image'
  const lines = [`[${label}]`]
  if (item.metadata?.fileName) lines.push(`Name: ${item.metadata.fileName}`)
  if (item.metadata?.filePath) lines.push(`Path: ${item.metadata.filePath}`)
  if (item.metadata?.size != null) lines.push(`Size: ${item.metadata.size} bytes`)
  if (item.content.trim()) lines.push(item.content.trim())
  return lines.join('\n')
}

function buildQueuePayload(items: QueueItem[]): string {
  return items
    .filter((item) => item.type !== 'screenshot')
    .map(formatQueueItemForWarp)
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n\n')
}

function collectImagePaths(items: QueueItem[]): string[] {
  return items
    .filter((item) => item.type === 'screenshot')
    .map((item) => item.metadata?.filePath?.trim() || '')
    .filter(Boolean)
}

function buildQueueSendSteps(items: QueueItem[]): Array<{ type: 'text'; text: string } | { type: 'image'; path: string }> {
  return items.flatMap((item) => {
    if (item.type === 'screenshot') {
      const path = item.metadata?.filePath?.trim()
      return path ? [{ type: 'image' as const, path }] : []
    }

    const text = formatQueueItemForWarp(item).trim()
    return text ? [{ type: 'text' as const, text }] : []
  })
}

function queueItemsFromHistoryEntry(entry: HistoryEntry): QueueItem[] {
  const content = entry.content.trim()
  if (!content) return []

  return [
    {
      id: crypto.randomUUID(),
      type: 'text',
      content,
      createdAt: Date.now(),
    },
  ]
}

function deriveAutoTitle(source: string): string {
  const trimmed = source.trim() || 'New Tab'
  return trimmed.length > 30 ? `${trimmed.substring(0, 27)}...` : trimmed
}

function makeContentPreview(content: string, maxLength = 300): string {
  const trimmed = content.trim()
  return trimmed.length > maxLength ? `${trimmed.substring(0, maxLength - 3)}...` : trimmed
}

function makeSentEntry(historyId: string, tabTitle: string, content: string, itemCount: number, mode: 'draft' | 'run'): SentEntry {
  return {
    id: crypto.randomUUID(),
    historyId,
    timestamp: new Date().toISOString(),
    title: tabTitle,
    contentPreview: makeContentPreview(content),
    itemCount,
    mode,
  }
}

function summarizeQueueForHistory(items: QueueItem[]): string {
  return items.map((item) => {
    if (item.type === 'text') return item.content
    if (item.type === 'file') {
      const path = item.metadata?.filePath || item.metadata?.fileName || item.content
      return `[Attached file: ${path}]`
    }
    const name = item.metadata?.fileName || 'Image'
    return `[Attached image: ${name}]`
  }).join('\n\n')
}

function capSentEntries(entries: SentEntry[], limit = 20): SentEntry[] {
  return entries.slice(-limit)
}

const DRAFT_PERSIST_DELAY_MS = 200
let draftPersistTimer: ReturnType<typeof setTimeout> | null = null

function scheduleDraftPersist(store: () => State): void {
  if (!store().draftsReady) return
  if (draftPersistTimer) clearTimeout(draftPersistTimer)
  draftPersistTimer = setTimeout(() => {
    draftPersistTimer = null
    store().persistDrafts().catch(() => {})
  }, DRAFT_PERSIST_DELAY_MS)
}

function flushDraftPersist(store: () => State): void {
  if (!store().draftsReady) return
  if (draftPersistTimer) {
    clearTimeout(draftPersistTimer)
    draftPersistTimer = null
  }
  store().persistDrafts().catch(() => {})
}

function debugLog(message: string, data?: unknown): void {
  if (typeof console === 'undefined') return
  if (data === undefined) {
    console.log(message)
    return
  }
  console.log(message, data)
}

function toDraftTab(tab: TabState): DraftTabState {
  return {
    id: tab.id,
    title: tab.title,
    attachments: tab.attachments,
    queue: tab.queueItems,
    sentEntries: tab.sentEntries,
    draftInput: '',
    hasUnread: tab.hasUnread,
    workingDirectory: tab.workingDirectory,
    additionalDirs: tab.additionalDirs,
  }
}

function fromDraftTab(tab: DraftTabState, defaultDir: string): TabState {
  return {
    ...makeLocalTab(),
    id: tab.id,
    title: tab.title || 'New Tab',
    hasUnread: !!tab.hasUnread,
    workingDirectory: tab.workingDirectory || defaultDir,
    hasChosenDirectory: !!tab.workingDirectory && tab.workingDirectory !== defaultDir ? true : tab.workingDirectory !== '~',
    additionalDirs: Array.isArray(tab.additionalDirs) ? tab.additionalDirs : [],
    attachments: Array.isArray(tab.attachments) ? tab.attachments : [],
    queueItems: Array.isArray(tab.queue) ? tab.queue : [],
    sentEntries: Array.isArray(tab.sentEntries) ? tab.sentEntries : [],
  }
}

const initialTab = makeLocalTab()

export const useSessionStore = create<State>((set, get) => ({
  draftsBootstrapStarted: false,
  draftsReady: false,
  tabs: [],
  activeTabId: '',
  isExpanded: false,
  staticInfo: null,
  walkinalConfig: null,

  // Marketplace
  marketplaceOpen: false,
  marketplaceCatalog: [],
  marketplaceLoading: false,
  marketplaceError: null,
  marketplaceInstalledNames: [],
  marketplacePluginStates: {},
  marketplaceSearch: '',
  marketplaceFilter: 'All',

  initStaticInfo: async () => {
    try {
      const result = await window.clui.start()
      set({
        staticInfo: {
          version: result.version || 'unknown',
          email: result.auth?.email || null,
          subscriptionType: result.auth?.subscriptionType || null,
          projectPath: result.projectPath || '~',
          homePath: result.homePath || '~',
        },
      })
    } catch {}
  },

  loadWalkinalConfig: async () => {
    try {
      const config = await window.clui.getWalkinalConfig()
      set({ walkinalConfig: config })
    } catch {}
  },

  setWalkinalStorageDir: async (dir) => {
    const config = await window.clui.setWalkinalConfig({ storageDir: dir })
    set({ walkinalConfig: config })
    await get().persistDrafts()
  },

  setDraftsBootstrapStarted: (started) => {
    set({ draftsBootstrapStarted: started })
  },

  setDraftsReady: (ready) => {
    set({ draftsReady: ready })
  },

  createTab: async () => {
    const homeDir = get().staticInfo?.homePath || '~'
    try {
      const { tabId } = await window.clui.createTab()
      const tab: TabState = {
        ...makeLocalTab(),
        id: tabId,
        workingDirectory: homeDir,
      }
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }))
      scheduleDraftPersist(get)
      return tabId
    } catch {
      const tab = makeLocalTab()
      tab.workingDirectory = homeDir
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }))
      scheduleDraftPersist(get)
      return tab.id
    }
  },

  renameTab: (tabId, title) => {
    const nextTitle = title.trim()
    if (!nextTitle) return

    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, title: nextTitle }
          : tab
      ),
    }))
    scheduleDraftPersist(get)
  },

  selectTab: (tabId) => {
    const s = get()
    if (tabId === s.activeTabId) {
      // Clicking the already-active tab: toggle global expand/collapse
      const willExpand = !s.isExpanded
      set((prev) => ({
        isExpanded: willExpand,
        marketplaceOpen: false,
        // Expanding = reading: clear unread flag
        tabs: willExpand
          ? prev.tabs.map((t) => t.id === tabId ? { ...t, hasUnread: false } : t)
          : prev.tabs,
      }))
    } else {
      // Switching to a different tab: mark as read
      set((prev) => ({
        activeTabId: tabId,
        marketplaceOpen: false,
        tabs: prev.tabs.map((t) =>
          t.id === tabId ? { ...t, hasUnread: false } : t
        ),
      }))
      scheduleDraftPersist(get)
    }
  },

  toggleExpanded: () => {
    const { activeTabId, isExpanded } = get()
    const willExpand = !isExpanded
    set((s) => ({
      isExpanded: willExpand,
      marketplaceOpen: false,
      // Expanding = reading: clear unread flag for the active tab
      tabs: willExpand
        ? s.tabs.map((t) => t.id === activeTabId ? { ...t, hasUnread: false } : t)
        : s.tabs,
    }))
  },

  toggleMarketplace: () => {
    const s = get()
    if (s.marketplaceOpen) {
      set({ marketplaceOpen: false })
    } else {
      set({ isExpanded: false, marketplaceOpen: true })
      get().loadMarketplace()
    }
  },

  closeMarketplace: () => {
    set({ marketplaceOpen: false })
  },

  loadMarketplace: async (forceRefresh) => {
    set({ marketplaceLoading: true, marketplaceError: null })
    try {
      const [catalog, installed] = await Promise.all([
        window.clui.fetchMarketplace(forceRefresh),
        window.clui.listInstalledPlugins(),
      ])
      if (catalog.error && catalog.plugins.length === 0) {
        set({ marketplaceError: catalog.error, marketplaceLoading: false })
        return
      }
      const installedSet = new Set(installed.map((n) => n.toLowerCase()))
      const pluginStates: Record<string, PluginStatus> = {}
      for (const p of catalog.plugins) {
        // For SKILL.md skills: match individual name against ~/.claude/skills/ dirs
        // For CLI plugins: match installName or "installName@marketplace" against installed_plugins.json
        const candidates = p.isSkillMd
          ? [p.installName]
          : [p.installName, `${p.installName}@${p.marketplace}`]
        const isInstalled = candidates.some((c) => installedSet.has(c.toLowerCase()))
        pluginStates[p.id] = isInstalled ? 'installed' : 'not_installed'
      }
      set({
        marketplaceCatalog: catalog.plugins,
        marketplaceInstalledNames: installed,
        marketplacePluginStates: pluginStates,
        marketplaceLoading: false,
      })
    } catch (err: unknown) {
      set({
        marketplaceError: err instanceof Error ? err.message : String(err),
        marketplaceLoading: false,
      })
    }
  },

  setMarketplaceSearch: (query) => {
    set({ marketplaceSearch: query })
  },

  setMarketplaceFilter: (filter) => {
    set({ marketplaceFilter: filter })
  },

  installMarketplacePlugin: async (plugin) => {
    set((s) => ({
      marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'installing' },
    }))
    const result = await window.clui.installPlugin(plugin.repo, plugin.installName, plugin.marketplace, plugin.sourcePath, plugin.isSkillMd)
    if (result.ok) {
      set((s) => ({
        marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'installed' as PluginStatus },
        marketplaceInstalledNames: [...s.marketplaceInstalledNames, plugin.installName],
      }))
    } else {
      set((s) => ({
        marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'failed' },
      }))
    }
  },

  uninstallMarketplacePlugin: async (plugin) => {
    const result = await window.clui.uninstallPlugin(plugin.installName)
    if (result.ok) {
      set((s) => ({
        marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'not_installed' as PluginStatus },
        marketplaceInstalledNames: s.marketplaceInstalledNames.filter((n) => n !== plugin.installName),
      }))
    }
  },

  buildYourOwn: () => {
    set({ marketplaceOpen: false, isExpanded: true })
    // Small delay to let the UI transition
    setTimeout(() => {
      get().enqueueDraft('Help me create a new Claude Code skill')
    }, 100)
  },

  loadDrafts: async (defaultDir) => {
    try {
      const drafts = await window.clui.loadWalkinalDrafts()
      if (!drafts.tabs || drafts.tabs.length === 0) return false

      const tabs = drafts.tabs.map((tab) => fromDraftTab(tab, defaultDir))
      const activeExists = tabs.some((tab) => tab.id === drafts.activeTabId)

      set({
        tabs,
        activeTabId: activeExists ? drafts.activeTabId : tabs[0].id,
      })
      return true
    } catch {
      return false
    }
  },

  persistDrafts: async () => {
    const { tabs, activeTabId } = get()
    const drafts: DraftsFile = {
      activeTabId,
      tabs: tabs.map(toDraftTab),
    }
    await window.clui.saveWalkinalDrafts(drafts)
  },

  closeTab: (tabId) => {
    window.clui.closeTab(tabId).catch(() => {})

    const s = get()
    const remaining = s.tabs.filter((t) => t.id !== tabId)

    if (s.activeTabId === tabId) {
      if (remaining.length === 0) {
        const newTab = makeLocalTab()
        set({ tabs: [newTab], activeTabId: newTab.id })
        scheduleDraftPersist(get)
        return
      }
      const closedIndex = s.tabs.findIndex((t) => t.id === tabId)
      const newActive = remaining[Math.min(closedIndex, remaining.length - 1)]
      set({ tabs: remaining, activeTabId: newActive.id })
    } else {
      set({ tabs: remaining })
    }
    scheduleDraftPersist(get)
  },

  clearTab: () => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, currentActivity: '', attachments: [], queueItems: [], sentEntries: [] }
          : t
      ),
    }))
    scheduleDraftPersist(get)
  },

  restoreHistoryEntry: async (entry) => {
    const defaultDir = entry.workingDirectory || get().staticInfo?.homePath || '~'
    const queueItems = queueItemsFromHistoryEntry(entry)

    try {
      const { tabId } = await window.clui.createTab()
      const tab: TabState = {
        ...makeLocalTab(),
        id: tabId,
        title: entry.title || 'Restored History',
        workingDirectory: defaultDir,
        hasChosenDirectory: defaultDir !== '~',
        queueItems,
      }
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        isExpanded: true,
      }))
      scheduleDraftPersist(get)
      return tabId
    } catch {
      const tab = makeLocalTab()
      tab.title = entry.title || 'Restored History'
      tab.workingDirectory = defaultDir
      tab.hasChosenDirectory = defaultDir !== '~'
      tab.queueItems = queueItems
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        isExpanded: true,
      }))
      scheduleDraftPersist(get)
      return tab.id
    }
  },

  enqueueDraft: (prompt) => {
    const { activeTabId } = get()
    const trimmed = prompt.trim()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              queueItems: [
                ...t.queueItems,
                ...(trimmed
                  ? [{
                      id: crypto.randomUUID(),
                      type: 'text' as const,
                      content: trimmed,
                      createdAt: Date.now(),
                    }]
                  : []),
                ...queueItemsFromAttachments(t.attachments),
              ],
              attachments: [],
            }
          : t
      ),
    }))
    scheduleDraftPersist(get)
  },

  sendQueuedItems: async (run) => {
    const { activeTabId, tabs, staticInfo } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab) return
    if (tab.status === 'running') return
    if (tab.queueItems.length === 0) return

    const resolvedPath = tab.hasChosenDirectory
      ? tab.workingDirectory
      : (staticInfo?.homePath || tab.workingDirectory || '~')
    const requestId = crypto.randomUUID()
    const steps = buildQueueSendSteps(tab.queueItems)
    const payload = buildQueuePayload(tab.queueItems)
    const imagePaths = collectImagePaths(tab.queueItems)
    debugLog('[walkinal] sendQueuedItems:steps', steps)
    if (steps.length === 0 && !payload && imagePaths.length === 0) return
    const hasCustomTitle = tab.title.trim().length > 0 && tab.title !== 'New Tab'
    const title = hasCustomTitle
      ? tab.title
      : deriveAutoTitle(tab.queueItems[0]?.content || tab.title || 'New Tab')

    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              status: 'running' as TabStatus,
              currentActivity: run ? 'Sending to Warp and running...' : 'Sending to Warp...',
              title,
            }
          : t
      ),
    }))

    try {
      const result = run
        ? await window.clui.sendWalkinalQueueAndRun({
            requestId,
            text: payload,
            imagePaths,
            steps,
            title,
            itemCount: tab.queueItems.length,
            workingDirectory: resolvedPath,
          })
        : await window.clui.sendWalkinalDraft({
            requestId,
            text: payload,
            imagePaths,
            steps,
            title,
            itemCount: tab.queueItems.length,
            workingDirectory: resolvedPath,
          })

      if (!result.ok) {
        throw new Error(result.error || `Failed to ${run ? 'send and run' : 'send'} queue`)
      }

      const sentItems = summarizeQueueForHistory(tab.queueItems)
      const historyId = crypto.randomUUID()
      const historyEntry: HistoryEntry = {
        id: historyId,
        timestamp: new Date().toISOString(),
        title,
        content: sentItems,
        itemCount: tab.queueItems.length,
        mode: run ? 'run' : 'draft',
        target: 'warp',
        ...(resolvedPath ? { workingDirectory: resolvedPath } : {}),
      }
      const sentEntry = makeSentEntry(historyId, title, sentItems, tab.queueItems.length, run ? 'run' : 'draft')

      await window.clui.appendWalkinalHistory({ entry: historyEntry })
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                status: 'completed' as TabStatus,
                currentActivity: '',
                attachments: [],
                queueItems: [],
                sentEntries: sentItems
                  ? capSentEntries([...t.sentEntries, sentEntry])
                  : t.sentEntries,
              }
            : t
        ),
      }))

      playNotificationIfHidden()
      scheduleDraftPersist(get)
    } catch (err: unknown) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                status: 'failed' as TabStatus,
                currentActivity: '',
                attachments: [],
                sentEntries: capSentEntries([
                ...t.sentEntries,
                  makeSentEntry(
                    crypto.randomUUID(),
                    t.title,
                    tab.queueItems.some((item) => item.type === 'screenshot')
                      ? `Image send failed: ${err instanceof Error ? err.message : String(err)}`
                      : `Error: ${err instanceof Error ? err.message : String(err)}`,
                    0,
                    'draft',
                  ),
                ]),
              }
            : t
        ),
      }))
      scheduleDraftPersist(get)
    }
  },

  removeQueueItem: (itemId) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, queueItems: t.queueItems.filter((item) => item.id !== itemId) }
          : t
      ),
    }))
    scheduleDraftPersist(get)
  },

  editQueueItem: (itemId) => {
    const { activeTabId, tabs } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    const item = tab?.queueItems.find((queueItem) => queueItem.id === itemId)
    if (!item) return null

    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, queueItems: t.queueItems.filter((queueItem) => queueItem.id !== itemId) }
          : t
      ),
    }))
    scheduleDraftPersist(get)

    return item.content
  },

  moveQueueItem: (itemId, direction) => {
    const { activeTabId } = get()

    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== activeTabId) return t

        const sourceIndex = t.queueItems.findIndex((item) => item.id === itemId)
        if (sourceIndex === -1) return t

        const targetIndex = direction === 'up' ? sourceIndex - 1 : sourceIndex + 1
        if (targetIndex < 0 || targetIndex >= t.queueItems.length) return t

        const nextItems = [...t.queueItems]
        const [moved] = nextItems.splice(sourceIndex, 1)
        nextItems.splice(targetIndex, 0, moved)

        return {
          ...t,
          queueItems: nextItems,
        }
      }),
    }))

    scheduleDraftPersist(get)
  },

  // ─── Directory management ───

  addDirectory: (dir) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              additionalDirs: t.additionalDirs.includes(dir)
                ? t.additionalDirs
                : [...t.additionalDirs, dir],
            }
          : t
      ),
    }))
    scheduleDraftPersist(get)
  },

  removeDirectory: (dir) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, additionalDirs: t.additionalDirs.filter((d) => d !== dir) }
          : t
      ),
    }))
    scheduleDraftPersist(get)
  },

  setBaseDirectory: (dir) => {
    const { activeTabId } = get()
    window.clui.resetTabSession(activeTabId)
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              workingDirectory: dir,
              hasChosenDirectory: true,
              additionalDirs: [],
            }
          : t
      ),
    }))
    scheduleDraftPersist(get)
  },

  // ─── Attachment management ───

  addAttachments: (attachments) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              attachments: [...t.attachments, ...attachments],
            }
          : t
      ),
    }))
    scheduleDraftPersist(get)
  },

  removeAttachment: (attachmentId) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, attachments: t.attachments.filter((attachment) => attachment.id !== attachmentId) }
          : t
      ),
    }))
    scheduleDraftPersist(get)
  },

  clearAttachments: () => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, attachments: [] }
          : t
      ),
    }))
    scheduleDraftPersist(get)
  },

}))
