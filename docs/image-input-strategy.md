# Walkinal Image Input Strategy

## Goal

Define a single image-sending strategy for Walkinal that targets:

- `Claude Code`
- `Codex CLI`

without treating Warp as the AI target itself.

Warp is only the terminal shell. The real target is the CLI running inside it.

## Current State

### What already works

- Regular files can be attached in the input-area attachment strip.
- Regular files are sent as path references:

```text
[Attached file: /absolute/path/to/file]
```

- Images from three sources now share one queue semantic:
  - file picker image
  - pasted image
  - screenshot

### What does not work yet

- Image items are not reliably received by the target CLI as true image input.
- The current Warp bridge can execute successfully while the CLI still receives no image.
- Therefore "AppleScript success" is not equal to "image delivered to Claude Code / Codex CLI".

## Key Product Decision

Regular files and images must not use the same sending strategy.

### Regular files

Keep the current model:

- send file path only
- let the CLI/model decide whether to open or inspect the file

### Images

Do not downgrade images to:

- file path only
- text description only

Images must be treated as true image input whenever the target CLI supports it.

## Evidence

### Claude Code

Anthropic documents three supported image-input paths in Claude Code:

1. drag and drop image into Claude Code
2. paste image into the CLI with `Ctrl+V`
3. provide an image path for analysis

Important note from Anthropic: use `Ctrl+V`, not `Cmd+V`.

Source:

- <https://docs.anthropic.com/en/docs/claude-code/tutorials>

### Codex CLI

Two signals indicate real image support:

1. Local CLI help exposes `--image <FILE>...`
2. Real usage shows `Ctrl+V` image paste is accepted

Also, OpenAI Codex-family model docs explicitly show image input support.

Sources:

- local `codex --help`
- <https://developers.openai.com/api/docs/models/codex-mini-latest>
- <https://developers.openai.com/api/docs/models/gpt-5.3-codex>

## Product Direction

Walkinal should use one primary image strategy for both targets:

- primary strategy: clipboard-based image input

This aligns with real usage in:

- Claude Code
- Codex CLI

If clipboard image input proves unstable for one target, then that target can get a secondary fallback path.

## Recommended Architecture

### 1. Separate routing by item type

At send time:

- `text` -> text payload
- `file` -> file-path payload
- `image/screenshot` -> image-input payload

These must not be collapsed into one text-only string.

### 2. Keep source normalization

These three sources should remain normalized into one image attachment model:

- file picker image
- pasted image
- screenshot

Required fields:

- `path`
- `mimeType`
- `size`
- `dataUrl` when available

### 3. Define an image transport layer

Introduce a clear internal abstraction:

- `sendTextToCli(...)`
- `sendFilesToCli(...)`
- `sendImagesToCli(...)`

This keeps image-specific transport out of generic queue formatting.

## Recommended Implementation Order

### Phase 1: Strategy lock

Do not add more image-related UI before transport is stable.

First lock the contract:

- files use path references
- images use real image input

### Phase 2: Target capability verification

Manually verify for each target:

#### Claude Code

- paste one image via terminal with `Ctrl+V`
- confirm the input area shows image attachment behavior
- confirm Claude can describe the image

#### Codex CLI

- paste one image via terminal with `Ctrl+V`
- confirm Codex receives image input
- confirm Codex can describe the image

This phase is required before automating anything.

### Phase 3: Walkinal transport implementation

Once manual verification is stable:

- implement image clipboard injection in a way that reproduces real terminal behavior
- ensure the final keystroke sequence matches the target CLI expectations
- do not assume Warp itself is image-aware

### Phase 4: Fallback handling

If image input fails for a target:

- do not silently pretend success
- show an explicit failure state
- optionally offer fallback behavior such as:
  - keep image in attachment strip
  - send path reference only
  - ask user to paste manually

## Required Guardrails

### Do not treat image success as bridge success

A successful AppleScript / paste action is not enough.

Success should mean:

- the target CLI visibly received an image input
or
- the model can actually reason over image content

### Do not silently downgrade images to file paths

If image delivery fails, Walkinal must not pretend that:

- `/tmp/foo.png`

is equivalent to image input.

That is acceptable for regular files, not for images.

### Keep regular files simple

Do not overcomplicate file sending while solving image sending.

Regular files are already in a good place:

- stable
- low-risk
- useful for code and docs

## UI Expectations

### Attachment area

Input-area attachment chips should remain the primary staging area for:

- files
- screenshots
- pasted images

### Queue behavior

On queue or send:

- text and attachments are committed together
- attachments should preserve their type distinction internally

### Error behavior

If image delivery fails:

- show explicit failure
- keep the image available for retry if possible

## What Not To Do

- Do not build image sending around Warp AI.
- Do not assume image paste support just because text paste works.
- Do not merge files and images into one "attachment" transport path.
- Do not ship silent path-only fallback for images.

## Recommended Next Step

Before the next implementation step, run a focused manual verification matrix:

1. Claude Code + `Ctrl+V` image paste
2. Codex CLI + `Ctrl+V` image paste
3. Confirm whether the terminal app needs special key handling for image paste
4. Confirm visible UI signs that image input was accepted

Only after that should Walkinal automate the image transport path.
