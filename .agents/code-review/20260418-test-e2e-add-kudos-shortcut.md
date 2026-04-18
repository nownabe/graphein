# 20260418-test-e2e-add-kudos-shortcut

## Context

Issue: https://github.com/nownabe/graphein/issues/104

### Background

Part of E2E test coverage expansion (#99). Adding Playwright E2E test for the Add Kudos shortcut flow to verify the full Slack-to-Graphein integration works end-to-end.

### Summary

Add E2E test that posts a kudos message to a kudos-configured channel, simulates the Add Kudos modal submission, verifies a :tada: reaction, and confirms the kudos entry appears in the Graphein Kudos page UI. Also adds the `submitAddKudosModal` helper to `slack-interaction.ts`.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [498dd62](https://github.com/nownabe/graphein/commit/498dd6268ab139f45093b0bf8708e69e1847c378)

Changes are correct and follow established patterns. The test mirrors the existing `add-snippet.test.ts` structure, the `submitAddKudosModal` helper correctly matches the `private_metadata` format expected by the `add_kudos_modal` view handler in `bolt.ts`, and the kudos message format uses the correct `<@USER_ID> text` pattern required by the kudos parser.
