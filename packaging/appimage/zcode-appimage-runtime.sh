#!/usr/bin/env bash
# zcode-appimage-runtime.sh — helper invoked from inside the AppImage to
# locate the mounted AppDir and delegate to the app's start.sh.
# (AppRun is the primary entry; this mirrors codex-desktop-linux's layout.)
SELF="$(readlink -f "${BASH_SOURCE[0]:-$0}")"
APPDIR="${APPDIR:-$(dirname "$(dirname "$SELF")")}"
exec "$APPDIR/opt/zcode-desktop/start.sh" "$@"
