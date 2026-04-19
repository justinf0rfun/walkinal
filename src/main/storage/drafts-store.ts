import { mkdir, readFile, readdir, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { DraftsFile } from '../../shared/types'
import { log } from '../logger'

const EMPTY_DRAFTS: DraftsFile = {
  activeTabId: '',
  tabs: [],
}

export class DraftsStore {
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(private readonly getStorageDir: () => Promise<string>) {}

  async load(): Promise<DraftsFile> {
    const filePath = await this.getFilePath()
    await this.cleanupTmpFiles()
    try {
      const raw = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<DraftsFile>
      log('drafts-store', `load ok path=${filePath} tabs=${Array.isArray(parsed.tabs) ? parsed.tabs.length : 0}`)
      return {
        activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : '',
        tabs: Array.isArray(parsed.tabs) ? parsed.tabs : [],
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      log('drafts-store', `load empty path=${filePath} error=${message}`)
      return { ...EMPTY_DRAFTS }
    }
  }

  async save(drafts: DraftsFile): Promise<void> {
    this.saveQueue = this.saveQueue.then(async () => {
      const filePath = await this.getFilePath()
      const tempPath = await this.createTempPath('drafts.json')
      log('drafts-store', `save path=${filePath} tabs=${drafts.tabs.length} active=${drafts.activeTabId}`)
      await writeFile(tempPath, JSON.stringify(drafts, null, 2) + '\n', 'utf-8')
      await rename(tempPath, filePath)
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      log('drafts-store', `save error=${message}`)
    })

    await this.saveQueue
  }

  private async getFilePath(): Promise<string> {
    const storageDir = await this.getStorageDir()
    await mkdir(storageDir, { recursive: true })
    return join(storageDir, 'drafts.json')
  }

  private async getTmpDir(): Promise<string> {
    const storageDir = await this.getStorageDir()
    const tmpDir = join(storageDir, 'tmp')
    await mkdir(tmpDir, { recursive: true })
    return tmpDir
  }

  private async createTempPath(baseName: string): Promise<string> {
    const tmpDir = await this.getTmpDir()
    return join(tmpDir, `${baseName}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`)
  }

  private async cleanupTmpFiles(): Promise<void> {
    try {
      const tmpDir = await this.getTmpDir()
      const names = await readdir(tmpDir)
      await Promise.all(names
        .filter((name) => name.startsWith('drafts.json.') && name.endsWith('.tmp'))
        .map((name) => rm(join(tmpDir, name), { force: true })))
    } catch {}
  }
}
