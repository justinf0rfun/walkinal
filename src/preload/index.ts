import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type { Attachment, CatalogPlugin, DraftsFile, WalkinalConfig, HistoryEntry, HistoryIndexEntry, WalkinalHistoryAppendRequest, WalkinalHistoryIndexListRequest, WalkinalSendRequest, WalkinalSendResult } from '../shared/types'

export interface CluiAPI {
  // ─── Request-response (renderer → main) ───
  start(): Promise<{ version: string; auth: { email?: string; subscriptionType?: string; authMethod?: string }; mcpServers: string[]; projectPath: string; homePath: string }>
  createTab(): Promise<{ tabId: string }>
  closeTab(tabId: string): Promise<void>
  selectDirectory(): Promise<string | null>
  openExternal(url: string): Promise<boolean>
  openInTerminal(sessionId: string | null, projectPath?: string): Promise<boolean>
  attachFiles(): Promise<Attachment[] | null>
  takeScreenshot(): Promise<Attachment | null>
  pasteImage(dataUrl: string): Promise<Attachment | null>
  transcribeAudio(audioBase64: string): Promise<{ error: string | null; transcript: string | null }>
  getDiagnostics(): Promise<any>
  initSession(tabId: string): void
  resetTabSession(tabId: string): void
  fetchMarketplace(forceRefresh?: boolean): Promise<{ plugins: CatalogPlugin[]; error: string | null }>
  listInstalledPlugins(): Promise<string[]>
  installPlugin(repo: string, pluginName: string, marketplace: string, sourcePath?: string, isSkillMd?: boolean): Promise<{ ok: boolean; error?: string }>
  uninstallPlugin(pluginName: string): Promise<{ ok: boolean; error?: string }>
  getTheme(): Promise<{ isDark: boolean }>
  getWalkinalConfig(): Promise<WalkinalConfig>
  setWalkinalConfig(config: Partial<WalkinalConfig>): Promise<WalkinalConfig>
  loadWalkinalDrafts(): Promise<DraftsFile>
  saveWalkinalDrafts(drafts: DraftsFile): Promise<void>
  listWalkinalHistory(options?: { limit?: number; offset?: number }): Promise<HistoryEntry[]>
  listWalkinalHistoryIndex(options?: WalkinalHistoryIndexListRequest): Promise<HistoryIndexEntry[]>
  importWalkinalHistory(entryId: string): Promise<HistoryEntry | null>
  appendWalkinalHistory(request: WalkinalHistoryAppendRequest): Promise<void>
  sendWalkinalDraft(request: WalkinalSendRequest): Promise<WalkinalSendResult>
  sendWalkinalQueueAndRun(request: WalkinalSendRequest): Promise<WalkinalSendResult>
  sendWalkinalQueue(request: WalkinalSendRequest): Promise<WalkinalSendResult>
  onThemeChange(callback: (isDark: boolean) => void): () => void

  // ─── Window management ───
  resizeHeight(height: number): void
  setWindowWidth(width: number): void
  animateHeight(from: number, to: number, durationMs: number): Promise<void>
  hideWindow(): void
  isVisible(): Promise<boolean>
  /** OS-level click-through for transparent window regions */
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void
  /** Manual window drag for frameless windows */
  startWindowDrag(deltaX: number, deltaY: number): void
  /** Reset overlay to its default bottom-center position */
  resetWindowPosition(): void
  onSkillStatus(callback: (status: { name: string; state: string; error?: string; reason?: string }) => void): () => void
  onWindowShown(callback: () => void): () => void
}

const api: CluiAPI = {
  // ─── Request-response ───
  start: () => ipcRenderer.invoke(IPC.START),
  createTab: () => ipcRenderer.invoke(IPC.CREATE_TAB),
  closeTab: (tabId) => ipcRenderer.invoke(IPC.CLOSE_TAB, tabId),
  selectDirectory: () => ipcRenderer.invoke(IPC.SELECT_DIRECTORY),
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  openInTerminal: (sessionId, projectPath) => ipcRenderer.invoke(IPC.OPEN_IN_TERMINAL, { sessionId, projectPath }),
  attachFiles: () => ipcRenderer.invoke(IPC.ATTACH_FILES),
  takeScreenshot: () => ipcRenderer.invoke(IPC.TAKE_SCREENSHOT),
  pasteImage: (dataUrl) => ipcRenderer.invoke(IPC.PASTE_IMAGE, dataUrl),
  transcribeAudio: (audioBase64) => ipcRenderer.invoke(IPC.TRANSCRIBE_AUDIO, audioBase64),
  getDiagnostics: () => ipcRenderer.invoke(IPC.GET_DIAGNOSTICS),
  initSession: (tabId) => ipcRenderer.send(IPC.INIT_SESSION, tabId),
  resetTabSession: (tabId) => ipcRenderer.send(IPC.RESET_TAB_SESSION, tabId),
  fetchMarketplace: (forceRefresh) => ipcRenderer.invoke(IPC.MARKETPLACE_FETCH, { forceRefresh }),
  listInstalledPlugins: () => ipcRenderer.invoke(IPC.MARKETPLACE_INSTALLED),
  installPlugin: (repo, pluginName, marketplace, sourcePath, isSkillMd) =>
    ipcRenderer.invoke(IPC.MARKETPLACE_INSTALL, { repo, pluginName, marketplace, sourcePath, isSkillMd }),
  uninstallPlugin: (pluginName) =>
    ipcRenderer.invoke(IPC.MARKETPLACE_UNINSTALL, { pluginName }),
  getTheme: () => ipcRenderer.invoke(IPC.GET_THEME),
  getWalkinalConfig: () => ipcRenderer.invoke(IPC.WALKINAL_GET_CONFIG),
  setWalkinalConfig: (config) => ipcRenderer.invoke(IPC.WALKINAL_SET_CONFIG, config),
  loadWalkinalDrafts: () => ipcRenderer.invoke(IPC.WALKINAL_DRAFTS_LOAD),
  saveWalkinalDrafts: (drafts) => ipcRenderer.invoke(IPC.WALKINAL_DRAFTS_SAVE, drafts),
  listWalkinalHistory: (options) => ipcRenderer.invoke(IPC.WALKINAL_HISTORY_LIST, options),
  listWalkinalHistoryIndex: (options) => ipcRenderer.invoke(IPC.WALKINAL_HISTORY_INDEX_LIST, options),
  importWalkinalHistory: (entryId) => ipcRenderer.invoke(IPC.WALKINAL_HISTORY_IMPORT, entryId),
  appendWalkinalHistory: (request) => ipcRenderer.invoke(IPC.WALKINAL_HISTORY_APPEND, request),
  sendWalkinalDraft: (request) => ipcRenderer.invoke(IPC.WALKINAL_QUEUE_SEND_DRAFT, request),
  sendWalkinalQueueAndRun: (request) => ipcRenderer.invoke(IPC.WALKINAL_QUEUE_SEND_AND_RUN, request),
  sendWalkinalQueue: (request) => ipcRenderer.invoke(IPC.WALKINAL_QUEUE_SEND, request),
  onThemeChange: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, isDark: boolean) => callback(isDark)
    ipcRenderer.on(IPC.THEME_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.THEME_CHANGED, handler)
  },

  // ─── Window management ───
  resizeHeight: (height) => ipcRenderer.send(IPC.RESIZE_HEIGHT, height),
  animateHeight: (from, to, durationMs) =>
    ipcRenderer.invoke(IPC.ANIMATE_HEIGHT, { from, to, durationMs }),
  hideWindow: () => ipcRenderer.send(IPC.HIDE_WINDOW),
  isVisible: () => ipcRenderer.invoke(IPC.IS_VISIBLE),
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.send(IPC.SET_IGNORE_MOUSE_EVENTS, ignore, options || {}),
  startWindowDrag: (deltaX, deltaY) =>
    ipcRenderer.send(IPC.START_WINDOW_DRAG, deltaX, deltaY),
  resetWindowPosition: () => ipcRenderer.send(IPC.RESET_WINDOW_POSITION),
  setWindowWidth: (width) => ipcRenderer.send(IPC.SET_WINDOW_WIDTH, width),

  onSkillStatus: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, status: any) => callback(status)
    ipcRenderer.on(IPC.SKILL_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.SKILL_STATUS, handler)
  },

  onWindowShown: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.WINDOW_SHOWN, handler)
    return () => ipcRenderer.removeListener(IPC.WINDOW_SHOWN, handler)
  },
}

contextBridge.exposeInMainWorld('clui', api)
