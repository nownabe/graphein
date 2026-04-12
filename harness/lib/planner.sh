#!/usr/bin/env bash
# Run the Planner agent to generate spec.md and sprint contracts

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

run_planner() {
  local team_name="$1"
  local requirement="$2"
  local num_pairs="$3"
  local work_dir="$4"
  local budget="$5"
  local model="$6"

  local harness="$(harness_root)"
  local project="$(project_root)"
  local prefix="${team_name}/planner"

  # Pad pair count for file naming (01, 02, ...)
  local num_pairs_padded
  num_pairs_padded="$(printf '%02d' "$num_pairs")"

  log_prefix "$prefix" "Starting planner (${num_pairs} contracts to generate)"

  local prompt
  prompt="$(render_prompt "${harness}/prompts/planner.md" \
    "NUM_PAIRS=${num_pairs}" \
    "NUM_PAIRS_PADDED=${num_pairs_padded}" \
    "WORK_DIR=${work_dir}" \
  )"

  local planner_log="${work_dir}/planner.log"

  set +e
  claude -p \
    --append-system-prompt "$prompt" \
    --dangerously-skip-permissions \
    --max-budget-usd "$budget" \
    --model "$model" \
    "$requirement" \
    2>&1 | tee "$planner_log" | prefix_stream "$prefix"
  local exit_code=${PIPESTATUS[0]}
  set -e

  if [[ $exit_code -ne 0 ]]; then
    log_prefix "$prefix" "Planner failed (exit code: ${exit_code}). See ${planner_log}"
    return 1
  fi

  # Verify outputs exist
  if [[ ! -f "${work_dir}/spec.md" ]]; then
    log_prefix "$prefix" "Planner did not produce spec.md"
    return 1
  fi

  local contract_count
  contract_count="$(find "${work_dir}/sprint-contracts" -name '*.md' -type f 2>/dev/null | wc -l)"
  if [[ "$contract_count" -eq 0 ]]; then
    log_prefix "$prefix" "Planner did not produce any sprint contracts"
    return 1
  fi

  log_prefix "$prefix" "Done: spec.md + ${contract_count} sprint contracts"
  return 0
}
