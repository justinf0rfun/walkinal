export type TabStatus = 'connecting' | 'idle' | 'running' | 'completed' | 'failed' | 'dead'

export interface Attachment {
  id: string
  type: 'image' | 'file'
  name: string
  path: string
  mimeType?: string
  /** Base64 data URL for image previews */
  dataUrl?: string
  /** File size in bytes */
  size?: number
}

export interface TabState {
  id: string
  status: TabStatus
  hasUnread: boolean
  currentActivity: string
  title: string
  /** Working directory for this tab's Claude sessions */
  workingDirectory: string
  /** Whether the user explicitly chose a directory (vs. using default home) */
  hasChosenDirectory: boolean
  /** Extra directories accessible via --add-dir (session-preserving) */
  additionalDirs: string[]
  /** Pending attachments shown above the input bar */
  attachments: Attachment[]
  /** Walkinal draft queue items */
  queueItems: QueueItem[]
  /** Recent sent entries for this tab, persisted with drafts */
  sentEntries: SentEntry[]
}

// ─── Marketplace / Plugin Types ───

export type PluginStatus = 'not_installed' | 'checking' | 'installing' | 'installed' | 'failed'

export interface CatalogPlugin {
  id: string              // unique: `${repo}/${skillPath}` e.g. 'anthropics/skills/skills/xlsx'
  name: string            // from SKILL.md or plugin.json
  description: string     // from SKILL.md or plugin.json
  version: string         // from plugin.json or '0.0.0'
  author: string          // from plugin.json or marketplace entry
  marketplace: string     // marketplace name from marketplace.json
  repo: string            // 'anthropics/skills'
  sourcePath: string      // path within repo, e.g. 'skills/xlsx'
  installName: string     // individual skill name for SKILL.md skills, bundle name for CLI plugins
  category: string        // 'Agent Skills' | 'Knowledge Work' | 'Financial Services'
  tags: string[]          // Semantic use-case tags derived from name/description (e.g. 'Design', 'Finance')
  isSkillMd: boolean      // true = individual SKILL.md (direct install), false = CLI plugin (bundle install)
}

// ─── Walkinal Draft / History Types ───

export type QueueItemType = 'text' | 'file' | 'screenshot'

export interface QueueItem {
  id: string
  type: QueueItemType
  content: string
  createdAt: number
  metadata?: {
    filePath?: string
    fileName?: string
    mimeType?: string
    size?: number
    preview?: string
    dataUrl?: string
  }
}

export interface DraftTabState {
  id: string
  title: string
  attachments: Attachment[]
  queue: QueueItem[]
  sentEntries: SentEntry[]
  draftInput: string
  hasUnread: boolean
  workingDirectory: string
  additionalDirs: string[]
  lastSend?: {
    sentAt: number
    itemCount: number
    charCount: number
    target: 'warp'
  } | null
}

export interface DraftsFile {
  activeTabId: string
  tabs: DraftTabState[]
}

export interface HistoryEntry {
  id: string
  timestamp: string
  title: string
  content: string
  itemCount: number
  mode?: 'draft' | 'run'
  target: 'warp'
  workingDirectory?: string
  favorite?: boolean
  tags?: string[]
}

export interface HistoryIndexEntry {
  id: string
  timestamp: string
  title: string
  contentPreview: string
  itemCount: number
  mode: 'draft' | 'run'
  target: 'warp'
}

export interface SentEntry {
  id: string
  historyId: string
  timestamp: string
  title: string
  contentPreview: string
  itemCount: number
  mode: 'draft' | 'run'
}

export interface WalkinalConfig {
  storageDir: string
  terminalTarget: 'warp'
}

export interface WalkinalSendRequest {
  requestId: string
  text: string
  imagePaths?: string[]
  steps?: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; path: string }
  >
  title?: string
  itemCount: number
  workingDirectory?: string
}

export interface WalkinalSendResult {
  ok: boolean
  error?: string
}

export interface WalkinalHistoryAppendRequest {
  entry: HistoryEntry
}

export interface WalkinalHistoryIndexListRequest {
  limit?: number
  offset?: number
  query?: string
  mode?: 'all' | 'draft' | 'run'
}

// ─── IPC Channel Names ───

export const IPC = {
  // Request-response (renderer → main)
  START: 'clui:start',
  CREATE_TAB: 'clui:create-tab',
  CLOSE_TAB: 'clui:close-tab',
  SELECT_DIRECTORY: 'clui:select-directory',
  OPEN_EXTERNAL: 'clui:open-external',
  OPEN_IN_TERMINAL: 'clui:open-in-terminal',
  ATTACH_FILES: 'clui:attach-files',
  TAKE_SCREENSHOT: 'clui:take-screenshot',
  TRANSCRIBE_AUDIO: 'clui:transcribe-audio',
  PASTE_IMAGE: 'clui:paste-image',
  GET_DIAGNOSTICS: 'clui:get-diagnostics',
  INIT_SESSION: 'clui:init-session',
  RESET_TAB_SESSION: 'clui:reset-tab-session',
  ANIMATE_HEIGHT: 'clui:animate-height',

  // Window management
  RESIZE_HEIGHT: 'clui:resize-height',
  SET_WINDOW_WIDTH: 'clui:set-window-width',
  HIDE_WINDOW: 'clui:hide-window',
  WINDOW_SHOWN: 'clui:window-shown',
  SET_IGNORE_MOUSE_EVENTS: 'clui:set-ignore-mouse-events',
  START_WINDOW_DRAG: 'clui:start-window-drag',
  RESET_WINDOW_POSITION: 'clui:reset-window-position',
  IS_VISIBLE: 'clui:is-visible',

  // Skill provisioning (main → renderer)
  SKILL_STATUS: 'clui:skill-status',

  // Theme
  GET_THEME: 'clui:get-theme',
  THEME_CHANGED: 'clui:theme-changed',

  // Marketplace
  MARKETPLACE_FETCH: 'clui:marketplace-fetch',
  MARKETPLACE_INSTALLED: 'clui:marketplace-installed',
  MARKETPLACE_INSTALL: 'clui:marketplace-install',
  MARKETPLACE_UNINSTALL: 'clui:marketplace-uninstall',

  // Walkinal draft / history / bridge
  WALKINAL_GET_CONFIG: 'clui:walkinal-get-config',
  WALKINAL_SET_CONFIG: 'clui:walkinal-set-config',
  WALKINAL_DRAFTS_LOAD: 'clui:walkinal-drafts-load',
  WALKINAL_DRAFTS_SAVE: 'clui:walkinal-drafts-save',
  WALKINAL_HISTORY_LIST: 'clui:walkinal-history-list',
  WALKINAL_HISTORY_IMPORT: 'clui:walkinal-history-import',
  WALKINAL_HISTORY_APPEND: 'clui:walkinal-history-append',
  WALKINAL_HISTORY_INDEX_LIST: 'clui:walkinal-history-index-list',
  WALKINAL_QUEUE_SEND_DRAFT: 'clui:walkinal-queue-send-draft',
  WALKINAL_QUEUE_SEND_AND_RUN: 'clui:walkinal-queue-send-and-run',
  WALKINAL_QUEUE_SEND: 'clui:walkinal-queue-send',
} as const
