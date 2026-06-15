#!/usr/bin/env bash
# electron.sh — fetch the matching Linux Electron runtime and stage it.
# Sourced by install.sh (do not execute directly).

ELECTRON_CACHE_DIR="${ELECTRON_CACHE_DIR:-$SCRIPT_DIR/.cache/electron}"

# Resolve the Electron version to target (env > inspect report > Info.plist).
resolve_electron_version() {
	if [ -n "${ELECTRON_VERSION_RESOLVED:-}" ]; then
		echo "$ELECTRON_VERSION_RESOLVED"
		return
	fi
	if [ -n "${ZCODE_ELECTRON_VERSION:-}" ]; then
		ELECTRON_VERSION_RESOLVED="$ZCODE_ELECTRON_VERSION"
		echo "$ELECTRON_VERSION_RESOLVED"
		return
	fi
	local report="$REPORT_DIR/inspect-report.json"
	if [ -f "$report" ]; then
		local v
		v="$(python3 -c "import json;print(json.load(open('$report')).get('electron_version') or '')" 2>/dev/null || true)"
		if [ -n "$v" ]; then
			ELECTRON_VERSION_RESOLVED="$v"
			echo "$v"
			return
		fi
	fi
	local app="${APP_BUNDLE_DIR:-}"
	if [ -n "$app" ]; then
		local plist
		plist="$(find "$app/Contents/Frameworks/Electron Framework.framework" -name Info.plist 2>/dev/null | head -n1)"
		if [ -n "$plist" ]; then
			local v
			v="$(python3 -c "import plistlib;print(plistlib.load(open('$plist','rb')).get('CFBundleVersion',''))" 2>/dev/null || true)"
			if [ -n "$v" ]; then
				ELECTRON_VERSION_RESOLVED="$v"
				echo "$v"
				return
			fi
		fi
	fi
	die "could not resolve Electron version (run --inspect first or set ZCODE_ELECTRON_VERSION)"
}

# Download + cache the Linux Electron zip, extract into <dest>/electron.
# Sets ELECTRON_BIN.
download_electron() {
	local dest="${1:-$ZCODE_INSTALL_DIR}"
	local arch="${2:-$(detect_arch)}"
	local ver; ver="$(resolve_electron_version)"

	mkdir -p "$ELECTRON_CACHE_DIR"
	local zip="$ELECTRON_CACHE_DIR/electron-v${ver}-linux-${arch}.zip"

	if [ ! -f "$zip" ]; then
		local base="${ELECTRON_MIRROR:-https://github.com/electron/electron/releases/download}"
		local url="$base/v${ver}/electron-v${ver}-linux-${arch}.zip"
		info "downloading Linux Electron ${ver} (${arch})..."
		info "  $url"
		curl -fL --retry 3 -C - -o "$zip.part" -- "$url"
		mv "$zip.part" "$zip"
	else
		info "using cached Electron ${ver} (${arch})"
	fi

	info "extracting Electron → $dest/electron"
	rm -rf "$dest/electron"
	mkdir -p "$dest/electron"
	unzip -q "$zip" -d "$dest/electron"
	# ensure the main binary and sandbox helper are executable
	chmod +x "$dest/electron/electron" 2>/dev/null || true
	chmod +x "$dest/electron/chrome-sandbox" 2>/dev/null || true

	ELECTRON_BIN="$dest/electron/electron"
	export ELECTRON_BIN
	info "electron staged: $ELECTRON_BIN"
}
