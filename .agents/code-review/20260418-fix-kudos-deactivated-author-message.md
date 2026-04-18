# 20260418-fix-kudos-deactivated-author-message

## Context

Issue: https://github.com/nownabe/graphein/issues/83

### Background

The add_kudos_modal view submission handler shows a misleading "noEntries" message when the resolved author is deactivated, confusing users into thinking there are no kudos entries when the actual problem is a deactivated author.

### Summary

Add a dedicated `slack.kudos.deactivatedAuthor` i18n message (ja + en) and use it in the kudos modal handler instead of the generic `slack.kudos.noEntries` message when the author is deactivated.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [f1295cc](https://github.com/nownabe/graphein/commit/f1295cc8652b73ae7a2c6f3d2ac3cc04b8095f30)

The fix correctly replaces the wrong i18n key (`slack.kudos.noEntries`) with a new dedicated key (`slack.kudos.deactivatedAuthor`) in the deactivated-author branch of the kudos modal handler. Both ja and en translations are added in the proper location within the messages file. No issues found.
