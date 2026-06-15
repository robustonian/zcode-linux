#!/usr/bin/env bash
# asar.sh — extract app.asar, strip macOS-only pieces, repack deterministically.
# Sourced by install.sh (do not execute directly).

# Extract app.asar into a directory. Sets ASAR_EXTRACTED_DIR.
asar_extract() {
	local asar="${1:-}"
	local dest="${2:-$SCRIPT_DIR/app-extracted}"
	[ -n "$asar" ] && [ -f "$asar" ] || die "no app.asar to extract"
	rm -rf "$dest"
	mkdir -p "$dest"
	info "extracting app.asar → $dest"
	npx --yes asar extract "$asar" "$dest" >/dev/null
	ASAR_EXTRACTED_DIR="$dest"
	export ASAR_EXTRACTED_DIR
}

# Remove macOS-only native artifacts that cannot run on Linux.
# (node-pty darwin prebuilds/builds; Sparkle updater if present.)
strip_macos_only() {
	local dir="${1:-$ASAR_EXTRACTED_DIR}"
	[ -d "$dir" ] || die "no extracted dir to strip"
	info "stripping macOS-only native artifacts..."

	# node-pty darwin prebuilds & build output
	rm -rf "$dir/node_modules/node-pty/prebuilds/darwin-x64" \
	       "$dir/node_modules/node-pty/prebuilds/darwin-arm64" \
	       "$dir/node_modules/node-pty/bin" \
	       "$dir/node_modules/node-pty/build" 2>/dev/null || true

	# @lydell/node-pty darwin platform packages
	rm -rf "$dir/node_modules/@lydell/node-pty-darwin-x64" \
	       "$dir/node_modules/@lydell/node-pty-darwin-arm64" 2>/dev/null || true

	# Sparkle (macOS auto-updater) if present
	rm -rf "$dir/node_modules/sparkle-darwin" \
	       "$dir/node_modules/node-mac-permissions" 2>/dev/null || true
	find "$dir" -name "sparkle.node" -delete 2>/dev/null || true
}

# Deterministic repack: stable file order (LC_ALL=C sort) with native
# binaries unpacked beside the asar (Electron cannot require() from inside).
asar_pack() {
	local src="${1:-$ASAR_EXTRACTED_DIR}"
	local out="${2:-$SCRIPT_DIR/app.asar}"
	[ -d "$src" ] || die "no extracted dir to pack"

	info "repacking app.asar (deterministic order, natives unpacked)..."
	local ordering="$SCRIPT_DIR/app.asar.ordering"
	( cd "$src" && find . -type f | LC_ALL=C sort | sed 's#^\./##' ) > "$ordering"

	# --unpack-dir keeps node_modules native layout intact outside the asar.
	npx --yes asar pack "$src" "$out" \
		--ordering "$ordering" \
		--unpack "{*.node,*.so,*.dylib}" >/dev/null
	rm -f "$ordering"

	REPACKED_ASAR="$out"
	info "repacked: $out ($(du -h "$out" | cut -f1))"
	export REPACKED_ASAR
}
