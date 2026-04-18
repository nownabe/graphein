# 20260418-test-e2e-add-snippet

## Context

Issue: https://github.com/nownabe/graphein/issues/103

### Background

Part of the E2E test suite expansion (#99). The Add Snippet shortcut flow needs an end-to-end test to verify that triggering the shortcut on a Slack message with mentions correctly creates a snippet in the database and displays it in the Graphein web UI.

### Summary

Add a Playwright E2E test for the Add Snippet shortcut flow: post a message with a mention to a snippet-monitored channel, simulate the modal submission via signed HTTP request, verify the snippet in DB, check the :memo: reaction, and confirm the snippet appears in the Snippets page UI.

## Reviews

### Round 1

**Status: APPROVED**

No issues found. The implementation:

- Follows the established E2E test pattern from `add-task.test.ts`
- `submitAddSnippetModal` helper correctly mirrors the `add_snippet_modal` payload structure from `bolt.ts`, including `view.id` (needed for `views.update` in the handler)
- Test properly handles the race condition with the automatic message event handler by waiting for and cleaning up any auto-created snippet before exercising the shortcut flow
- Cleanup in `afterEach` deletes both the DB snippet and the Slack message
- UI verification navigates to `/snippets?user=&usergroup=&postedBy=` to clear default filters, ensuring the new snippet is visible regardless of filter state
- All imports are correct and used
