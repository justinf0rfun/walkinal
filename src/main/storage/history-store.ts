import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { HistoryEntry, HistoryIndexEntry, WalkinalHistoryIndexListRequest } from '../../shared/types'

function makeContentPreview(content: string, maxLength = 300): string {
  const trimmed = content.trim()
  return trimmed.length > maxLength ? `${trimmed.substring(0, maxLength - 3)}...` : trimmed
}

function toHistoryIndexEntry(entry: HistoryEntry): HistoryIndexEntry {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    title: entry.title,
    contentPreview: makeContentPreview(entry.content),
    itemCount: entry.itemCount,
    mode: entry.mode || 'run',
    target: entry.target,
  }
}

function isHistoryIndexEntry(value: unknown): value is HistoryIndexEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.id === 'string'
    && typeof entry.timestamp === 'string'
    && typeof entry.title === 'string'
    && typeof entry.contentPreview === 'string'
    && typeof entry.itemCount === 'number'
    && (entry.mode === 'draft' || entry.mode === 'run')
    && entry.target === 'warp'
}

export class HistoryStore {
  private appendQueue: Promise<void> = Promise.resolve()

  constructor(private readonly getStorageDir: () => Promise<string>) {}

  async list(options?: { limit?: number; offset?: number }): Promise<HistoryEntry[]> {
    const filePath = await this.getFilePath()
    if (!existsSync(filePath)) return []

    const raw = await readFile(filePath, 'utf-8')
    const entries = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as HistoryEntry
        } catch {
          return null
        }
      })
      .filter((entry): entry is HistoryEntry => entry !== null)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const offset = Math.max(0, options?.offset ?? 0)
    const limit = options?.limit
    if (typeof limit === 'number' && limit >= 0) {
      return entries.slice(offset, offset + limit)
    }
    return entries.slice(offset)
  }

  async get(entryId: string): Promise<HistoryEntry | null> {
    const entries = await this.list()
    return entries.find((entry) => entry.id === entryId) || null
  }

  async listIndex(options?: WalkinalHistoryIndexListRequest): Promise<HistoryIndexEntry[]> {
    const entries = await this.loadIndex()
    const query = options?.query?.trim().toLowerCase() || ''
    const mode = options?.mode || 'all'
    const filtered = entries.filter((entry) => {
      if (mode !== 'all' && entry.mode !== mode) return false
      if (!query) return true
      return entry.title.toLowerCase().includes(query)
        || entry.contentPreview.toLowerCase().includes(query)
    })

    const offset = Math.max(0, options?.offset ?? 0)
    const limit = options?.limit
    if (typeof limit === 'number' && limit >= 0) {
      return filtered.slice(offset, offset + limit)
    }
    return filtered.slice(offset)
  }

  async append(entry: HistoryEntry): Promise<void> {
    this.appendQueue = this.appendQueue.then(async () => {
      const filePath = await this.getFilePath()
      await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf-8')
      const index = await this.loadIndex()
      index.unshift(toHistoryIndexEntry(entry))
      await this.saveIndex(index)
    })
    await this.appendQueue
  }

  private async getFilePath(): Promise<string> {
    const storageDir = await this.getStorageDir()
    await mkdir(storageDir, { recursive: true })
    return join(storageDir, 'history.jsonl')
  }

  private async getIndexPath(): Promise<string> {
    const storageDir = await this.getStorageDir()
    await mkdir(storageDir, { recursive: true })
    return join(storageDir, 'history-index.json')
  }

  private async loadIndex(): Promise<HistoryIndexEntry[]> {
    await this.cleanupTmpFiles()
    const indexPath = await this.getIndexPath()
    if (existsSync(indexPath)) {
      try {
        const raw = await readFile(indexPath, 'utf-8')
        const parsed = JSON.parse(raw) as HistoryIndexEntry[]
        if (Array.isArray(parsed) && parsed.every(isHistoryIndexEntry)) {
          return parsed
        }
      } catch {
        // Fall through to rebuild from history if index is missing/corrupt.
      }
    }

    const rebuilt = await this.rebuildIndex()
    return rebuilt
  }

  private async saveIndex(entries: HistoryIndexEntry[]): Promise<void> {
    const indexPath = await this.getIndexPath()
    const tempPath = await this.createTempPath('history-index.json')
    await writeFile(tempPath, JSON.stringify(entries, null, 2) + '\n', 'utf-8')
    await rename(tempPath, indexPath)
  }

  private async rebuildIndex(): Promise<HistoryIndexEntry[]> {
    const rebuilt = (await this.list()).map(toHistoryIndexEntry)
    await this.saveIndex(rebuilt)
    return rebuilt
  }

  private async getTmpDir(): Promise<string> {
    const storageDir = await this.getStorageDir()
    const tmpDir = join(storageDir, 'tmp')
    await mkdir(tmpDir, { recursive: true })
    return tmpDir
  }

  private async createTempPath(baseName: string): Promise<string> {
    const tmpDir = await this.getTmpDir()
    return join(tmpDir, `${baseName}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`)
  }

  private async cleanupTmpFiles(): Promise<void> {
    try {
      const tmpDir = await this.getTmpDir()
      const names = await readdir(tmpDir)
      await Promise.all(names
        .filter((name) => name.startsWith('history-index.json.') && name.endsWith('.tmp'))
        .map((name) => rm(join(tmpDir, name), { force: true })))
    } catch {}
  }
}
