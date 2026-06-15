#!/usr/bin/env bash
# zcode-linux — ZCode macOS DMG → Linux Electron app conversion entry point.
#
# This script drives the conversion pipeline. Each stage lives in scripts/lib/*.sh
# and is sourced as it is implemented across commits. See README.md and the plan.
#
# IMPORTANT: This tool does NOT redistribute Z.ai software. It fetches the upstream
# DMG from Z.ai's CDN at build time and automates a conversion the user could do
# by hand on their own copy.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── defaults (overridable via env) ──────────────────────────────────────────
: "${ZCODE_APP_ID:=ai.zai.zcode}"
: "${ZCODE_APP_DISPLAY_NAME:=ZCode}"
: "${ZCODE_VERSION:=$(python3 - "$SCRIPT_DIR" <<'PY'
# version detection implemented in C2; fall back to a known-good version
import sys
print("3.0.1")
PY
)}"
: "${ZCODE_INSTALL_DIR:=$SCRIPT_DIR/codex-app}"
: "${ZCODE_UPSTREAM_DMG_BASE:=https://cdn.zcode-ai.com/zcode/electron/releases}"

# ── flags parsed by main() ──────────────────────────────────────────────────
INSPECT=0
FRESH=0
FETCH_ONLY=0
EXTRACT_ONLY=0
PACKAGE_ONLY=0
PROVIDED_DMG_PATH=""
REPORT_DIR="$SCRIPT_DIR"

usage() {
	cat <<EOF
zcode-linux — ZCode macOS DMG → Linux Electron app converter

使い方:
  ./install.sh [options] [DMG_PATH]

Options:
  --inspect          Inspect only: analyze app.asar, write inspect-report.json, do not convert
  --fresh            Discard the cached DMG and re-fetch
  --fetch-only       Only download (cache) the upstream DMG, then exit
  --extract-only     Only extract the .app from the DMG, then exit
  --package-only     Only package an already-built codex-app/, then exit
  --report-dir DIR   Where to write reports (default: repo root)
  --install-dir DIR  Where to generate the app (default: ./codex-app)
  -h, --help         Show this help

Environment:
  ZCODE_UPSTREAM_DMG_URL   Override the upstream DMG URL entirely
  ZCODE_VERSION            Pin an upstream version (default: auto / fallback 3.0.1)
  ZCODE_INSTALL_DIR        Generated app directory (default: ./codex-app)
  ELECTRON_MIRROR          Mirror root for the Linux Electron download

Disclaimer:
  Unofficial. Does not redistribute Z.ai software. Fetches the upstream DMG at
  build time and automates a conversion performed on the user's own copy.
EOF
}

# ── helpers (filled out across commits) ─────────────────────────────────────
info()  { printf '\033[1;34m[zcode]\033[0m %s\n' "$*" >&2; }
warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
die()   { error "$*"; exit 1; }

# Source a pipeline library if it exists (lets stages land incrementally).
load_lib() {
	local name="$1"
	local lib="$SCRIPT_DIR/scripts/lib/$name.sh"
	[ -f "$lib" ] && { # shellcheck disable=SC1090
		source "$lib"
	}
}

# ── main ────────────────────────────────────────────────────────────────────
main() {
	while [ $# -gt 0 ]; do
		case "$1" in
			-h|--help) usage; exit 0 ;;
			--inspect) INSPECT=1 ;;
			--fresh) FRESH=1 ;;
			--fetch-only) FETCH_ONLY=1 ;;
			--extract-only) EXTRACT_ONLY=1 ;;
			--package-only) PACKAGE_ONLY=1 ;;
			--report-dir) REPORT_DIR="${2:-}"; shift ;;
			--install-dir) ZCODE_INSTALL_DIR="${2:-}"; shift ;;
			--) shift; break ;;
			-*) die "unknown option: $1 (try --help)" ;;
			*) PROVIDED_DMG_PATH="$1" ;;
		esac
		shift
	done

	load_lib install-helpers
	load_lib dmg
	load_lib inspect
	load_lib asar
	check_deps

	# Stage: resolve + (optionally) download the DMG.
	get_dmg

	if [ "$FETCH_ONLY" = 1 ]; then
		info "DMG ready: ${RESOLVED_DMG_PATH:-<none>}"
		exit 0
	fi

	# Stage: extract the .app bundle.
	extract_dmg "${RESOLVED_DMG_PATH:-}"

	if [ "$EXTRACT_ONLY" = 1 ]; then
		info "extracted app bundle: ${APP_BUNDLE_DIR:-<none>}"
		exit 0
	fi

	if [ "$INSPECT" = 1 ]; then
		inspect_app "${APP_BUNDLE_DIR:-}"
		exit 0
	fi

	# Stage: extract + repack app.asar (no patches yet).
	local resources="${APP_BUNDLE_DIR}/Contents/Resources"
	asar_extract "$resources/app.asar"
	asar_pack "$ASAR_EXTRACTED_DIR" "$SCRIPT_DIR/app.asar"
	info "asar repacked: ${REPACKED_ASAR:-<none>}"
	info "native/electron/assemble/package stages land in C5-C12."
	if [ "$PACKAGE_ONLY" = 1 ]; then
		warn "package mode not implemented yet (lands in C10+)"
	fi
}

main "$@"
