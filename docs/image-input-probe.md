# Image Input Probe

## Goal

Verify the real terminal-side image input behavior for:

- `Claude Code`
- `Codex CLI`

without touching Walkinal's production send flow.

This probe is intentionally separate from the main app logic.

## Why This Probe Exists

Walkinal already confirmed three facts:

1. Regular files should continue to use path references.
2. Images should not be downgraded to path-only semantics.
3. In real usage, both `Claude Code` and `Codex CLI` show image placeholders like:

```text
[Image #1]
```

That placeholder is the real success criterion.

AppleScript success alone is not enough.

## Probe Target

The probe only verifies:

- can a local image file be loaded into the system clipboard as an image
- can the currently frontmost terminal receive the image paste shortcut
- does the target CLI show an image placeholder after paste

It does **not**:

- integrate with Walkinal queue sending
- create or modify drafts/history behavior
- change normal file sending

## Probe Script

Script path:

- [scripts/probe-image-input.sh](/Users/justin/workspace/walkinal/scripts/probe-image-input.sh)

## Usage

### Default

Paste the image into the currently frontmost app using `Ctrl+V`:

```bash
./scripts/probe-image-input.sh /absolute/path/to/image.png
```

### Explicit modifier

Use `cmd` instead of `ctrl` if needed:

```bash
./scripts/probe-image-input.sh /absolute/path/to/image.png cmd
```

## Probe Procedure

1. Open the target terminal session
2. Put focus inside the active `Claude Code` or `Codex CLI` input area
3. Run the probe script from another terminal
4. Watch the target input area

## Expected Success Signal

Success is **not**:

- the script exits successfully
- the clipboard was set
- the keystroke was sent

Success is:

- the target CLI input visibly shows an image placeholder like:

```text
[Image #1]
```

## Expected Failure Modes

### Script-level failure

Examples:

- image path does not exist
- clipboard image load fails
- no frontmost app can be resolved

### Product-level failure

The script succeeds, but:

- nothing appears in the target input
- plain text is pasted instead of image input
- the terminal swallows the shortcut

This means terminal-side image input is still not working for that target.

## Decision Rule

### If probe succeeds in both Claude Code and Codex CLI

Then Walkinal can safely move toward:

- image-input transport integration
- a shared image-send strategy for both targets

### If probe succeeds in only one target

Then Walkinal should:

- keep a shared product model
- but split target-specific transport behavior later

### If probe fails in both

Then Walkinal should not pretend to support real image input yet.

At that point image sending should remain outside the production flow until a stable transport is found.
