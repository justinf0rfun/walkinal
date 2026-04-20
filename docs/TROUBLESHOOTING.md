# Troubleshooting

If setup fails, run this first:

```bash
npm run doctor
```

This checks your local environment and prints pass/fail status without changing your system.

## Install Fails with "gyp" or "make" Errors

Install Xcode Command Line Tools, then retry:

```bash
xcode-select --install
```

```bash
npm install
```

## Install Fails with `ModuleNotFoundError: No module named 'distutils'`

Python 3.12+ removed `distutils`. Install `setuptools`:

```bash
python3 -m pip install --upgrade pip setuptools
```

```bash
npm install
```

If that still fails, install Python 3.11 and point npm to it:

```bash
brew install python@3.11
```

```bash
npm config set python $(brew --prefix python@3.11)/bin/python3.11
```

```bash
npm install
```

To undo that Python override later:

```bash
npm config delete python
```

## Install Fails with `fatal error: 'functional' file not found`

C++ headers are missing/broken, usually due to Xcode CLT issues.

Check toolchain first:

```bash
xcode-select -p
```

```bash
xcrun --sdk macosx --show-sdk-path
```

If either command fails (or the error persists), reinstall CLT:

```bash
sudo rm -rf /Library/Developer/CommandLineTools
```

```bash
xcode-select --install
```

Then retry:

```bash
npm install
```

If CLT is installed but the error still appears on newer macOS versions, compile explicitly against the SDK include path:

```bash
SDK=$(xcrun --sdk macosx --show-sdk-path)
clang++ -std=c++17 -isysroot "$SDK" -I"$SDK/usr/include/c++/v1" -x c++ - -o /dev/null <<'EOF'
#include <functional>
int main() { return 0; }
EOF
```

## Install Fails on `node-pty`

`node-pty` is native and requires macOS toolchains. Confirm:

- macOS 13+
- Xcode CLT installed
- Python 3 with `setuptools`/`distutils` available

Then retry `npm install`.

## Queue Sends but Nothing Appears in Warp

Check these first:

- Warp is installed and already running
- The target Warp window is frontmost after send starts
- macOS Accessibility permission is granted to Walkinal / your dev Electron build

If sends still fail, run in dev mode and inspect logs:

```bash
CLUI_DEBUG=1 npm run dev
```

Also verify AppleScript automation works in Terminal:

```bash
osascript -e 'tell application "Warp" to activate'
```

## `⌥ + Space` Does Not Toggle

Grant Accessibility permissions:

- System Settings -> Privacy & Security -> Accessibility

Fallback shortcut:

- `Cmd+Shift+K`

## Packaged App Won't Open (Security Warning)

The `.app` built by `npm run dist` is unsigned. macOS Gatekeeper blocks unsigned apps by default.

To allow it:

1. Open **System Settings → Privacy & Security**
2. Scroll to the security section
3. Click **Open Anyway** next to the Walkinal message

You only need to do this once. This is a local build, not App Store distribution.

## Install Fails at Whisper Step

The installer requires Whisper for voice input. If it fails:

1. Make sure Homebrew is installed:

```bash
brew --version
```

If not, install it:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. Install Whisper manually:

```bash
# Apple Silicon (M1/M2/M3/M4) — preferred:
brew install whisperkit-cli
# Apple Silicon fallback, or Intel Mac:
brew install whisper-cpp
```

3. Rerun the installer:

```bash
./install-app.command
```

## Install Fails at Build Step

Run the steps manually to see the detailed error:

```bash
./commands/setup.command
```

```bash
npm run dist
```

If `npm run dist` fails, try a clean reinstall:

```bash
rm -rf node_modules
```

```bash
npm install
```

```bash
npm run dist
```

## Marketplace Shows "Failed to Load"

Expected when offline. Marketplace needs internet access; core app features continue to work.

## History Looks Empty After Changing Storage Folder

Walkinal stores `drafts.json`, `history.jsonl`, and `history-index.json` inside the configured storage folder.

If you switch folders, you are switching to a different local data set. Re-select the previous folder if you need the earlier drafts/history back.

## Window Is Invisible / No UI

Try:

- `⌥ + Space`
- `Cmd+Shift+K`
- Confirm app is running from the menu bar tray
