# CLAUDE.md — Project Guidance

## Product
This is a desktop app that helps users manage dynasty fantasy football teams on the Sleeper platform.

Primary use cases:
- Importing and maintaining custom player rankings
- Draft assistance during live drafts
- Roster evaluation and player lookups

The app should feel fast, reliable, and predictable. Prefer correctness and stability over clever or experimental features.

### Non-goals
- Do not automate actions on Sleeper (no bot drafting, no account automation).
- Do not introduce AI-driven ranking overrides or “smart” reordering unless explicitly requested.
- Do not modify user-provided ranking data without explicit user action.

---

## Tech Stack
- Desktop framework: **Electron**
- Renderer: **React + TypeScript**
- Build system: **electron-vite**
- Storage: **browser localStorage (renderer-side only)**
- Data source: **Sleeper public API endpoints (unauthenticated)**

---

## Architecture

### Process Boundaries
- Renderer code should not directly access Node APIs.
- Any filesystem or OS interactions must go through a preload script + IPC.
- Keep IPC interfaces minimal, typed, and secure.

### Data Flow
- Sleeper data is fetched from public endpoints and cached in memory or localStorage.
- User ranking data is imported from a CSV file and treated as authoritative.
- Parsing and validation should occur at boundaries; internal logic should use typed objects.

---

## Data Contracts (Do Not Break)

### User Ranking Sheet (Critical)
The user-uploaded ranking sheet is **the single source of truth for draft order**.

Rules:
- The app must never silently reorder, override, or reinterpret user rankings.
- Any transformation or editing of ranking data must be:
  - User-initiated
  - Clearly communicated
  - Reversible
- The original uploaded file must never be modified without explicit permission.

If features require derived rankings (tiers, projections, adjustments), those must be stored separately and must not overwrite the original user ranking data.

### Local Storage
- localStorage is used for user preferences, cached data, and derived state.
- Cached Sleeper data should be safe to refresh or rebuild.
- Do not store sensitive data.

---

## Engineering Principles
- Prefer small, composable modules over large components.
- Keep business logic (rank merging, draft logic, projections) separate from UI components.
- UI should be responsive; memoize expensive calculations and avoid unnecessary rerenders.
- Avoid introducing new dependencies unless there is a clear, justified benefit.

---

## Quality Bar
- Use TypeScript strictly; avoid `any` unless unavoidable and documented.
- Handle loading and error states for all async operations.
- User-facing errors should be clear and actionable.
- Do not log excessive information to the console in production builds.

---

## Security & Privacy
- Only use Sleeper public API endpoints.
- Do not request or store Sleeper login credentials.
- Do not send user league or roster data to third-party services.
- Follow Electron security best practices (contextIsolation enabled, no remote module, least-privileged IPC).

---

## Review Focus
When reviewing code, prioritize:

1. **Preserving the integrity of the user’s ranking sheet**
2. Correctness of draft and roster logic
3. Clear separation of UI and business logic
4. Avoiding unnecessary React rerenders or state duplication
5. Respecting Electron security boundaries

# AI Workflows

## Commands
- /pragmatic-code-review - review current diff
- /security-review - security scan current diff
- /design-review - UI review (requires Playwright MCP)

## Agents
- Pragmatic Code Review Agent: [docs/code-review.md](docs/code-review.md)
- Design Review Agent: [docs/design-review.md](docs/design-review.md)
- Security Review Agent: [docs/security-review.md](docs/security-review.md)
- Ranking Gatekeeper Agent

## Orchestration Workflow
- Orchestrate features with: `/orchestrate-feature`
- Feature specs live in: `.claude/features/`
- Ranking contract gatekeeper: `@ranking-contract-gatekeeper`


These documents describe how each agent thinks, what it focuses on, and how it should be used.