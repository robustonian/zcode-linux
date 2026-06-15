#!/usr/bin/env bash
# dmg.sh — upstream DMG resolution, cached download, and extraction.
# Sourced by install.sh (do not execute directly).

CACHE_DIR="${ZCODE_CACHE_DIR:-$SCRIPT_DIR/.cache}"
CACHED_DMG_PATH="$SCRIPT_DIR/ZCode.dmg"
CACHED_DMG_META="$SCRIPT_DIR/ZCode.dmg.metadata"

# Build the upstream DMG URL for the current arch + resolved version.
resolve_dmg_url() {
	if [ -n "${ZCODE_UPSTREAM_DMG_URL:-}" ]; then
		echo "$ZCODE_UPSTREAM_DMG_URL"
		return
	fi
	local suffix; suffix="$(dmg_arch_suffix)"
	echo "${ZCODE_UPSTREAM_DMG_BASE}/${ZCODE_VERSION}/ZCode-${ZCODE_VERSION}-mac-${suffix}.dmg"
}

# Remote HTTP fingerprint via HEAD (etag / last-modified / content-length).
_fetch_remote_fingerprint() {
	local url="$1"
	local headers
	headers="$(curl -fsSLI --max-time 15 --connect-timeout 5 -- "$url" 2>/dev/null || true)"
	local etag lm cl
	etag="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1)=="etag"{gsub(/\r/,"",$2);print $2;exit}')"
	lm="$(printf '%s\n'   "$headers" | awk -F': ' 'tolower($1)=="last-modified"{gsub(/\r/,"",$2);print $2;exit}')"
	cl="$(printf '%s\n'   "$headers" | awk -F': ' 'tolower($1)=="content-length"{gsub(/\r/,"",$2);print $2;exit}')"
	echo "url=$url"
	echo "etag=${etag:-}"
	echo "last_modified=${lm:-}"
	echo "content_length=${cl:-}"
}

# Ensure the DMG is available locally (download if needed). Sets RESOLVED_DMG_PATH.
get_dmg() {
	# Explicit local path wins.
	if [ -n "$PROVIDED_DMG_PATH" ]; then
		[ -f "$PROVIDED_DMG_PATH" ] || die "provided DMG not found: $PROVIDED_DMG_PATH"
		RESOLVED_DMG_PATH="$(cd "$(dirname "$PROVIDED_DMG_PATH")" && pwd)/$(basename "$PROVIDED_DMG_PATH")"
		info "using provided DMG: $RESOLVED_DMG_PATH"
		return
	fi

	local url; url="$(resolve_dmg_url)"
	info "upstream DMG: $url"

	if [ "$FRESH" = 1 ] && [ -f "$CACHED_DMG_PATH" ]; then
		info "discarding cached DMG (--fresh)"
		rm -f "$CACHED_DMG_PATH" "$CACHED_DMG_META"
	fi

	# Cache hit via fingerprint comparison.
	if [ -f "$CACHED_DMG_PATH" ] && [ -f "$CACHED_DMG_META" ]; then
		local remote
		if remote="$(_fetch_remote_fingerprint "$url")"; then
			local r_etag r_cl c_etag c_cl
			r_etag="$(printf '%s\n' "$remote" | sed -n 's/^etag=//p')"
			r_cl="$(printf '%s\n'   "$remote" | sed -n 's/^content_length=//p')"
			c_etag="$(sed -n 's/^etag=//p' "$CACHED_DMG_META" 2>/dev/null || true)"
			c_cl="$(sed -n 's/^content_length=//p' "$CACHED_DMG_META" 2>/dev/null || true)"
			if { [ -n "$r_etag" ] && [ "$r_etag" = "$c_etag" ]; } || \
			   { [ -n "$r_cl" ]   && [ "$r_cl"   = "$c_cl"   ]; }; then
				info "cached DMG is current (fingerprint match); skipping download"
				RESOLVED_DMG_PATH="$CACHED_DMG_PATH"
				return
			fi
		fi
	fi

	info "downloading DMG..."
	mkdir -p "$CACHE_DIR"
	local tmp_dmg="$CACHED_DMG_PATH.part"
	rm -f "$tmp_dmg"
	curl -fL --retry 3 -C - -o "$tmp_dmg" -- "$url"
	mv "$tmp_dmg" "$CACHED_DMG_PATH"

	local remote_meta
	remote_meta="$(_fetch_remote_fingerprint "$url" || true)"
	printf '%s\n' "$remote_meta" > "$CACHED_DMG_META"

	RESOLVED_DMG_PATH="$CACHED_DMG_PATH"
	info "DMG cached: $CACHED_DMG_PATH ($(du -h "$CACHED_DMG_PATH" | cut -f1))"
}

# Extract the .app bundle from a DMG. Sets APP_BUNDLE_DIR.
extract_dmg() {
	local dmg="${1:-${RESOLVED_DMG_PATH:-}}"
	[ -n "$dmg" ] && [ -f "$dmg" ] || die "no DMG to extract"
	[ -n "${SEVEN_ZIP_CMD:-}" ] || check_deps

	local extract_dir="$SCRIPT_DIR/dmg-extract"
	rm -rf "$extract_dir"
	mkdir -p "$extract_dir"

	info "extracting DMG with $SEVEN_ZIP_CMD..."
	"$SEVEN_ZIP_CMD" x -y -snl "$dmg" -o"$extract_dir" >/dev/null

	APP_BUNDLE_DIR="$(find "$extract_dir" -maxdepth 4 -name "*.app" -type d 2>/dev/null | head -n1)"
	[ -n "$APP_BUNDLE_DIR" ] || die "no .app bundle found in DMG (extract dir: $extract_dir)"
	info "app bundle: $APP_BUNDLE_DIR"
	export APP_BUNDLE_DIR
}
