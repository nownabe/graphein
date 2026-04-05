#!/usr/bin/env bash
# Shared utilities for the harness

set -euo pipefail

# Source guard — prevent double-sourcing readonly conflicts
if [[ -n "${_HARNESS_UTILS_LOADED:-}" ]]; then
  return 0 2>/dev/null || true
fi
_HARNESS_UTILS_LOADED=1

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Logging with team/pair context
log_info()  { echo -e "${BLUE}[INFO]${NC}  $*" >&2; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*" >&2; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_step()  { echo -e "${CYAN}[STEP]${NC}  $*" >&2; }

# Prefixed logging for parallel output
# Usage: log_prefix "team-auth/pair-01" "message"
log_prefix() {
  local prefix="$1"; shift
  echo -e "${CYAN}[${prefix}]${NC} $*" >&2
}

# Render a prompt template by replacing {{VAR}} placeholders
# Usage: render_prompt template_file VAR1=value1 VAR2=value2
render_prompt() {
  local template_file="$1"; shift
  local content
  content="$(cat "$template_file")"

  for assignment in "$@"; do
    local key="${assignment%%=*}"
    local value="${assignment#*=}"
    content="${content//\{\{${key}\}\}/${value}}"
  done

  echo "$content"
}

# Get the harness root directory (where run.sh lives)
harness_root() {
  echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
}

# Get the project root directory (the git repo root)
project_root() {
  git rev-parse --show-toplevel
}

# Create the runtime working directory for a team
# Returns the path to the team's working directory
init_team_workdir() {
  local team_name="$1"
  local root
  root="$(project_root)"
  local workdir="${root}/.harness/${team_name}"

  mkdir -p "${workdir}/sprint-contracts"
  mkdir -p "${workdir}/pairs"
  echo "$workdir"
}

# Create a git worktree for a pair
# Returns the path to the worktree
init_worktree() {
  local team_name="$1"
  local pair_id="$2"
  local root
  root="$(project_root)"
  local worktree_path="${root}/.harness/worktrees/${team_name}-${pair_id}"
  local branch_name="harness/${team_name}-${pair_id}"

  if [[ -d "$worktree_path" ]]; then
    log_warn "Worktree already exists: ${worktree_path}, removing..."
    git -C "$root" worktree remove --force "$worktree_path" 2>/dev/null || true
    git -C "$root" branch -D "$branch_name" 2>/dev/null || true
  fi

  git -C "$root" worktree add -b "$branch_name" "$worktree_path" HEAD
  echo "$worktree_path"
}

# Clean up a git worktree
cleanup_worktree() {
  local team_name="$1"
  local pair_id="$2"
  local root
  root="$(project_root)"
  local worktree_path="${root}/.harness/worktrees/${team_name}-${pair_id}"
  local branch_name="harness/${team_name}-${pair_id}"

  if [[ -d "$worktree_path" ]]; then
    git -C "$root" worktree remove --force "$worktree_path" 2>/dev/null || true
  fi
  # Don't delete the branch — it holds the generated code for merging
}

# Check if a required command exists
require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" &>/dev/null; then
    log_error "Required command not found: ${cmd}"
    exit 1
  fi
}
