# Walkinal

Walkinal is a macOS floating input companion for terminal-native AI workflows.

This project is a fork of [lcoutodemos/clui-cc](https://github.com/lcoutodemos/clui-cc). It keeps parts of the original Electron overlay foundation, while changing the product model from a Claude conversation shell into a queue-first terminal AI input companion.

Instead of acting as a chat client, Walkinal lets you stage text, files, and images in a queue, then send them into a terminal session running tools like:

- `Claude Code`
- `Codex CLI`

Its core workflow is:

```text
draft -> queue -> send -> send and run
```

## What It Is

Walkinal is:

- a macOS-only Electron overlay
- a local-first drafting and sending tool
- a companion for terminal-based AI agents

Walkinal is not:

- a standalone hosted AI product
- a web chat app
- a replacement for `Claude Code` or `Codex CLI`

## Product Model

Each tab has three distinct layers:

1. **Attachments**
   Files, screenshots, and pasted images are staged above the input bar.

2. **Draft Queue**
   Press `Enter` or click `Queue` to turn current input and attachments into queued items.

3. **Sent History**
   Sent items are stored per tab and globally, so recent sends remain visible and recoverable.

## Core Actions

- `Queue`
  Add current text and attachments to the draft queue.

- `Send`
  Send the queued content into the terminal without executing.

- `Run`
  Send the queued content and execute immediately.

Keyboard shortcuts:

- `Enter` → Queue
- `Cmd+Enter` → Run

## Features

- **Floating overlay**
  Transparent always-on-top macOS panel. Toggle with `⌥ + Space` (fallback: `Cmd+Shift+K`).

- **Multi-tab workflow**
  Each tab keeps its own draft queue, sent history, working directory, and attachments.

- **Queue-first composition**
  Draft multiple text blocks before sending anything.

- **File-aware sending**
  Regular files are sent as path references, which works well for code and local documents.

- **Image input support**
  Images from file picker, paste, and screenshots are normalized into one image flow and can be sent as real image input to supported terminal agents.

- **Per-tab sent history**
  Recent sends are kept with the tab for continuity after restart.

- **Global local history**
  Full send history is stored locally and can be browsed, searched, filtered, previewed, and restored.

- **Draft persistence**
  Tabs, draft queues, attachments, and sent summaries survive app restarts.

- **Storage directory configuration**
  You can move Walkinal data to a custom local folder.

- **Voice input**
  Local speech-to-text via Whisper.

- **Skills marketplace**
  Marketplace support from the original project is still available.

- **Dark / light theme**
  Theme follows the existing system in the app.

## Send Semantics

Walkinal currently treats content types differently on purpose:

- **Text**
  Sent as text.

- **Regular files**
  Sent as file path references, for example:

  ```text
  [Attached file: /absolute/path/to/file]
  ```

- **Images**
  Sent through image-input behavior for terminal tools that support pasted image input, rather than being downgraded to plain path text.

## Local Storage

Walkinal stores local data in the configured storage directory, including:

- `config.json`
- `drafts.json`
- `history.jsonl`
- `history-index.json`
- `tmp/`

`tmp/` is used for atomic writes and temporary storage internals.

## Install

The quickest path is:

1. Clone the repo
2. Double-click `install-app.command`

This flow:

- installs dependencies
- checks required tools
- builds the app
- copies it into `/Applications`
- launches it

> Because the app is unsigned, macOS may require manual approval on first launch.

## Development

### Install dependencies

```bash
npm install
```

### Start development mode

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Package app

```bash
npm run dist
```

### Doctor / environment check

```bash
npm run doctor
```

## Development Notes

- Renderer changes hot reload.
- Main-process changes require restarting `npm run dev`.
- The project is currently macOS-only.

## Runtime Requirements

You need:

- macOS
- Node.js
- Python tooling for native module builds
- terminal AI tools you want to drive, such as:
  - `claude`
  - `codex`

For voice input, install one of:

- `whisperkit-cli`
- `whisper-cpp`

## Architecture

Current high-level flow:

```text
React renderer
  -> preload bridge (window.clui)
  -> Electron main process
  -> local storage + Warp/terminal bridge
  -> terminal session running Claude Code / Codex CLI
```

Unlike the original Clui CC interaction model, Walkinal no longer centers the product around a live Claude conversation timeline. It is centered around:

- composing input
- sending into terminal agents
- preserving local drafts and history

See:

- [docs/walkinal-technical-plan.md](docs/walkinal-technical-plan.md)
- [docs/performance-optimization-plan.md](docs/performance-optimization-plan.md)
- [docs/development-workflow.md](docs/development-workflow.md)

## Troubleshooting

Use:

```bash
npm run doctor
```

For more detail, see:

- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## Current Scope

Walkinal is already suitable for:

- queueing text
- sending files and images
- sending mixed content in queue order
- restoring tab state after restart
- browsing local history

It is still an actively iterated local tool, not a finished packaged product with broad platform support.

## License

[MIT](LICENSE)
