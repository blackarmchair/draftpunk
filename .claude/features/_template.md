# Feature: <short title>

## Goal
What user-visible outcome should exist?

## Non-goals
What are we explicitly not doing?

## UX / Behavior
- Bullet list of expected behavior

## Data / Contracts
- Does this touch ranking file behavior? If yes, restate the invariant:
  - User ranking sheet is gospel; app must not override without explicit permission.

## Acceptance Criteria (Gatekeeper checks)
- [ ] Works end-to-end for: <scenario 1>
- [ ] Handles error cases: <scenario 2>
- [ ] No change to ranking source-of-truth behavior unless explicitly stated
- [ ] Typecheck passes
- [ ] Tests pass (if any)
- [ ] No noisy console logs in production paths
- [ ] Electron security boundaries respected (renderer doesn’t do privileged stuff)

## Notes / Links
- Related files:
- Screenshots:
