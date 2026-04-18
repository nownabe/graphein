# 20260418-test-kudos-event-listener

## Context

Issue: https://github.com/nownabe/graphein/issues/106

### Background

Part of E2E test coverage (#99). The kudos event listener automatically captures kudos from messages posted in kudos-configured channels. This test verifies the full flow: posting a message with a mention in a kudos channel, processing the event, and confirming the kudos appears in the database and web UI.

### Summary

Add Playwright E2E test for the kudos event listener flow. Also adds the `ensureKudosChannel` DB helper needed to register the test channel before the event handler can process it.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [dd84f06](https://github.com/nownabe/graphein/commit/dd84f06037952a1d6cc48a2418e351035e2900ef)

Changes are clean and follow established E2E test patterns. The test correctly mirrors the snippet-event test structure, uses proper cleanup in afterEach, ensures the kudos channel is registered before tests run, and verifies the full flow from message event through DB to UI.
