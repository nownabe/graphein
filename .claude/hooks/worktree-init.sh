#!/bin/bash
WORKTREE_PATH=$(jq -r '.worktree_path')
cd "$WORKTREE_PATH" && mise trust
