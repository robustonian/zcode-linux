#!/usr/bin/env bash
# assemble.sh — assemble the runnable zcode-app/ from the staged pieces.
# Sourced by install.sh (do not execute directly).

assemble_app() {
	local dest="${1:-$ZCODE_INSTALL_DIR}"
	local asar="${2:-${REPACKED_ASAR:-$SCRIPT_DIR/app.asar}}"
	local unpacked="${3:-$SCRIPT_DIR/app.asar.unpacked}"

	[ -x "$dest/electron/electron" ] || die "electron not staged (run C6 first)"
	[ -f "$asar" ] || die "repacked app.asar not found: $asar"

	# Place app.asar + unpacked beside the Electron runtime. Electron reads
	# resources/app.asar (preferring it over default_app.asar).
	local eresources="$dest/electron/resources"
	mkdir -p "$eresources"
	rm -f "$eresources/app.asar"
	rm -rf "$eresources/app.asar.unpacked"
	cp "$asar" "$eresources/app.asar"
	[ -d "$unpacked" ] && cp -r "$unpacked" "$eresources/app.asar.unpacked"

	# Generate the launcher from the template.
	local tmpl="$SCRIPT_DIR/launcher/start.sh.template"
	[ -f "$tmpl" ] || die "start.sh template missing: $tmpl"
	cp "$tmpl" "$dest/start.sh"
	chmod +x "$dest/start.sh"

	# Stage extra resource dirs (glm, model-providers, tools) + icon from the app bundle.
	local app="${APP_BUNDLE_DIR:-}"
	local resources="$app/Contents/Resources"
	if [ -n "$app" ] && [ -d "$resources" ]; then
		for d in glm model-providers tools; do
			if [ -d "$resources/$d" ]; then
				rm -rf "$dest/$d"
				cp -r "$resources/$d" "$dest/$d"
			fi
		done
		[ -f "$resources/icon.png" ] && cp "$resources/icon.png" "$dest/icon.png"
	fi

	info "zcode-app assembled → $dest"
	info "launch with: $dest/start.sh"
}
