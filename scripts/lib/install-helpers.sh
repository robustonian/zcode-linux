#!/usr/bin/env bash
# install-helpers.sh — dependency checks + environment detection.
# Sourced by install.sh (do not execute directly).

detect_arch() {
	case "$(uname -m)" in
		x86_64|amd64)  echo "x64" ;;
		aarch64|arm64) echo "arm64" ;;
		armv7l)        echo "armv7l" ;;
		*) die "unsupported architecture: $(uname -m)" ;;
	esac
}

# Map our arch to the upstream DMG's macOS arch suffix.
# x86_64 Linux uses the Intel Mac build; aarch64 Linux uses the Apple Silicon build.
dmg_arch_suffix() {
	case "$(detect_arch)" in
		x64)   echo "x64" ;;
		arm64) echo "arm64" ;;
		*)     die "no upstream DMG for arch $(detect_arch)" ;;
	esac
}

detect_distro_id() {
	if [ -f /etc/os-release ]; then
		# shellcheck disable=SC1091
		. /etc/os-release
		echo "${ID:-unknown}"
	else
		echo "unknown"
	fi
}

# Verify required tools and pick a modern 7-Zip (sets SEVEN_ZIP_CMD).
check_deps() {
	local missing=()
	for t in python3 curl unzip; do
		command -v "$t" >/dev/null 2>&1 || missing+=("$t")
	done
	if [ ${#missing[@]} -gt 0 ]; then
		die "missing required tools: ${missing[*]} (run: make install-deps)"
	fi

	local sz=""
	if command -v 7zz >/dev/null 2>&1; then sz="7zz"
	elif command -v 7z  >/dev/null 2>&1; then sz="7z"
	else die "7-Zip not found (run: make install-deps to bootstrap 7zz)"; fi

	local banner
	banner="$("$sz" 2>&1 | head -n3 || true)"
	if printf '%s' "$banner" | grep -qiE 'p7zip Version|16\.02'; then
		die "system 7-Zip is too old ($sz reports p7zip 16.02); cannot open current APFS DMGs. Run: make install-deps"
	fi

	SEVEN_ZIP_CMD="$sz"
	export SEVEN_ZIP_CMD
}
