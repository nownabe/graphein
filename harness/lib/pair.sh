#!/usr/bin/env bash
# Run a Generator-Evaluator pair loop for a single sprint contract

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

run_pair() {
  local team_name="$1"
  local pair_id="$2"  # e.g., "01"
  local work_dir="$3"
  local max_sprints="$4"
  local budget="$5"
  local model="$6"

  local harness="$(harness_root)"
  local project="$(project_root)"
  local prefix="${team_name}/pair-${pair_id}"
  local pair_dir="${work_dir}/pairs/${pair_id}"

  mkdir -p "$pair_dir"

  # Create isolated worktree
  log_prefix "$prefix" "Creating worktree..."
  local worktree_path
  worktree_path="$(init_worktree "$team_name" "$pair_id")"
  log_prefix "$prefix" "Worktree: ${worktree_path}"

  # Symlink the harness work_dir into the worktree so agents can find it
  # (the work_dir is in the main repo's .harness/, not in the worktree)

  local verdict="FAIL"

  for sprint in $(seq 1 "$max_sprints"); do
    log_prefix "$prefix" "=== Sprint ${sprint}/${max_sprints} ==="

    # --- Generator ---
    run_generator "$team_name" "$pair_id" "$sprint" "$max_sprints" \
      "$work_dir" "$pair_dir" "$worktree_path" "$budget" "$model" "$harness"
    local gen_exit=$?

    if [[ $gen_exit -ne 0 ]]; then
      log_prefix "$prefix" "Generator failed (exit ${gen_exit}), aborting pair"
      break
    fi

    # --- Evaluator ---
    run_evaluator "$team_name" "$pair_id" "$sprint" "$max_sprints" \
      "$work_dir" "$pair_dir" "$worktree_path" "$budget" "$model" "$harness"
    local eval_exit=$?

    if [[ $eval_exit -ne 0 ]]; then
      log_prefix "$prefix" "Evaluator failed (exit ${eval_exit}), aborting pair"
      break
    fi

    # Check verdict
    if [[ -f "${pair_dir}/evaluation.md" ]] && grep -qi "Verdict: PASS" "${pair_dir}/evaluation.md"; then
      verdict="PASS"
      log_prefix "$prefix" "PASS on sprint ${sprint}"
      break
    fi

    if [[ "$sprint" -eq "$max_sprints" ]]; then
      log_prefix "$prefix" "Max sprints reached (${max_sprints}), stopping with FAIL"
    else
      log_prefix "$prefix" "FAIL — feedback written, starting next sprint"
    fi
  done

  # Summary
  if [[ "$verdict" == "PASS" ]]; then
    log_ok "${prefix}: PASSED"
  else
    log_error "${prefix}: FAILED after ${max_sprints} sprints"
  fi

  echo "$verdict"
}

run_generator() {
  local team_name="$1"
  local pair_id="$2"
  local sprint="$3"
  local max_sprints="$4"
  local work_dir="$5"
  local pair_dir="$6"
  local worktree_path="$7"
  local budget="$8"
  local model="$9"
  local harness="${10}"

  local prefix="${team_name}/pair-${pair_id}/gen"

  log_prefix "$prefix" "Starting generator (sprint ${sprint})"

  # Remove previous generator-done.md
  rm -f "${pair_dir}/generator-done.md"

  local prompt
  prompt="$(render_prompt "${harness}/prompts/generator.md" \
    "WORK_DIR=${work_dir}" \
    "PAIR_ID=${pair_id}" \
    "PAIR_DIR=${pair_dir}" \
    "SPRINT=${sprint}" \
    "MAX_SPRINTS=${max_sprints}" \
  )"

  local user_prompt="Implement the sprint contract. This is sprint ${sprint} of ${max_sprints}."
  if [[ "$sprint" -gt 1 ]] && [[ -f "${pair_dir}/feedback.md" ]]; then
    user_prompt="Fix the issues reported in feedback. This is sprint ${sprint} of ${max_sprints}. Read ${pair_dir}/feedback.md first."
  fi

  local gen_log="${pair_dir}/generator-sprint-${sprint}.log"

  set +e
  (
    cd "$worktree_path"
    echo "$user_prompt" | claude -p \
      --append-system-prompt "$prompt" \
      --dangerously-skip-permissions \
      --max-budget-usd "$budget" \
      --model "$model" \
      --add-dir "$work_dir" "$pair_dir"
  ) 2>&1 | tee "$gen_log" | prefix_stream "$prefix"
  local exit_code=${PIPESTATUS[0]}
  set -e

  if [[ $exit_code -ne 0 ]]; then
    log_prefix "$prefix" "Failed (exit ${exit_code}). See ${gen_log}"
  else
    log_prefix "$prefix" "Done"
  fi

  return $exit_code
}

run_evaluator() {
  local team_name="$1"
  local pair_id="$2"
  local sprint="$3"
  local max_sprints="$4"
  local work_dir="$5"
  local pair_dir="$6"
  local worktree_path="$7"
  local budget="$8"
  local model="$9"
  local harness="${10}"

  local prefix="${team_name}/pair-${pair_id}/eval"

  log_prefix "$prefix" "Starting evaluator (sprint ${sprint})"

  # Remove previous evaluation artifacts
  rm -f "${pair_dir}/evaluation.md"
  rm -f "${pair_dir}/feedback.md"

  local prompt
  prompt="$(render_prompt "${harness}/prompts/evaluator.md" \
    "WORK_DIR=${work_dir}" \
    "PAIR_ID=${pair_id}" \
    "PAIR_DIR=${pair_dir}" \
    "SPRINT=${sprint}" \
    "MAX_SPRINTS=${max_sprints}" \
  )"

  local eval_log="${pair_dir}/evaluator-sprint-${sprint}.log"

  set +e
  (
    cd "$worktree_path"
    echo "Evaluate the implementation against the sprint contract." | claude -p \
      --append-system-prompt "$prompt" \
      --dangerously-skip-permissions \
      --max-budget-usd "$budget" \
      --model "$model" \
      --add-dir "$work_dir" "$pair_dir"
  ) 2>&1 | tee "$eval_log" | prefix_stream "$prefix"
  local exit_code=${PIPESTATUS[0]}
  set -e

  if [[ $exit_code -ne 0 ]]; then
    log_prefix "$prefix" "Failed (exit ${exit_code}). See ${eval_log}"
  else
    log_prefix "$prefix" "Done"
  fi

  return $exit_code
}
