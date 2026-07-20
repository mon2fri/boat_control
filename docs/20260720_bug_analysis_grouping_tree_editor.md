# Bug Analysis — GroupingTreeEditor: Labels and Visibility Under Nesting

**Date:** 2026-07-20
**Component:** `frontend/src/features/rules/GroupingTreeEditor.tsx` (`PerGroupingEditor`)
**Symptom:** In PER GROUPING mode, creating a sequence of groups that nest one inside the next caused (a) the fieldset legend to silently reuse the slot name `Group 1` for whichever root wrapper was present, and (b) the originally-created group to become invisible (it was rendered only as a terse `{kind} group ({n} members)` label with no way to inspect its contents).

---

## Reproduction

1. Add 4 conditions to a rule. Set join mode to PER GROUPING.
2. Select `name` + `status` → **Create Group 1** (AND, 2 members). The fieldset is labelled `Group 1` — OK.
3. Select `region` + **Group 1** → **Create Group 2** (AND). The new outer wrapper is labelled `Group 1` (because it's now at `rootGroups[0]`); the original `Group 1` is shown only as the terse `AND group (2 members)` label tucked inside it. The picklist then offers only this new wrapper as `Group 1`, not as the `Group 2` the user expected.
4. Repeat: pick `score` + the picklist entry labelled `Group 1` (which is actually `Group 2`) → produce `Group 3`. Outer-most wrapper is again relabelled `Group 1`; both intermediate groups vanish into the hint preview:

   ```
   overall: cond 4 AND group 2
   group 2: cond 3 AND group 1
   group 1: cond 1 AND cond 2
   ```

---

## Root Cause

The label `Group ${i + 1}` in the fieldset legend and the picklist was tied to the **rootGroups array index**. As soon as a root group was added as a member of another group, it was removed from `rootGroups` and its slot vacated; the new outer wrapper inherited index `0` and therefore the name `Group 1`. This silently swapped stable user-meaningful identities (the group created second became "the only thing named Group 1"), and the original group's structure was hidden behind a one-line summary that hid which conditions it contained.

The earlier visual-separation fix (Sections A/B in the file) addressed accidental nesting but did not address the labelling instability; users could now nest intentionally and still hit the swap.

---

## Fix

1. **Stable group identities via post-order IDs.** A new `groupIds` memo walks every `GroupNode` in the tree post-order (children before parents) and assigns each a sequential integer, with the deepest group getting `1`. The legend, the picklist, and the inline `AddMemberControl` all read from this map, so a group that was `Group 1` when first created remains `Group 1` even after it is nested inside a new outer wrapper.
2. **Render nested groups as inline fieldsets.** A recursive `GroupMembersView` replaces the previous "terse label" rendering. When a member is itself a group (not a leaf), it now renders its own `<fieldset>` with the same stable legend (`Group N (KIND, n members)`) and its own member list. The user can therefore inspect the contents of every group in the tree.
3. **Visual picklist separation** (the earlier fix) is preserved; only the labels changed to use the stable IDs.

### Concrete mapping for the reproduction above

After step 2 the fieldset is labelled **`Group 1`** (members `name`, `status`).

After step 3 the only root fieldset is labelled **`Group 2`** (members `region` and a nested fieldset labelled **`Group 1`** containing `name`, `status`). The picklist now correctly shows **`Group 2 (AND, 2 members)`**, not `Group 1 (AND, 2 members)`.

After step 4 the only root fieldset is labelled **`Group 3`** (members `score` and a nested **`Group 2`** fieldset, itself containing a nested **`Group 1`** fieldset). Matches the hint preview.

### Files Changed

| File | Change |
|------|--------|
| `frontend/src/features/rules/GroupingTreeEditor.tsx` | Added a `groupIds` post-order memo and `idOf` / `groupTitle` / `groupFullLabel` helpers; rewired the fieldset legend, picklist labels, and `AddMemberControl` to use these stable IDs. Added a recursive `GroupMembersView` component that renders nested groups as their own inline fieldsets (preserving edit/`×` affordances only for the root currently being edited). Picklist visibility already keyed off `availableItems.length >= 2`. |
| `frontend/src/features/rules/GroupingTreeEditor.test.tsx` | Updated the existing nesting test to assert the new nested-fieldset rendering. Added a regression test that builds a three-deep nest and asserts each of `Group 1`, `Group 2`, and `Group 3` appears in the DOM with its identity intact. |

---

## Key Takeaway

Label stability and visibility are independent UI bugs that compound under nesting. The earlier visual-separation fix prevented *accidental* nesting by separating conditions from groups in the picker, but it did not address the *intentional* nesting case where the user does want to build chains — there the fieldset legend was reusing a counter that no longer matched user meaning. Both fixes are required: separation prevents the accidental case, stable IDs + inline rendering make the intentional case legible.
