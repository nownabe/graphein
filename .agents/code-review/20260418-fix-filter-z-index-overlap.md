# 20260418-fix-filter-z-index-overlap

## Context

Issue: https://github.com/nownabe/graphein/issues/101

### Background

The filter controls on the kudos/snippets pages are rendered in front of the navigation bar (higher z-index), causing the nav to be obscured when scrolling or when the filter area overlaps.

### Summary

Lower the z-index of filter container divs and popover dropdowns so the sticky navigation bar always renders above them.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [975afd3](https://github.com/nownabe/graphein/commit/975afd380773d04f015368d4f40fb7bb4c9fdb23)

The changes correctly fix the z-index stacking issue. The nav uses `z-10`, so removing `z-10` from the filter container and lowering popovers from `z-30` to `z-[5]` ensures popovers appear above surrounding content but below the sticky nav. The fix is consistent across both `kudos.tsx` and `snippets.tsx`.
