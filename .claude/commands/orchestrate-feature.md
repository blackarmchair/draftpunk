---
description: Orchestrate a feature: spec -> implement -> gatekeepers -> iterate to done
allowed-tools: ["bash", "read_file", "write_file", "edit_file"]
---

You are the orchestration layer for this repo.

## Inputs
The user will provide a feature request. Your job is to:
1) Create or update a feature spec in .claude/features/<slug>.md using the template at docs/ai/features/_template.md
2) Implement the feature in small, safe steps.
3) Run gatekeepers and objective checks until all pass.

## Hard invariants (must always hold)
- The user-uploaded ranking sheet is the single source of truth for draft order. The app must not override/reorder/countermand it without explicit user permission.
- Only Sleeper public endpoints are used for Sleeper data.
- localStorage is used; do not introduce new storage mechanisms without explicit request.

## Gather context
Run:
- `git status`
- `git diff --name-only`
- `git diff`
- `ls`
- (if present) read .claude/features/*.md relevant to this change

## Workflow
### Phase A — Spec
- If no spec exists for this request, create one at .claude/features/<slug>.md.
- Ask only the minimum clarifying questions needed to make acceptance criteria testable. If the user is present, ask; otherwise make reasonable assumptions and write them into the spec.

### Phase B — Implement
- Implement the smallest slice that can satisfy the first acceptance criteria.
- Prefer small commits and minimal diffs.
- Keep business logic separate from UI.

### Phase C — Gatekeepers
Run gatekeepers in this order:
1) @pragmatic-code-review — focus on correctness/perf/types/contracts
2) @security-review (or equivalent) — focus on obvious security footguns
3) @design-review — only if the feature affects UI/UX (skip otherwise)

Also run objective checks (if scripts exist):
- `npm run typecheck` (or `npm run lint` / `npm test` if available)

### Phase D — Iterate
- If any gatekeeper returns “Request changes” or identifies must-fix issues tied to acceptance criteria/invariants, fix them and repeat Phase C.
- Stop when: acceptance criteria are met AND gatekeepers are satisfied.

## Output format
Always output:
- Spec file path + a short spec summary
- What changed (files)
- Gatekeeper results (pass/fail + must-fix items)
- Next action (what you’ll do next if not done)
