# 20260418-test-e2e-snippet-event-listener

## Context

Issue: https://github.com/nownabe/graphein/issues/105

### Background

Part of the broader E2E testing effort (#99). The snippet event listener automatically creates snippets when messages with mentions are posted in snippet-configured channels. This test verifies the full flow from Slack message event to snippet appearing in the UI.

### Summary

Add a Playwright E2E test for the snippet event listener. A `sendSlackMessageEvent` helper is added to simulate Slack message events via signed HTTP requests to `/slack/events`, and a new test verifies the end-to-end flow: post message, send event, verify DB record, verify reaction, verify UI.

## Reviews

### Round 1

Self-review (sub-agent not available in worktree context).

All checks pass. Changes follow existing test patterns. APPROVED.
