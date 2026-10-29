## Testing

Unit testing is not required, avoid it, only end to end testing and integration testing are priorities

## Take into account first

Whenever you are asked to plan something, please do not assume, ask the user first before implementing.

## Bug Fixing

You may try 15 times to fix a bug, then, add it to a Linear Issue, following the approved format Specs-Issue

## Spec-Driven Development

Work is planned and executed through numbered spec files in `specs/` (e.g. `01-A-nx-in-turborepo-nextjs-tanstack-out.md`), not ad hoc. A spec is the single source of truth for a bounded change; do NOT improvise outside it.

- **Create**: copy `specs/TEMPLATE.md` into a new `specs/NN-X-<short-slug>.md` (sequential number + phase letter, matching the `specs/` listing). Fill in the header (`Source`, `Depends on`, `Repo root`, `Result carried forward`), then Objectives, No-go, and Testing criteria. Every objective is a single verb sentence with its requirements and exact commands, checked off with `- [x]` when done.
- **Execute**: read the spec AND the nearest `AGENTS.md` (target workspace, then parents up to repo root) before starting. Implement only what the Objectives require; the No-go section lists what you MUST NOT do. If reality diverges from the spec, STOP and append a divergence — never silently drop it or rewrite objectives to match what you actually did.
- **Verify**: all Testing-criteria boxes checked = spec done. Keep every `- [ ]` box unchecked until it passes.
- **Divergences**: record each at the end of the spec (section 4, `### Divergences`) — what diverged, why, the fix attempts, and the impact. If a divergence stays OPEN because a later spec owns the fix, also create a tracking file in `specs/divergences/<spec-id>-<short-slug>.md` (source spec + the exact criteria it blocks, what's broken, why each fix was fenced, and a "how to clear it" checklist naming the resolving spec and re-verify commands). Link the tracking file from the spec's divergence entry. When the later spec lands and checks pass, mark the criteria `[x]` and delete the tracking file. See `specs/02-B-database-drizzle-to-mikroorm-kysely.md` for the canonical divergence format.