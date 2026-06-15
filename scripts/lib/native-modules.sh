#!/usr/bin/env bash
# native-modules.sh — resolve Linux native modules via prebuild swap (no rebuild).
# Sourced by install.sh (do not execute directly).
#
# ZCode's only native dependency is node-pty 1.1.0, which loads its binary from
# node_modules/node-pty/prebuilds/<platform>-<arch>/*.node (see lib/utils.js).
# The macOS build ships darwin/win32 prebuilds only. We fetch the matching
# @lydell/node-pty-linux-<arch> prebuild from npm and drop it into prebuilds/linux-<arch>/.
# node-pty 1.x is N-API based → ABI-agnostic, so it runs under Electron without rebuild.

NATIVE_BUILD_DIR="${ZCODE_NATIVE_BUILD_DIR:-$SCRIPT_DIR/.cache/native-build}"

# Install the Linux node-pty prebuild into the extracted asar tree.
install_linux_prebuilds() {
	local dir="${1:-$ASAR_EXTRACTED_DIR}"
	local arch="${2:-$(detect_arch)}"
	[ -d "$dir/node_modules/node-pty" ] || { warn "node-pty not found; skipping prebuild install"; return 0; }

	info "fetching Linux node-pty prebuild (@lydell/node-pty-linux-$arch)..."
	rm -rf "$NATIVE_BUILD_DIR"
	mkdir -p "$NATIVE_BUILD_DIR"
	( cd "$NATIVE_BUILD_DIR" \
		&& npm init -y >/dev/null 2>&1 \
		&& npm install "@lydell/node-pty-linux-$arch" --no-save --ignore-scripts --foreground-scripts >/dev/null 2>&1 ) \
		|| die "npm install @lydell/node-pty-linux-$arch failed"

	local pkg="$NATIVE_BUILD_DIR/node_modules/@lydell/node-pty-linux-$arch"
	[ -d "$pkg" ] || die "@lydell/node-pty-linux-$arch did not install"

	# Locate the prebuilt .node (convention: prebuilds/linux-<arch>/).
	local node_file
	node_file="$(find "$pkg" -name "*.node" | head -n1)"
	[ -n "$node_file" ] || die "no .node found in @lydell/node-pty-linux-$arch"

	# Verify it is a Linux ELF (not a stray darwin/win binary).
	local ftype; ftype="$(file "$node_file")"
	case "$ftype" in
		*ELF*) info "prebuild is ELF ✓" ;;
		*) die "prebuild is NOT ELF: $ftype" ;;
	esac

	# Drop it where node-pty's utils.js loadNativeModule('pty') will look.
	local src_dir; src_dir="$(dirname "$node_file")"
	local dest="$dir/node_modules/node-pty/prebuilds/linux-$arch"
	mkdir -p "$dest"
	cp "$src_dir"/*.node "$dest/"
	info "placed Linux prebuild → node-pty/prebuilds/linux-$arch/ ($(basename "$node_file"))"

	LINUX_PTY_NODE="$dest/$(basename "$node_file")"
	export LINUX_PTY_NODE
}
