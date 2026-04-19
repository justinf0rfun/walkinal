import { execFile } from 'child_process'
import type { WalkinalSendResult } from '../shared/types'
import { log } from './logger'

export interface SendToWarpInput {
  requestId?: string
  text: string
  imagePaths?: string[]
  steps?: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; path: string }
  >
}

function runOsaScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', script], (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || stdout || err.message || '').trim()
        reject(new Error(detail || err.message))
      }
      else resolve()
    })
  })
}

function escapeAppleScript(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

function buildWarpTargetPrelude(escapedText: string): string {
  return `set warpBundleIds to {"dev.warp.Warp-Stable", "dev.warp.Warp-Preview", "dev.warp.Warp-Nightly", "dev.warp.Warp"}
set targetBundleId to missing value

tell application "System Events"
  repeat with bundleId in warpBundleIds
    if (count of (application processes whose bundle identifier is (bundleId as text))) > 0 then
      set targetBundleId to (bundleId as text)
      exit repeat
    end if
  end repeat
end tell

if targetBundleId is missing value then
  error "No running Warp application process found"
end if

tell application id targetBundleId
activate
delay 0.35
set the clipboard to "${escapedText}"
delay 0.15
end tell
tell application "System Events"
  if (count of (application processes whose bundle identifier is targetBundleId)) is 0 then
    error "Warp process disappeared before paste"
  end if
  tell first application process whose bundle identifier is targetBundleId
    set frontmost to true
    delay 0.15
    keystroke "v" using command down`
}

function buildWarpTargetDiscovery(): string {
  return `set warpBundleIds to {"dev.warp.Warp-Stable", "dev.warp.Warp-Preview", "dev.warp.Warp-Nightly", "dev.warp.Warp"}
set targetBundleId to missing value

tell application "System Events"
  repeat with bundleId in warpBundleIds
    if (count of (application processes whose bundle identifier is (bundleId as text))) > 0 then
      set targetBundleId to (bundleId as text)
      exit repeat
    end if
  end repeat
end tell

if targetBundleId is missing value then
  error "No running Warp application process found"
end if

tell application id targetBundleId
activate
delay 0.35
end tell

tell application "System Events"
  if (count of (application processes whose bundle identifier is targetBundleId)) is 0 then
    error "Warp process disappeared before paste"
  end if
  tell first application process whose bundle identifier is targetBundleId
    set frontmost to true
    delay 0.15`
}

function buildPasteImageCommands(imagePaths: string[]): string {
  if (imagePaths.length === 0) return ''
  const escapedPaths = imagePaths.map((path) => `"${escapeAppleScript(path)}"`).join(', ')
  return `
end tell
end tell

repeat with imagePath in {${escapedPaths}}
  set imageFile to POSIX file (imagePath as text)
  set the clipboard to (read imageFile as picture)
  delay 0.2

  tell application "System Events"
    keystroke "v" using control down
  end tell
  delay 0.35
end repeat

tell application "System Events"
  tell first application process whose bundle identifier is targetBundleId`
}

function buildPasteOrderedStepCommands(steps: Array<{ type: 'text'; text: string } | { type: 'image'; path: string }>): string {
  if (steps.length === 0) return ''

  const commands = steps.map((step) => {
    if (step.type === 'image') {
      return `
end tell
end tell

set imageFile to POSIX file "${escapeAppleScript(step.path)}"
set the clipboard to (read imageFile as picture)
delay 0.2

tell application "System Events"
  keystroke "v" using control down
end tell
delay 0.35

tell application "System Events"
  tell first application process whose bundle identifier is targetBundleId`
    }

    return `
    set the clipboard to "${escapeAppleScript(step.text)}"
    delay 0.15
    keystroke "v" using command down
    delay 0.2`
  }).join('')

  return commands
}

function logOrderedSteps(requestId: string, steps: Array<{ type: 'text'; text: string } | { type: 'image'; path: string }>): void {
  steps.forEach((step, index) => {
    if (step.type === 'image') {
      log('warp-bridge', `sendToWarpDraft:step requestId=${requestId} index=${index} type=image path=${step.path}`)
    } else {
      const preview = step.text.length > 80 ? `${step.text.slice(0, 77)}...` : step.text
      log('warp-bridge', `sendToWarpDraft:step requestId=${requestId} index=${index} type=text text=${preview}`)
    }
  })
}

export async function sendToWarpDraft(input: SendToWarpInput): Promise<WalkinalSendResult> {
  if (!input.text.trim() && (input.imagePaths?.length ?? 0) === 0 && (input.steps?.length ?? 0) === 0) {
    return { ok: false, error: 'Cannot send empty text to Warp' }
  }

  const requestId = input.requestId || 'unknown'
  const imageCount = input.imagePaths?.length ?? 0
  const stepCount = input.steps?.length ?? 0
  log('warp-bridge', `sendToWarpDraft:start requestId=${requestId} chars=${input.text.length} images=${imageCount} steps=${stepCount}`)

  if (stepCount > 0) {
    logOrderedSteps(requestId, input.steps || [])
    const script = `${buildWarpTargetDiscovery()}${buildPasteOrderedStepCommands(input.steps || [])}
  end tell
end tell
`

    try {
      await runOsaScript(script)
      log('warp-bridge', `sendToWarpDraft:success requestId=${requestId}`)
      return { ok: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      log('warp-bridge', `sendToWarpDraft:error requestId=${requestId} message=${message}`)
      return {
        ok: false,
        error: message,
      }
    }
  }

  const escaped = escapeAppleScript(input.text)
  const hasText = input.text.length > 0
  const script = imageCount > 0 || !hasText
    ? `${buildWarpTargetDiscovery()}${buildPasteImageCommands(input.imagePaths || [])}${hasText ? `
    set the clipboard to "${escaped}"
    delay 0.15
    keystroke "v" using command down` : ''}
  end tell
end tell
`
    : `${buildWarpTargetPrelude(escaped)}
  end tell
end tell
`

  try {
    await runOsaScript(script)
    log('warp-bridge', `sendToWarpDraft:success requestId=${requestId}`)
    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    log('warp-bridge', `sendToWarpDraft:error requestId=${requestId} message=${message}`)
    return {
      ok: false,
      error: message,
    }
  }
}

export async function sendToWarpAndRun(input: SendToWarpInput): Promise<WalkinalSendResult> {
  const requestId = input.requestId || 'unknown'
  log('warp-bridge', `sendToWarpAndRun:start requestId=${requestId} chars=${input.text.length} images=${input.imagePaths?.length ?? 0}`)

  const draftResult = await sendToWarpDraft(input)
  if (!draftResult.ok) return draftResult

  const script = `set warpBundleIds to {"dev.warp.Warp-Stable", "dev.warp.Warp-Preview", "dev.warp.Warp-Nightly", "dev.warp.Warp"}
set targetBundleId to missing value

tell application "System Events"
  repeat with bundleId in warpBundleIds
    if (count of (application processes whose bundle identifier is (bundleId as text))) > 0 then
      set targetBundleId to (bundleId as text)
      exit repeat
    end if
  end repeat
end tell

if targetBundleId is missing value then
  error "No running Warp application process found"
end if

tell application "System Events"
  tell first application process whose bundle identifier is targetBundleId
    -- Warp's universal input often needs a beat after paste before submit.
    delay 0.35
    keystroke return
  end tell
end tell
`

  try {
    await runOsaScript(script)
    log('warp-bridge', `sendToWarpAndRun:success requestId=${requestId}`)
    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    log('warp-bridge', `sendToWarpAndRun:error requestId=${requestId} message=${message}`)
    return {
      ok: false,
      error: message,
    }
  }
}
