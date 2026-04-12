#!/usr/bin/env bash
# Multi-Agent Harness: GAN-inspired generation/evaluation loop
#
# Usage:
#   ./harness/run.sh --requirement "Build a REST API" --pairs 3
#   ./harness/run.sh --team auth --requirement "JWT auth" --pairs 2 --max-sprints 5
#
# Multiple teams (run in parallel):
#   ./harness/run.sh --team auth --requirement "JWT auth" --pairs 3 &
#   ./harness/run.sh --team dashboard --requirement "Dashboard" --pairs 2 &
#   wait

set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HARNESS_DIR}/lib/utils.sh"
source "${HARNESS_DIR}/lib/planner.sh"
source "${HARNESS_DIR}/lib/pair.sh"

# --- Defaults ---
TEAM_NAME=""
REQUIREMENT=""
NUM_PAIRS=2
MAX_SPRINTS=5
BUDGET_PER_AGENT=10
MODEL="opus"

# --- Parse arguments ---
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --team NAME           Team name (default: auto-generated from requirement)
  --requirement TEXT    The product requirement (required)
  --pairs N             Number of generator-evaluator pairs (default: 2)
  --max-sprints N       Max gen-eval iterations per pair (default: 5)
  --budget-per-agent N  Max USD per agent invocation (default: 10)
  --model MODEL         Claude model to use (default: opus)
  --help                Show this help message

Examples:
  $(basename "$0") --requirement "Build a todo app with REST API" --pairs 3
  $(basename "$0") --team auth --requirement "Implement JWT authentication" --pairs 2
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --team)         TEAM_NAME="$2";         shift 2 ;;
    --requirement)  REQUIREMENT="$2";       shift 2 ;;
    --pairs)        NUM_PAIRS="$2";         shift 2 ;;
    --max-sprints)  MAX_SPRINTS="$2";       shift 2 ;;
    --budget-per-agent) BUDGET_PER_AGENT="$2"; shift 2 ;;
    --model)        MODEL="$2";             shift 2 ;;
    --help)         usage ;;
    *)
      log_error "Unknown option: $1"
      usage
      ;;
  esac
done

if [[ -z "$REQUIREMENT" ]]; then
  log_error "--requirement is required"
  usage
fi

# Auto-generate team name if not provided
if [[ -z "$TEAM_NAME" ]]; then
  TEAM_NAME="team-$(date +%s)"
fi

# --- Preflight checks ---
require_cmd claude
require_cmd git

log_info "=============================="
log_info "Harness: ${TEAM_NAME}"
log_info "Requirement: ${REQUIREMENT}"
log_info "Pairs: ${NUM_PAIRS}"
log_info "Max sprints: ${MAX_SPRINTS}"
log_info "Budget/agent: \$${BUDGET_PER_AGENT}"
log_info "Model: ${MODEL}"
log_info "=============================="

# --- Initialize working directory ---
WORK_DIR="$(init_team_workdir "$TEAM_NAME")"
log_info "Working directory: ${WORK_DIR}"

# --- Phase 1: Planner ---
log_step "Phase 1: Running planner..."

run_planner "$TEAM_NAME" "$REQUIREMENT" "$NUM_PAIRS" "$WORK_DIR" "$BUDGET_PER_AGENT" "$MODEL"

if [[ $? -ne 0 ]]; then
  log_error "Planner failed, aborting"
  exit 1
fi

# Discover generated sprint contracts
CONTRACTS=()
for f in "${WORK_DIR}/sprint-contracts/"*.md; do
  if [[ -f "$f" ]]; then
    CONTRACTS+=("$(basename "$f" .md)")
  fi
done

if [[ ${#CONTRACTS[@]} -eq 0 ]]; then
  log_error "No sprint contracts found"
  exit 1
fi

log_info "Sprint contracts: ${CONTRACTS[*]}"

# --- Phase 2: Generator-Evaluator pairs (parallel) ---
log_step "Phase 2: Running ${#CONTRACTS[@]} generator-evaluator pairs in parallel..."

PAIR_PIDS=()
PAIR_RESULTS_DIR="$(mktemp -d)"

for contract_id in "${CONTRACTS[@]}"; do
  (
    result="$(run_pair "$TEAM_NAME" "$contract_id" "$WORK_DIR" "$MAX_SPRINTS" "$BUDGET_PER_AGENT" "$MODEL")"
    echo "$result" > "${PAIR_RESULTS_DIR}/${contract_id}"
  ) &
  PAIR_PIDS+=($!)
  log_info "Started pair ${contract_id} (PID: ${PAIR_PIDS[-1]})"
done

# Wait for all pairs
log_info "Waiting for all pairs to complete..."

FAILED_PAIRS=()
PASSED_PAIRS=()

for i in "${!PAIR_PIDS[@]}"; do
  pid="${PAIR_PIDS[$i]}"
  contract_id="${CONTRACTS[$i]}"

  if wait "$pid"; then
    result="$(cat "${PAIR_RESULTS_DIR}/${contract_id}" 2>/dev/null || echo "UNKNOWN")"
    if [[ "$result" == "PASS" ]]; then
      PASSED_PAIRS+=("$contract_id")
    else
      FAILED_PAIRS+=("$contract_id")
    fi
  else
    FAILED_PAIRS+=("$contract_id")
  fi
done

rm -rf "$PAIR_RESULTS_DIR"

# --- Summary ---
echo ""
log_info "=============================="
log_info "Harness Complete: ${TEAM_NAME}"
log_info "=============================="
log_ok "Passed: ${#PASSED_PAIRS[@]}/${#CONTRACTS[@]} — ${PASSED_PAIRS[*]:-none}"

if [[ ${#FAILED_PAIRS[@]} -gt 0 ]]; then
  log_error "Failed: ${#FAILED_PAIRS[@]}/${#CONTRACTS[@]} — ${FAILED_PAIRS[*]}"
fi

echo ""
log_info "Results in: ${WORK_DIR}/pairs/"
log_info "Worktrees in: $(project_root)/.harness/worktrees/"
echo ""
log_info "To inspect a pair's work:"
log_info "  cd $(project_root)/.harness/worktrees/${TEAM_NAME}-<pair_id>"
log_info "  git log --oneline"
echo ""
log_info "To merge a pair's branch:"
log_info "  git merge harness/${TEAM_NAME}-<pair_id>"

# Exit with failure if any pair failed
if [[ ${#FAILED_PAIRS[@]} -gt 0 ]]; then
  exit 1
fi
