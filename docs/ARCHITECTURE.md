# Walkinal Architecture

## Overview

Walkinal is a macOS Electron overlay for composing and sending queued input into a terminal session.

Today the implemented send target is **Warp**. The app is local-first: drafts, history, and config are persisted on disk, while the renderer talks to the main process through a typed preload bridge.

```
┌──────────────────────────────────────────────────────────────┐
│                     Renderer Process                         │
│  React 19 + Zustand 5 + Tailwind CSS 4 + Framer Motion      │
│                                                              │
│  TabStrip   ConversationView   InputBar   StatusBar          │
│  History    Settings           Marketplace                   │
│                                                              │
│                sessionStore (Zustand)                        │
│                       │                                      │
│          window.clui (legacy preload API name)              │
├──────────────────────────────────────────────────────────────┤
│                     Preload Script                            │
│  Typed IPC bridge via contextBridge                          │
├──────────────────────────────────────────────────────────────┤
│                     Main Process                              │
│                                                              │
│  BrowserWindow + tray + shortcuts                            │
│  ConfigStore / DraftsStore / HistoryStore                    │
│  Screenshot + file picker + voice transcription              │
│  Warp bridge (AppleScript automation)                        │
│  Marketplace fetch/install                                   │
└──────────────────────────────────────────────────────────────┘
```

## Main Process

### Window and shell

`src/main/index.ts` owns:

- the transparent always-on-top `BrowserWindow`
- tray menu setup
- global toggle shortcut
- click-through behavior for transparent regions
- manual drag handling for the frameless overlay

The native window stays at a fixed height. Expand/collapse happens inside the renderer.

### Storage

Walkinal persists local data through three stores:

- `src/main/storage/config-store.ts`
  Stores `config.json`, including the chosen storage directory.
- `src/main/storage/drafts-store.ts`
  Stores `drafts.json`, including tabs, queue, attachments, sent summaries, and active tab.
- `src/main/storage/history-store.ts`
  Stores append-only `history.jsonl` plus searchable `history-index.json`.

`history-index.json` is rebuilt if missing or invalid.

### Warp bridge

`src/main/warp-bridge.ts` sends queued content into Warp using AppleScript:

- text is pasted as text
- files are represented as path references
- images are pasted as image input
- ordered mixed-content sends use step-by-step paste instructions

Two send modes exist:

- `sendToWarpDraft()` for paste-only
- `sendToWarpAndRun()` for paste plus execution

### Attachments and voice

`src/main/index.ts` also handles:

- file picking
- screenshot capture via `/usr/sbin/screencapture`
- pasted image materialization into temp files
- local speech-to-text invocation for recorded audio

## Preload

`src/preload/index.ts` exposes a typed `window.clui` API.

The name is legacy, but it is still the supported internal bridge surface. Renderer code should keep using it unless a deliberate migration is planned.

The preload covers:

- startup and static diagnostics
- tab creation and close
- file/screenshot/directory dialogs
- config, drafts, and history operations
- queue send IPC
- theme and window controls
- marketplace operations

## Renderer

### State management

`src/renderer/stores/sessionStore.ts` holds:

- tab list and active tab
- attachments and queue items
- per-tab sent entries
- global draft bootstrap state
- marketplace state
- local config snapshot

This store is the main coordinator for:

- loading drafts on startup
- mapping attachments into queue items
- formatting queued content for send
- writing history after successful sends
- restoring history entries back into the queue

### Main UI pieces

- `App.tsx`
  Boots theme + draft state and renders the floating shell.
- `ConversationView.tsx`
  Shows queued items and recent sent entries for the active tab.
- `InputBar.tsx`
  Handles text entry, queueing, send/run actions, attachments, paste-image, and voice input.
- `HistoryPicker.tsx`
  Loads `history-index.json`, supports pagination, search, filtering, and preview.
- `SettingsPopover.tsx`
  Handles sound, full-width mode, storage directory, and theme controls.

## Data flow

### Startup

```
Renderer boot
  → window.clui.start()
  → sessionStore.loadWalkinalConfig()
  → sessionStore.loadDrafts()
  → restore tabs or create first tab
```

### Queue and send

```
User types / attaches content
  → InputBar
  → sessionStore.enqueueDraft()
  → queueItems stored on active tab
  → sessionStore.sendQueuedItems(run)
  → window.clui.sendWalkinal*()
  → main IPC handler
  → warp-bridge AppleScript automation
  → history append + sentEntries update
  → queue cleared and UI re-renders
```

### History

```
Successful send
  → HistoryStore.append(history.jsonl)
  → HistoryStore.updateIndex(history-index.json)
  → HistoryPicker loads index
  → import full entry on demand for preview or restore
```

## Compatibility notes

- Internal API names still use the `clui` prefix.
- Some debug env vars and temp filenames still use `CLUI` / `clui`.
- Marketplace capabilities are inherited from the fork and remain optional to the core send workflow.

## Current scope

This architecture reflects the current Walkinal implementation. Older documents in `docs/` that discuss Claude session orchestration or stream-json pipelines should be read as historical planning material unless they explicitly say otherwise.
