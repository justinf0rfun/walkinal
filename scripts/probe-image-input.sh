#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 3 ]]; then
  echo "Usage: $0 /absolute/path/to/image.png [ctrl|cmd] [delay_seconds]" >&2
  exit 1
fi

IMAGE_PATH="$1"
MODIFIER="${2:-ctrl}"
DELAY_SECONDS="${3:-2}"

if [[ ! -f "$IMAGE_PATH" ]]; then
  echo "Image not found: $IMAGE_PATH" >&2
  exit 1
fi

if [[ "$MODIFIER" != "ctrl" && "$MODIFIER" != "cmd" ]]; then
  echo "Invalid modifier: $MODIFIER (expected ctrl or cmd)" >&2
  exit 1
fi

/usr/bin/osascript - "$IMAGE_PATH" "$MODIFIER" "$DELAY_SECONDS" <<'OSA'
on run argv
  set imagePath to item 1 of argv
  set modifierKey to item 2 of argv
  set delaySeconds to (item 3 of argv) as number

  delay delaySeconds

  set imageFile to POSIX file imagePath
  set the clipboard to (read imageFile as picture)
  delay 0.15

  tell application "System Events"
    if modifierKey is "ctrl" then
      keystroke "v" using control down
    else
      keystroke "v" using command down
    end if
  end tell
end run
OSA
