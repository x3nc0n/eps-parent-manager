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

install_prerequisites() {
  if $NO_DEPS; then
    info "Skipping prerequisite installation (--no-deps)"
    return
  fi

  # --- Node.js ---
  if ! command_exists node; then
    info "Installing Node.js..."
    if [[ "$(uname)" == "Darwin" ]]; then
      if command_exists brew; then
        run brew install node
      else
        info "Installing Homebrew first..."
        run /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        run brew install node
      fi
    elif [[ "$(uname)" == "Linux" ]]; then
      if command_exists apt-get; then
        run sudo apt-get update -qq && run sudo apt-get install -y nodejs npm
      elif command_exists dnf; then
        run sudo dnf install -y nodejs npm
      else
        warn "Could not auto-install Node.js. Please install manually: https://nodejs.org/"
      fi
    else
      warn "Could not auto-install Node.js on this platform. Please install manually: https://nodejs.org/"
    fi
  fi

  # --- GitHub CLI (gh) ---
  if ! command_exists gh; then
    info "Installing GitHub CLI..."
    if [[ "$(uname)" == "Darwin" ]]; then
      if command_exists brew; then
        run brew install gh
      else
        warn "Homebrew not available. Install gh manually: https://cli.github.com/"
      fi
    elif [[ "$(uname)" == "Linux" ]]; then
      if command_exists apt-get; then
        run sudo mkdir -p /etc/apt/keyrings
        run curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
        run sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli-stable.list >/dev/null
        run sudo apt-get update -qq && run sudo apt-get install -y gh
      elif command_exists dnf; then
        run sudo dnf install -y gh
      else
        warn "Could not auto-install gh. Please install manually: https://cli.github.com/"
      fi
    else
      warn "Could not auto-install gh on this platform. Please install manually: https://cli.github.com/"
    fi
  fi

  # --- gh auth ---
  if command_exists gh && ! gh auth status >/dev/null 2>&1; then
    info "GitHub CLI needs authentication. Starting login..."
    if ! $DRY_RUN; then
      gh auth login
    else
      info "[dry-run] Would run: gh auth login"
    fi
  fi

  # --- GitHub Copilot CLI extension ---
  if command_exists gh; then
    if ! gh copilot --version >/dev/null 2>&1; then
      info "Installing GitHub Copilot CLI extension..."
      run gh extension install github/gh-copilot || warn "Could not install Copilot extension (may require Copilot license)"
    fi
  fi
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

maybe_build_workspaces() {
  if $NO_DEPS; then
    return
  fi

  if ! command_exists npm; then
    return
  fi

  if [[ ! -f "$ROOT_DIR/package.json" ]]; then
    return
  fi

  info "Building MCP server workspaces"
  if $DRY_RUN; then
    info "Would run npm run build in each workspace"
  else
    for ws_dir in "$ROOT_DIR"/mcp-servers/*/; do
      if [[ -f "$ws_dir/package.json" ]] && grep -q '"build"' "$ws_dir/package.json" 2>/dev/null; then
        info "  Building $(basename "$ws_dir")"
        (cd "$ws_dir" && npm run build)
      fi
    done
  fi
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

frontmatter_value() {
  local key="$1"
  local file="$2"
  awk -v key="$key" '
    BEGIN { in_block = 0 }
    $0 == "---" {
      if (in_block) {
        exit
      }
      in_block = 1
      next
    }
    in_block && $0 ~ ("^" key ":[[:space:]]*") {
      sub("^[^:]+:[[:space:]]*", "", $0)
      print
      exit
    }
  ' "$file"
}

extract_issue_number() {
  sed -n 's/.*"number":[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -n 1
}

label_metadata() {
  case "$1" in
    onboarding) printf '0075ca|Setup and onboarding steps\n' ;;
    no-credentials-needed) printf '0e8a16|Safe to start anytime\n' ;;
    credentials) printf 'd73a4a|Involves secrets or passwords\n' ;;
    infinite-campus) printf '1d76db|Infinite Campus integration\n' ;;
    canvas) printf 'd93f0b|Canvas LMS integration\n' ;;
    most-complex) printf '5319e7|Read carefully - most involved step\n' ;;
    google) printf 'fbca04|Google Workspace integration\n' ;;
    obsidian) printf '7057ff|Obsidian vault setup\n' ;;
    verification) printf '0e8a16|Health check and verification\n' ;;
    optional) printf 'e4e669|Nice-to-have, not required\n' ;;
    *) printf 'ededed|Guided setup label\n' ;;
  esac
}

create_onboarding_issues() {
  local onboarding_dir="$SCRIPT_DIR/onboarding"
  local templates=()
  local template title labels_csv step body_file existing_json issue_number
  local step_one_title='⭐ Step 1: Set up your family profile'
  local step_one_number=''

  if [[ ! -d "$onboarding_dir" ]]; then
    warn "scripts/onboarding/ not found; skipping guided setup issues."
    return
  fi

  if ! command_exists gh; then
    info 'Install GitHub CLI (gh) to get guided setup issues: https://cli.github.com/'
    return
  fi

  if ! gh auth status >/dev/null 2>&1; then
    info "GitHub CLI is installed, but not authenticated. Run 'gh auth login' to get guided setup issues."
    return
  fi

  if ! gh repo view >/dev/null 2>&1; then
    warn 'GitHub CLI could not determine the current GitHub repository. Skipping guided setup issues.'
    return
  fi

  while IFS= read -r template; do
    templates+=("$template")
  done < <(find "$onboarding_dir" -maxdepth 1 -type f -name '*.md' | sort)

  if [[ ${#templates[@]} -eq 0 ]]; then
    warn 'No onboarding issue templates found in scripts/onboarding/.'
    return
  fi

  run mkdir -p "$WORK_DIR"

  for template in "${templates[@]}"; do
    title="$(frontmatter_value title "$template")"
    title="$(trim "${title%\"}")"
    title="$(trim "${title#\"}")"
    labels_csv="$(frontmatter_value labels "$template")"
    step="$(frontmatter_value step "$template")"

    if [[ -z "$title" || -z "$labels_csv" || -z "$step" ]]; then
      warn "Template is missing required frontmatter: $template"
      continue
    fi

    IFS=',' read -r -a labels <<< "$labels_csv"
    for label in "${labels[@]}"; do
      local trimmed_label metadata color description
      trimmed_label="$(trim "$label")"
      [[ -n "$trimmed_label" ]] || continue
      metadata="$(label_metadata "$trimmed_label")"
      color="${metadata%%|*}"
      description="${metadata#*|}"
      if $DRY_RUN; then
        info "Would ensure GitHub label '$trimmed_label' exists"
      elif ! gh label create "$trimmed_label" --color "$color" --description "$description" --force >/dev/null 2>&1; then
        warn "Could not ensure GitHub label '$trimmed_label'. Skipping guided setup issues."
        return
      fi
    done

    existing_json="$(gh issue list --state all --limit 1 --search "\"$title\" in:title" --json number 2>/dev/null || printf '[]')"
    issue_number="$(printf '%s' "$existing_json" | extract_issue_number)"
    if [[ -n "$issue_number" ]]; then
      info "Guided setup issue already exists for step $step: $title"
      if [[ "$title" == "$step_one_title" ]]; then
        step_one_number="$issue_number"
      fi
      continue
    fi

    body_file="$WORK_DIR/onboarding-body-$step.md"
    if $DRY_RUN; then
      info "Would create guided setup issue for step $step: $title"
    else
      awk 'BEGIN { divider_count = 0 } $0 == "---" { divider_count++; next } divider_count >= 2 { print }' "$template" > "$body_file"
      local create_args=(issue create --title "$title" --body-file "$body_file")
      for label in "${labels[@]}"; do
        local trimmed_label
        trimmed_label="$(trim "$label")"
        [[ -n "$trimmed_label" ]] || continue
        create_args+=(--label "$trimmed_label")
      done
      if gh "${create_args[@]}" >/dev/null 2>&1; then
        info "Created guided setup issue for step $step"
        issue_number="$(gh issue list --state all --limit 1 --search "\"$title\" in:title" --json number 2>/dev/null | extract_issue_number)"
        if [[ "$title" == "$step_one_title" ]]; then
          step_one_number="$issue_number"
        fi
      else
        warn "Could not create guided setup issue for step $step: $title"
      fi
      rm -f "$body_file"
    fi
  done

  if [[ -n "$step_one_number" ]]; then
    if $DRY_RUN; then
      info "Would pin guided setup issue #$step_one_number"
    elif gh issue pin -h >/dev/null 2>&1; then
      gh issue pin "$step_one_number" >/dev/null 2>&1 || true
    fi
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

  install_prerequisites
  maybe_install_deps
  maybe_build_workspaces
  info "Update complete. Personal files in vault/, .env, and config/ were left untouched."
}

maybe_create_github_repo() {
  if ! command_exists gh; then
    warn "gh is not installed. Skipping GitHub repository creation."
    return
  fi

  if ! gh auth status >/dev/null 2>&1; then
    warn "gh is not authenticated. Skipping GitHub repository creation."
    return
  fi

  # If a remote already exists, skip
  if git -C "$ROOT_DIR" remote get-url origin >/dev/null 2>&1; then
    info "Git remote 'origin' already configured; skipping repo creation"
    return
  fi

  local repo_name
  repo_name="$(basename "$ROOT_DIR")"

  info "Creating private GitHub repository '$repo_name'..."
  if $DRY_RUN; then
    info "Would run: gh repo create $repo_name --private --source $ROOT_DIR --push"
    return
  fi

  # Initial commit so we have something to push
  git -C "$ROOT_DIR" add -A
  git -C "$ROOT_DIR" commit -q -m "Initial commit: EPS Parent Manager toolkit v$CURRENT_VERSION" || true

  if gh repo create "$repo_name" --private --source "$ROOT_DIR" --push; then
    info "GitHub repository created and pushed successfully"
  else
    warn "Could not create GitHub repository. You can do this manually later with: gh repo create"
  fi
}

run_install() {
  info "Running first-time setup for EPS Parent Manager $CURRENT_VERSION"

  # Install prerequisites first (node, gh, gh auth) so they're available for later steps
  install_prerequisites

  prepare_personal_file "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  prepare_personal_file "$ROOT_DIR/config/personal.yaml.example" "$ROOT_DIR/config/personal.yaml"
  seed_vault
  maybe_init_git
  write_file "$ROOT_DIR/$VERSION_FILE" "$CURRENT_VERSION"
  maybe_install_deps
  maybe_build_workspaces

  # Create GitHub repo, initial commit, and push (requires gh auth from install_prerequisites)
  maybe_create_github_repo

  # Create onboarding issues (requires a GitHub remote to exist)
  create_onboarding_issues

  # Determine the repo URL for the final message
  local repo_url=""
  if command_exists gh && gh auth status >/dev/null 2>&1 && gh repo view >/dev/null 2>&1; then
    repo_url="$(gh repo view --json url -q '.url' 2>/dev/null || true)"
  fi

  info 'Done!'
  if [[ -n "$repo_url" ]]; then
    cat <<NEXT

✅ Your family toolkit is ready!

Your repo: $repo_url
Issues:    ${repo_url}/issues

Next steps — work through the guided setup issues in order:
  ${repo_url}/issues

Each issue walks you through one piece of configuration:
  credentials, family profile, integrations, and verification.

Later, run ./scripts/setup.sh --update to pull template updates.
NEXT
  else
    cat <<NEXT

Next steps:
  1. Run 'gh auth login' and then 'gh repo create' to push to GitHub.
  2. Fill in .env with your Infinite Campus, Canvas, and Google credentials.
  3. Review config/personal.yaml for your family details.
  4. Open vault/ in Obsidian and start using the templates.
  5. Run ./scripts/setup.sh --update later to pull template updates.
NEXT
  fi
}

if [[ "$MODE" == "update" ]]; then
  run_update
else
  run_install
fi
