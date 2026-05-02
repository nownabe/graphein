# 20260503-docs-add-ngrok-setup

## Context

Issue: N/A

### Background

The README setup instructions were missing the ngrok step required for Slack OIDC login during local development. The OIDC callback needs a publicly reachable URL, so ngrok is necessary even when using Socket Mode.

### Summary

Added ngrok setup as step 2 in the README, updated BASE_URL description to reference the ngrok URL, and renumbered subsequent steps.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [a9538ec](https://github.com/nownabe/graphein/commit/a9538ece106302db6077530ce411cb7997d23b0f)

Documentation-only change. Adds the missing ngrok setup step to README, updates the BASE_URL description to reference the ngrok URL, and renumbers subsequent steps. Clear and correct.
