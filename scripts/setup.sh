#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_OWNER="x3nc0n"
REPO_NAME="eps-parent-manager"
DEFAULT_BRANCH="main"
VERSION_FILE=".eps-toolkit-version"
MANIFEST_PATH="$SCRIPT_DIR/template-manifest.txt"
CURRENT_VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/$VERSION_FILE" 2>/dev/null || printf '0.1.0')"
DRY_RUN=false
NO_DEPS=false
FORCE_UPDATE=false
BRANCH="$DEFAULT_BRANCH"
VAULT_PATH=""
WORK_DIR="$ROOT_DIR/.eps-setup-workdir"

info() { printf '[setup] %s\n' "$*"; }
warn() { printf '[setup] WARNING: %s\n' "$*" >&2; }
fail() { printf '[setup] ERROR: %s\n' "$*" >&2; exit 1; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

run() {
  if $DRY_RUN; then
    printf '[dry-run]'
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
  else
    "$@"
  fi
}

write_file() {
  local target="$1"
  local content="$2"
  if $DRY_RUN; then
    info "Would write $target"
  else
    printf '%s\n' "$content" > "$target"
  fi
}

cleanup() {
  if [[ -d "$WORK_DIR" ]] && ! $DRY_RUN; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

print_usage() {
  cat <<USAGE
Usage: ./scripts/setup.sh [options]

Options:
  --update         Force update mode
  --vault <path>   Use an existing Obsidian vault via symlink
  --branch <name>  GitHub branch to download from (default: main)
  --dry-run        Show planned actions without writing files
  --no-deps        Skip npm install
  --help           Show this help message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --update)
      FORCE_UPDATE=true
      shift
      ;;
    --vault)
      [[ $# -ge 2 ]] || fail "--vault requires a path"
      VAULT_PATH="$2"
      shift 2
      ;;
    --branch)
      [[ $# -ge 2 ]] || fail "--branch requires a name"
      BRANCH="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --no-deps)
      NO_DEPS=true
      shift
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

has_personal_layer=false
[[ -e "$ROOT_DIR/vault" || -f "$ROOT_DIR/.env" || -f "$ROOT_DIR/config/personal.yaml" ]] && has_personal_layer=true

MODE="install"
if $FORCE_UPDATE; then
  MODE="update"
elif [[ -f "$ROOT_DIR/$VERSION_FILE" ]] && $has_personal_layer; then
  MODE="update"
fi

ensure_tool_for_update() {
  local tool="$1"
  command_exists "$tool" || fail "Required tool '$tool' is not installed. Please install it and rerun setup."
}

prepare_personal_file() {
  local source="$1"
  local target="$2"
  local display_path="${target#"$ROOT_DIR"/}"
  if [[ -e "$target" ]]; then
    info "Keeping existing $display_path"
    return
  fi

  if [[ ! -f "$source" ]]; then
    warn "Template file not found: $source"
    return
  fi

  run mkdir -p "$(dirname "$target")"
  if $DRY_RUN; then
    info "Would copy $(basename "$source") to $target"
  else
    cp "$source" "$target"
  fi
}

seed_vault() {
  local template_dir="$ROOT_DIR/vault-template"
  local vault_link="$ROOT_DIR/vault"

  if [[ -n "$VAULT_PATH" ]]; then
    [[ -d "$VAULT_PATH" ]] || fail "Vault path does not exist: $VAULT_PATH"
    if [[ -L "$vault_link" ]]; then
      local existing_target
      existing_target="$(readlink "$vault_link")"
      if [[ "$existing_target" == "$VAULT_PATH" ]]; then
        info "Vault symlink already points to $VAULT_PATH"
        return
      fi
    fi

    if [[ -e "$vault_link" && ! -L "$vault_link" ]]; then
      if [[ -n "$(find "$vault_link" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
        warn "vault/ already exists with content. Leaving it in place instead of replacing it with a symlink."
        return
      fi
      run rmdir "$vault_link"
    elif [[ -L "$vault_link" ]]; then
      run rm "$vault_link"
    fi

    run ln -s "$VAULT_PATH" "$vault_link"
    info "Linked vault/ to $VAULT_PATH"
    return
  fi

  if [[ -d "$vault_link" && -n "$(find "$vault_link" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    info "Keeping existing vault/ contents"
    return
  fi

  run mkdir -p "$vault_link"
  if [[ -d "$template_dir" ]]; then
    if $DRY_RUN; then
      info "Would seed vault/ from vault-template/"
    else
      cp -R "$template_dir/." "$vault_link/"
    fi
  else
    warn "vault-template/ not found; created empty vault/ directory"
  fi
}

maybe_init_git() {
  if [[ -d "$ROOT_DIR/.git" ]]; then
    info "Git repository already exists; skipping git init"
    return
  fi
  if ! command_exists git; then
    warn "git is not installed. Skipping repository initialization."
    return
  fi

  run git -C "$ROOT_DIR" init -q
  info "Initialized a fresh git repository"
}

maybe_install_deps() {
  if $NO_DEPS; then
    info "Skipping dependency installation (--no-deps)"
    return
  fi

  if [[ ! -f "$ROOT_DIR/package.json" ]]; then
    warn "package.json not found. Skipping npm install."
    return
  fi

  if ! command_exists node; then
    warn "node is not installed. Skipping npm install."
    return
  fi
  if ! command_exists npm; then
    warn "npm is not installed. Skipping npm install."
    return
  fi

  info "Installing npm dependencies"
  if $DRY_RUN; then
    info "Would run npm install"
  else
    (cd "$ROOT_DIR" && npm install)
  fi
}

copy_overlay_path() {
  local source_root="$1"
  local relative_path="$2"
  local source_path="$source_root/$relative_path"
  local target_path="$ROOT_DIR/$relative_path"

  case "$relative_path" in
    vault/*|.env|config/personal.yaml|config/schools.yaml|node_modules/*)
      warn "Skipping protected personal path from manifest: $relative_path"
      return
      ;;
  esac

  if [[ ! -e "$source_path" ]]; then
    warn "Manifest entry missing from downloaded template: $relative_path"
    return
  fi

  if [[ -d "$source_path" ]]; then
    run mkdir -p "$target_path"
    if $DRY_RUN; then
      info "Would overlay directory $relative_path"
    else
      cp -R "$source_path/." "$target_path/"
    fi
  else
    run mkdir -p "$(dirname "$target_path")"
    if $DRY_RUN; then
      info "Would overlay file $relative_path"
    else
      cp "$source_path" "$target_path"
    fi
  fi
}

run_update() {
  [[ -f "$ROOT_DIR/$VERSION_FILE" ]] || fail "No .eps-toolkit-version found. Run setup without --update first."
  ensure_tool_for_update curl
  ensure_tool_for_update tar

  local previous_version
  previous_version="$(tr -d '[:space:]' < "$ROOT_DIR/$VERSION_FILE")"
  local tarball_url="https://github.com/$REPO_OWNER/$REPO_NAME/archive/refs/heads/$BRANCH.tar.gz"
  local archive_path="$WORK_DIR/repo.tar.gz"
  local extract_dir="$WORK_DIR/source"

  info "Updating template layer from $tarball_url"
  if ! $DRY_RUN; then
    rm -rf "$WORK_DIR"
    mkdir -p "$extract_dir"
    curl -fsSL "$tarball_url" -o "$archive_path"
    tar -xzf "$archive_path" -C "$extract_dir" --strip-components=1
  else
    info "Would download and extract tarball from branch '$BRANCH'"
    return
  fi

  local downloaded_manifest="$extract_dir/scripts/template-manifest.txt"
  [[ -f "$downloaded_manifest" ]] || fail "Downloaded template is missing scripts/template-manifest.txt"

  local entry
  while IFS= read -r entry || [[ -n "$entry" ]]; do
    entry="${entry%%#*}"
    entry="${entry%$'\r'}"
    [[ -n "$entry" ]] || continue
    copy_overlay_path "$extract_dir" "$entry"
  done < "$downloaded_manifest"

  local next_version="$previous_version"
  if [[ -f "$extract_dir/$VERSION_FILE" ]]; then
    next_version="$(tr -d '[:space:]' < "$extract_dir/$VERSION_FILE")"
  fi
  write_file "$ROOT_DIR/$VERSION_FILE" "$next_version"
  info "Template updated: $previous_version -> $next_version"

  maybe_install_deps
  info "Update complete. Personal files in vault/, .env, and config/ were left untouched."
}

run_install() {
  info "Running first-time setup for EPS Parent Manager $CURRENT_VERSION"
  prepare_personal_file "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  prepare_personal_file "$ROOT_DIR/config/personal.yaml.example" "$ROOT_DIR/config/personal.yaml"
  seed_vault
  maybe_init_git
  write_file "$ROOT_DIR/$VERSION_FILE" "$CURRENT_VERSION"
  maybe_install_deps

  cat <<NEXT

Next steps:
  1. Fill in .env with your Infinite Campus, Canvas, and Google credentials.
  2. Review config/personal.yaml for your family details.
  3. Open vault/ in Obsidian and start using the templates.
  4. Run ./scripts/setup.sh --update later to pull template updates.
NEXT
}

if [[ "$MODE" == "update" ]]; then
  run_update
else
  run_install
fi
