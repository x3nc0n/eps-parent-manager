#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="x3nc0n"
REPO_NAME="eps-parent-manager"
BRANCH="main"
DRY_RUN=false
ARGS=()

info() { printf '[install] %s\n' "$*"; }
warn() { printf '[install] WARNING: %s\n' "$*" >&2; }
fail() { printf '[install] ERROR: %s\n' "$*" >&2; exit 1; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      [[ $# -ge 2 ]] || fail "--branch requires a value"
      BRANCH="$2"
      ARGS+=("$1" "$2")
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      ARGS+=("$1")
      shift
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

command_exists curl || fail "curl is required to download the toolkit."
command_exists tar || fail "tar is required to unpack the toolkit."

# Check if running inside an already-initialized git repo
if [[ -d ".git" ]]; then
  TARGET_DIR="."
  IS_GIT_REPO=true
else
  TARGET_DIR="$REPO_NAME"
  IS_GIT_REPO=false
fi

# Auto-detect upgrade: if .eps-toolkit-version exists, inject --update
VERSION_FILE=".eps-toolkit-version"
if [[ -f "$TARGET_DIR/$VERSION_FILE" ]]; then
  IS_UPGRADE=true
  # Ensure --update is in the args passed to setup.sh
  HAS_UPDATE=false
  for arg in "${ARGS[@]+"${ARGS[@]}"}"; do
    [[ "$arg" == "--update" ]] && HAS_UPDATE=true
  done
  if ! $HAS_UPDATE; then
    ARGS+=("--update")
  fi
else
  IS_UPGRADE=false
fi

ARCHIVE_PATH="$PWD/.${REPO_NAME}-${BRANCH}.tar.gz"
TARBALL_URL="https://github.com/$REPO_OWNER/$REPO_NAME/archive/refs/heads/$BRANCH.tar.gz"

# Only check for non-empty target if we're creating a new subdirectory (not an upgrade)
if [[ "$IS_GIT_REPO" == "false" ]] && ! $IS_UPGRADE && [[ -e "$TARGET_DIR" && -n "$(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)" ]]; then
  fail "Target directory '$TARGET_DIR' already exists and is not empty. Use --update to upgrade, or choose a new folder."
fi

if $IS_UPGRADE; then
  info "Upgrading $TARGET_DIR from branch '$BRANCH'"
else
  info "Preparing $TARGET_DIR from branch '$BRANCH'"
fi
if $DRY_RUN; then
  info "Would download $TARBALL_URL"
  info "Would extract into $TARGET_DIR and run scripts/setup.sh ${ARGS[*]+"${ARGS[*]}"}"
  exit 0
fi

if [[ "$IS_GIT_REPO" == "false" ]]; then
  mkdir -p "$TARGET_DIR"
fi
trap 'rm -f "$ARCHIVE_PATH"' EXIT
curl -fsSL "$TARBALL_URL" -o "$ARCHIVE_PATH"
tar -xzf "$ARCHIVE_PATH" -C "$TARGET_DIR" --strip-components=1
chmod +x "$TARGET_DIR/scripts/setup.sh"
if [[ "$IS_GIT_REPO" == "false" ]]; then
  cd "$TARGET_DIR"
fi
./scripts/setup.sh ${ARGS[@]+"${ARGS[@]}"}
