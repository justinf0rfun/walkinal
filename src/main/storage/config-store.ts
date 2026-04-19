import { mkdir, readFile, readdir, rename, rm, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type { WalkinalConfig } from '../../shared/types'

const DEFAULT_STORAGE_DIR = join(homedir(), 'Documents', 'Walkinal')
const LOCATOR_DIR = join(homedir(), '.walkinal')
const LOCATOR_FILE = join(LOCATOR_DIR, 'storage-dir.json')
const DEFAULT_CONFIG: WalkinalConfig = {
  storageDir: DEFAULT_STORAGE_DIR,
  terminalTarget: 'warp',
}

export class ConfigStore {
  async getConfig(): Promise<WalkinalConfig> {
    const storageDir = await this.getStorageDir()
    const filePath = this.getConfigPath(storageDir)
    try {
      const raw = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<WalkinalConfig>
      return {
        storageDir: parsed.storageDir || storageDir,
        terminalTarget: parsed.terminalTarget === 'warp' ? 'warp' : DEFAULT_CONFIG.terminalTarget,
      }
    } catch {
      return { ...DEFAULT_CONFIG, storageDir }
    }
  }

  async updateConfig(partial: Partial<WalkinalConfig>): Promise<WalkinalConfig> {
    const currentStorageDir = await this.getStorageDir()
    const next = {
      ...(await this.getConfig()),
      ...partial,
    }
    await mkdir(next.storageDir, { recursive: true })
    if (currentStorageDir !== next.storageDir) {
      await this.migrateStorageFiles(currentStorageDir, next.storageDir)
    }
    await writeFile(this.getConfigPath(next.storageDir), JSON.stringify(next, null, 2) + '\n', 'utf-8')
    await this.writeLocator(next.storageDir)
    if (currentStorageDir !== next.storageDir) {
      try { await rm(this.getConfigPath(currentStorageDir), { force: true }) } catch {}
    }
    return next
  }

  async ensureStorageDir(): Promise<string> {
    const storageDir = await this.getStorageDir()
    await mkdir(storageDir, { recursive: true })
    return storageDir
  }

  private async getStorageDir(): Promise<string> {
    try {
      const raw = await readFile(LOCATOR_FILE, 'utf-8')
      const parsed = JSON.parse(raw) as { storageDir?: string }
      if (parsed.storageDir && parsed.storageDir.startsWith('/')) {
        return parsed.storageDir
      }
    } catch {}

    try {
      const raw = await readFile(this.getConfigPath(DEFAULT_STORAGE_DIR), 'utf-8')
      const parsed = JSON.parse(raw) as Partial<WalkinalConfig>
      if (parsed.storageDir && parsed.storageDir.startsWith('/')) {
        return parsed.storageDir
      }
    } catch {}

    return DEFAULT_STORAGE_DIR
  }

  private async writeLocator(storageDir: string): Promise<void> {
    await mkdir(LOCATOR_DIR, { recursive: true })
    await writeFile(LOCATOR_FILE, JSON.stringify({ storageDir }, null, 2) + '\n', 'utf-8')
  }

  private async migrateStorageFiles(fromDir: string, toDir: string): Promise<void> {
    if (fromDir === toDir) return

    const fileNames = ['drafts.json', 'history.jsonl', 'history-index.json']
    for (const fileName of fileNames) {
      const fromPath = join(fromDir, fileName)
      const toPath = join(toDir, fileName)
      try {
        await rename(fromPath, toPath)
      } catch {
        // Best-effort migration: leave existing data in place if move fails.
      }
    }

    const fromTmpDir = join(fromDir, 'tmp')
    const toTmpDir = join(toDir, 'tmp')
    try {
      await mkdir(toTmpDir, { recursive: true })
      const tmpNames = await readdir(fromTmpDir)
      for (const name of tmpNames) {
        try {
          await rename(join(fromTmpDir, name), join(toTmpDir, name))
        } catch {
          // Best-effort migration for tmp contents as well.
        }
      }
      try { await rm(fromTmpDir, { recursive: true, force: true }) } catch {}
    } catch {
      // Ignore missing tmp dir or migration failures.
    }
  }

  private getConfigPath(storageDir: string): string {
    return join(storageDir, 'config.json')
  }
}
