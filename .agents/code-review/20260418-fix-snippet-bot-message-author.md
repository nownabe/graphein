# 20260418-fix-snippet-bot-message-author

## Context

Issue: https://github.com/nownabe/graphein/issues/82

### Background

The add_snippet shortcut handler silently uses the wrong author for bot/system messages. When a message has no `user` field, it falls back to the shortcut-triggering user's ID, creating a snippet with an incorrect author.

### Summary

Show an info modal when the message author is missing (bot/system messages) instead of silently falling back to the triggering user. Adds `slack.snippet.notUserMessage` i18n keys for both ja and en locales.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [cdbe3a8](https://github.com/nownabe/graphein/commit/cdbe3a82a20b04d79e1f65a27d8aaa6d923b9423)

The changes correctly address two issues: (1) bot/system messages with no `user` field now show an info modal instead of silently falling back to the triggering user as author, and (2) deactivated authors now show an error modal via `views.update` instead of leaving the loading modal stuck. Both patterns are consistent with existing handlers (e.g., the kudos deactivated-author check at line 948). The i18n keys are added for both locales. No issues found.
