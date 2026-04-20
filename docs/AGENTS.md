# Agent Guide — Walkinal

> This file is optimized for AI coding agents.
> For human-readable docs see [ARCHITECTURE.md](ARCHITECTURE.md).

## What This Project Is

Walkinal is a **macOS-only Electron overlay** for terminal-native AI workflows.

It is:

- a floating drafting surface
- a queue-first sender for text, files, and images
- a local-first companion for tools like `claude` and `codex`

It is not:

- a hosted chat product
- a browser app
- a replacement for the terminal itself

Current send target implementation is **Warp** via AppleScript automation.

## Quick Reference

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Dev mode | `npm run dev` |
| Build | `npm run build` |
| Package app | `npm run dist` |
| Doctor | `npm run doctor` |
| Toggle overlay | `⌥ + Space` (fallback: `Cmd+Shift+K`) |
| Debug logging | `CLUI_DEBUG=1 npm run dev` |

**Main-process changes require full restart.** Renderer changes hot reload.

## Architecture

```
Renderer (React 19 + Zustand 5 + Tailwind CSS 4)
    ↕  contextBridge IPC (src/preload/index.ts)
Main Process (Electron)
    ↕  local storage + Warp bridge + marketplace
Warp terminal session
```

### Layer Responsibilities

| Layer | Directory | Manages |
|-------|-----------|---------|
| **Renderer** | `src/renderer/` | tabs, queue UI, history UI, attachments, settings |
| **Preload** | `src/preload/` | typed IPC bridge (`window.clui`, legacy name) |
| **Main** | `src/main/` | window lifecycle, storage, file/screenshot handling, Warp send bridge, marketplace |

### Key Files by Concern

| Concern | File(s) |
|---------|---------|
| Main window and IPC handlers | `src/main/index.ts` |
| Warp send bridge | `src/main/warp-bridge.ts` |
| Draft persistence | `src/main/storage/drafts-store.ts` |
| Config persistence | `src/main/storage/config-store.ts` |
| History + history index | `src/main/storage/history-store.ts` |
| Shared types and IPC names | `src/shared/types.ts` |
| Renderer state store | `src/renderer/stores/sessionStore.ts` |
| Theme tokens | `src/renderer/theme.ts` |
| Main shell UI | `src/renderer/App.tsx` |
| Queue and sent history view | `src/renderer/components/ConversationView.tsx` |
| Input + attachments + voice | `src/renderer/components/InputBar.tsx` |

## Data Flow: Draft → Queue → Send

```
InputBar.tsx
  → sessionStore.enqueueDraft()
  → queueItems added to active tab
  → sessionStore.sendQueuedItems(run)
  → ipcRenderer.invoke(IPC.WALKINAL_QUEUE_SEND_* ...)
  → src/main/index.ts
  → src/main/warp-bridge.ts
  → AppleScript paste into Warp
  → history append + sentEntries update
  → React re-renders
```

## Canonical Types

All shared types live in `src/shared/types.ts`. Key ones:

- `TabState` — per-tab queue, attachments, working directory, sent history
- `QueueItem` — staged text/file/image item
- `HistoryEntry` — full persisted send record
- `HistoryIndexEntry` — lightweight searchable history summary
- `WalkinalConfig` — storage directory and terminal target
- `IPC` — const object of all IPC channel names

## Must Follow

1. `npm run build` must pass.
2. Use `IPC.*` constants for IPC channel names.
3. Use `useColors()` for renderer colors.
4. Add new preload methods in both `src/preload/index.ts` and `src/shared/types.ts`.
5. Keep renderer/main separation strict; cross only through preload IPC.
6. Preserve local-first behavior. Do not introduce network dependencies for core drafting/sending.

## Current Constraints

- `window.clui` is still the preload global name for compatibility. Do not rename it casually.
- IPC channel names still use the `clui:` prefix. Treat that as internal compatibility surface.
- Current terminal automation targets Warp only.
- Storage lives under the configured local storage directory and includes `drafts.json`, `history.jsonl`, `history-index.json`, and `tmp/`.

## Adding a Feature

### New IPC channel
1. Add it to `IPC` in `src/shared/types.ts`.
2. Handle it in `src/main/index.ts`.
3. Expose it from `src/preload/index.ts`.
4. Call it from renderer via `window.clui.*`.

### New persisted field
1. Add the type in `src/shared/types.ts`.
2. Update the corresponding storage file logic in `src/main/storage/`.
3. Update bootstrap/restore logic in `src/renderer/stores/sessionStore.ts`.

### New queue or send behavior
1. Model it in `QueueItem` / related types.
2. Update queue formatting logic in `sessionStore.ts`.
3. Update send bridge behavior in `src/main/warp-bridge.ts`.
4. Verify history persistence still records the result correctly.

## Common Pitfalls

1. Forgetting to restart `npm run dev` after main-process changes.
2. Breaking draft persistence by mutating renderer state without updating storage mapping.
3. Treating screenshots as text-only attachments instead of image-send steps.
4. Renaming `window.clui` or `clui:*` IPC prefixes without a deliberate migration plan.
5. Assuming this project still uses live Claude conversation state. It does not.
