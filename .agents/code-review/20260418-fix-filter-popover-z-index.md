# 20260418-fix-filter-popover-z-index

## Context

Issue: N/A

### Background

PR #121 lowered the z-index of filter controls to fix overlap with the navigation bar, but this caused filter popovers to render behind task/snippet cards. This change restores proper stacking.

### Summary

Restore filter popover visibility by adding `z-[5]` to filter containers (creating a stacking context below nav `z-10`) and setting popovers to `z-10` within that context.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [19cc4ff](https://github.com/nownabe/graphein/commit/19cc4ffc9484b5add7cf9e6811dc61dac62fb004)

Z-index stacking fix is correct. The filter container at `z-[5]` creates a local stacking context below the nav bar (`z-10`), and popovers at `z-10` within that context will render above sibling cards but below the nav. Changes are consistent across both `kudos.tsx` and `snippets.tsx`.
