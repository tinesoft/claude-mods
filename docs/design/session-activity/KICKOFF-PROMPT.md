# Kick-off prompt for Claude Code

1. Unzip this package at the root of `tinesoft/claude-mods` (on a `chore/design-handoff` branch off `develop`),
   so the files land in `docs/design/session-activity/`.
2. Commit: `docs(session-activity): add design handoff`.
3. Start Claude Code in the repo and paste the prompt below.

---

We're building the `session-activity` Claude Code mod in this Nx monorepo (`mods/session-activity`).

Read these first, in order:
1. `docs/design/session-activity/plan.md`: the implementation plan (repo setup, mod structure, event mapping, UI spec, tests, milestones).
2. `docs/design/session-activity/DESIGN.md`: the design spec (types, glyphs, colours, states, band and pane rules).
3. `docs/design/session-activity/artboards/*.dc.html`: the validated mockups. They are web UI; treat them
   as visual and behavioural reference, not code to port or run. Their `<script data-dc-script>` blocks hold
   the sample data and interactions. Their `./support.js` is served by the design canvas and is
   intentionally absent; don't look for it or recreate it.
4. The mods docs: https://code.claude.com/docs/en/plugins/mods/create, /interface, /events, /reference.
   Load `/plugin-authoring` too. The generated `.claude-plugin/types/claude-code/index.d.ts` wins over any doc.

Then start with milestone M0 (repo scaffold) from plan.md. Before writing code, list anything in
plan.md or DESIGN.md that conflicts with the mods API for this Claude Code version, and stop for my answer.

Conventions: Conventional Commits with the project name as scope, PRs into `develop`, never push to `main`.
After each change run `claude plugin validate mods/session-activity --strict` and `claude plugin test`.
