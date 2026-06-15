#!/usr/bin/env bash
# patches.sh — drive the Node patch engine over the extracted app tree.
# Sourced by install.sh (do not execute directly).

apply_patches() {
	local dir="${1:-$ASAR_EXTRACTED_DIR}"
	[ -d "$dir" ] || die "no extracted dir to patch"
	local engine="$SCRIPT_DIR/scripts/patches/apply.js"
	[ -f "$engine" ] || die "patch engine not found: $engine"

	info "applying asar patches (descriptors under scripts/patches/core/)..."
	node "$engine" "$dir" --report-json "$REPORT_DIR/patch-report.json" \
		|| die "patch engine failed"
}
