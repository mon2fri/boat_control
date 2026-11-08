# Grouped validation integration review

Status: **IN PROGRESS — not accepted for UI validation yet**

## Baseline and branch state

- Setup baseline: `e972e3fe72c820e9a76316137e5cfba6389374bd`.
- Requirement parent: `6b4bc94` (on `main` at worker dispatch).
- Integration branch/worktree: `work/20261108-grouped-validation-integration` at
  `/home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/integration`.
- Initial integration HEAD: `e972e3f` (same as setup baseline); no initial local
  modifications or untracked files.
- Original checkout is a separate worktree on
  `work/20261108-grouped-validation`; it has an untracked `screenshots/` directory.
  This review will not modify it or inspect live user data.
- Worker worktrees A–D were checked with `git status --short --branch`; all were
  clean. No worker worktree will be modified.

## Delivery commits discovered (all compared with setup commit)

| Worker | Original ordered commits | Dependency notes |
| --- | --- | --- |
| A | `c388ce9241dc562d63ecb82eccca0fdd2b0f8173`, `057dbab74bb999649b37ec2dc72a84bb6b04459f`, `f24acfaf07fddf9af03852e2cbd544bfc3ad71fe` | Helper module then rules schema/runtime; B consumes A interfaces. |
| B | `e0573d8b8e58aa202b22038621d9bc0c169f9175`, `3dccf93fa5f109a7422ae83afd26e78060a059f2` | Backend runtime; requires A's published normalized form/helpers. |
| C | `81fa44b33f3214348f02253572673565d42af9e8`, `d6b97a94f4d23c6e7689d7b65498cd2d985f3695`, `a6edaa7cf0a56c1feb03dcfdc2416e82c61802f6`, `f249301a31fe4fc3ceedad6b0cd9b62918295b5d` | Frontend transport/state and subsequent no-filter/mixed-payload fix. |
| D | `656ed1527ca3e89df759f388d007b4d359c9d4f2`, `9704c2c2eb55f82f74355ee82155ca97bf578eda`, `ed908c4b1e4558e249494102ab5b8ba038c17efa` | Visual editors; C state interfaces are needed for full persistence. |

The actual incoming branch tips are A `f24acfaf07fddf9af03852e2cbd544bfc3ad71fe`,
B `3dccf93fa5f109a7422ae83afd26e78060a059f2`, C
`f249301a31fe4fc3ceedad6b0cd9b62918295b5d`, and D
`ed908c4b1e4558e249494102ab5b8ba038c17efa`. All four source/doc range diffs
passed `git diff --check` at review start. This does not establish correctness.

## Review log

### Intake

- Read reviewer instructions, shared contract, requirement, all four worker
  instructions, and each worker's implementation and delivery record.
- Worker documentation exists and describes interfaces, compatibility,
  ownership, checks, known limitations, and reported fixes. A/B specifically
  identify `backend/apps/configs/views.py` ownership overlap; C/D document the
  legacy first-outcome mirror disagreement for integration review.
- Independent source review and focused tests are ongoing. No commit has been
  cherry-picked yet.
- A source and documentation commits accepted in order and cherry-picked as
  `9dbc7ea` (original `c388ce9`), `018ab75` (original `057dbab`), `fba2283`
  (original `f24acfaf`). Focused A/rule tests: 145 passed.
- B source and delivery documentation accepted as `418c44b` (original `e0573d8`)
  and `5912229` (original `3dccf93`). The `backend/apps/configs/views.py`
  conflict was resolved by retaining A's shared full-rule serializer and B's
  remaining runtime/config behavior; B's duplicate snapshot serializer was not
  kept. Focused B and related backend tests: 253 passed; B-scoped ruff passed.
- Substantive finding: A's runtime `Rule` object stores a parsed immutable
  `GroupingNode`, but B's outcome normalizer only accepted a wire dictionary.
  B-shaped mock tests passed, while the real catalog execution path would reject
  nested outcomes. See the reviewer fix documentation and regression below.
  The bounded integration fix uses A's `outcome_expression` and shared pure
  helpers, with an actual A-model/B-runtime opposite-flags regression: 132
  focused tests passed after correcting parser error compatibility.

## Acceptance coverage and findings

To be completed during independent review. Requirement coverage will distinguish
worker claims from verified integrated behavior. Any fixes will include cause,
scope, test evidence, implementation notes, and resulting commit hashes.

### Finding — nested outcomes fail with materialized A rule objects (high)

- **Cause:** B's runtime normalizer parsed only wire dictionaries in
  `logic_grouping_tree`; A's parser materializes the tree into `GroupingBranch`
  objects. Runtime tests supplied a dictionary-shaped fake, so the mismatch was
  not exercised.
- **Fix:** Reviewer integration change in `backend/apps/runs/grouped_logic.py`
  consumes `Rule.outcome_expression`, accepts parsed nodes, and delegates
  predicates/tree operations to A's shared helpers. Added
  `tests/backend/test_grouped_validation_integration.py` to run the exact
  `(SA=Y AND CVA=N) OR (SA=N AND CVA=Y)` expression through actual
  `rule_from_payload` and runtime code. Tests prove Y/N and N/Y pass and Y/Y,
  N/N, invalid, null and blank cases fail, with complete outcome columns/values.
- Full regression evidence and manual follow-up prompt:
  `docs/20261108_grouped_validation_integration_fixes.md`.
- The fix commit hash will be added after commit.

## Validation record

No integrated check has been run yet. Exact commands, exits, and results will be
recorded here as they are run. Tests/app setup must use isolated database,
configuration, upload, report, and tracking paths, not original-checkout data.

## Unresolved issues

- Review and integration pending.
- Browser verification status pending; no browser evidence is claimed.
