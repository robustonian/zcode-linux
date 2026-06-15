#!/usr/bin/env bash
# install-latest.sh — one-command install / update of ZCode on Linux.
#
#   1. Ensures host build deps (+ modern 7zz)
#   2. Detects the latest upstream ZCode version
#   3. Compares against the installed version (skip if up-to-date, unless --force)
#   4. Rebuilds zcode-app from the latest DMG (always --fresh)
#   5. Builds the native package for this distro (.deb on Debian/Ubuntu)
#   6. Installs it (may prompt for sudo)
#   7. Prints latest / installed-before / installed-now versions
#
# Usage: bash scripts/install-latest.sh [--force]
# Env:   PKG_ONLY=deb   force .deb packaging
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$REPO_DIR/scripts/lib/install-helpers.sh"

FORCE=0
for a in "$@"; do
	case "$a" in
		--force|-f) FORCE=1 ;;
		-h|--help)  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
		*) echo "unknown arg: $a (try --help)" >&2; exit 2 ;;
	esac
done

info() { printf '\033[1;34m[zcode-install]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[zcode-install]\033[0m %s\n' "$*"; }

# --- version detection -------------------------------------------------------

# Latest published version, scraped from the upstream changelog.
# The changelog lists releases newest-first, so the first "<ver> Released"
# entry is the latest version (avoids matching version strings in body text).
detect_latest_upstream_version() {
	# The changelog is fully client-rendered, so scraping it with curl is
	# unreliable. Probe the CDN for the highest existing DMG instead — its
	# presence is authoritative. Walk known minors/patches high→low.
	local suffix; suffix="$(dmg_arch_suffix)"
	local base="${ZCODE_UPSTREAM_DMG_BASE:-https://cdn.zcode-ai.com/zcode/electron/releases}"
	local v
	for v in 3.1.9 3.1.8 3.1.7 3.1.6 3.1.5 3.1.4 3.1.3 3.1.2 3.1.1 3.1.0 \
	         3.0.9 3.0.8 3.0.7 3.0.6 3.0.5 3.0.4 3.0.3 3.0.2 3.0.1 3.0.0; do
		if curl -fsI --max-time 8 "$base/$v/ZCode-$v-mac-$suffix.dmg" >/dev/null 2>&1; then
			echo "$v"; return 0
		fi
	done
	echo "${ZCODE_KNOWN_VERSION:-3.0.1}"
}

# Currently installed version (dpkg, else the installed app.asar's package.json).
installed_version() {
	if command -v dpkg-query >/dev/null 2>&1 \
		&& dpkg-query -W -f='${Version}' zcode-desktop >/dev/null 2>&1; then
		dpkg-query -W -f='${Version}' zcode-desktop | sed 's/-zlinux[0-9]*//'
		return
	fi
	local asar="/opt/zcode-desktop/electron/resources/app.asar"
	if [ -f "$asar" ] && command -v npx >/dev/null 2>&1; then
		npx --yes asar extract-file "$asar" package.json 2>/dev/null \
			| python3 -c "import json,sys;print(json.load(sys.stdin).get('version',''))" 2>/dev/null || true
	fi
}

# --- main --------------------------------------------------------------------

main() {
	info "ensuring host dependencies..."
	( cd "$REPO_DIR" && make install-deps ) || warn "install-deps reported an issue; continuing"

	local latest installed
	latest="$(detect_latest_upstream_version || true)"
	installed="$(installed_version || true)"
	info "latest upstream: ${latest:-<unknown>}"
	info "installed:       ${installed:-<none>}"

	if [ "$FORCE" != 1 ] && [ -n "$latest" ] && [ -n "$installed" ] && [ "$latest" = "$installed" ]; then
		info "already up-to-date ($installed). Re-run with --force to rebuild."
		return 0
	fi

	info "rebuilding from the latest DMG (--fresh)..."
	( cd "$REPO_DIR" && ./install.sh --fresh ) || { warn "build failed"; return 1; }

	info "building native package..."
	local artifact=""
	if command -v dpkg-deb >/dev/null 2>&1; then
		( cd "$REPO_DIR" && bash scripts/build-deb.sh ) || { warn ".deb build failed"; return 1; }
		artifact="$(ls -t "$REPO_DIR"/dist/*.deb 2>/dev/null | head -n1)"
	fi

	if [ -n "$artifact" ]; then
		info "installing $(basename "$artifact") (sudo)..."
		sudo dpkg -i "$artifact" || sudo apt-get -f install -y
	else
		warn "no native package produced for this distro."
		info "run the app directly: $REPO_DIR/zcode-app/start.sh"
	fi

	local now; now="$(installed_version || true)"
	info "result: latest=${latest:-?}  before=${installed:-none}  now=${now:-none}"
}

main "$@"
