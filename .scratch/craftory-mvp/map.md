# Craftory MVP

## Destination

Craftory 1.0.0 released: the wayfinder parent rail (Local, GitHub and GitLab maps) designed and built, the three automations active, the cloud text summary confirmed, and the release bar met (live client check, end-to-end fixture run, README screenshots, O1 and O2 closed in the plan, `craftory@1.0.0` cut from `main`).

## Notes

- Domain: `mods/craftory/GLOSSARY.md`. Plan and design: `docs/design/craftory/plan.md`, `DESIGN.md`.
- Principle: Matt's skills do the work; Craftory submits commands, observes and edits configuration files only.
- Out of the MVP by the user's call: multi-context `GLOSSARY-MAP.md` in the Craftory Glossary tab.
- Plan, don't do: tickets produce decisions, not code. Execution items below stay in the fog until a decision makes them specific.

## Decisions so far

- [Map as an optional parent of a Feature](issues/01-map-and-feature.md): derived from the tracker; a Feature stores only an optional `map` link.
- [Read-only plus submit](issues/02-read-only-plus-submit.md): the mod shows the frontier and submits `/wayfinder`; it never edits maps or tickets.
- [Equal tracker support](issues/03-tracker-parity.md): Local, GitHub and GitLab each get a reader behind one shared model; Other is links only.
- [Parent rail layout](issues/04-rail-layout.md): one chip in the single-row rail opens a frontier card above it; collapsed summary on narrow bands; chip heads the mobile Flow tab.
- [Local maps when the tracker is remote](issues/05-scratch-when-tracker-is-remote.md): read the configured tracker plus Local `.scratch` maps; source shown in the card kicker; one chip for the active map with a switcher.
- [Does summary.ts cover the cloud text summary](issues/12-cloud-summary.md): yes; gaps are doc alignment for chat and `-p`, two untested branches, and optional next-action detail.

- [When the mod suggests /wayfinder](issues/08-wayfinder-suggest-trigger.md): a band notice once the Align grill passes a configurable 12 questions; dismissed per Feature; offers Attach when an unattached open map exists.
- [Evidence rules for a map](issues/09-map-evidence.md): state comes from tracker structure only, never skill prose; no "destination reached" state, just "No open tickets"; a stale `map` link is shown quietly and never rewritten.
- [Which SDLC behaviors get enforced vs. guided](issues/06-enforced-vs-guided.md): designed hooks cover the workflow softly; add opt-in deny rules, a test-run-on-turn-complete hook and an unmet-Done-when nudge; mod hooks only.
- [Frontier in the Tickets tab](issues/07-tickets-tab-frontier.md): a map card above the Inbox (Takeable, Claimed, Blocked, collapsed Decided); Work next ticket in its header, disabled when nothing is takeable.
- [What the three automations do](issues/10-automations-behavior.md): off by default, each a band notice plus a click that submits the skill, once per session or Feature; last architecture run kept in git-ignored `.craftory/state.json`.
- [Details of the added hooks](issues/11-hook-details.md): test command from `worktrees.test`, run after a Build implementer's final turn; once-per-phase unmet-Done-when nudge; deny rules `skipGate` and `editOnIntegrationBranch`, all opt-in.
- [Wayfinder fixtures](issues/13-wayfinder-fixtures.md): real files compiled to a generated TS module under `fixtures/wayfinder/1.3/`; `mixed` plus edge-state fixtures per tracker; Local snapshot, GitHub/GitLab captured then edited; one Local end-to-end run.
- [Local features read from .scratch](issues/14-local-scratch-features.md): `.scratch` is the only Local layout, read in place; refs are paths (`csv-export`, `csv-export/01`); skills get file paths; Matt's local template is vendored; the flat layout, folder setting and import go.

## Not yet specified

Only the human-only release bar is left; every agent ticket under `craftory-wayfinder-rail`, `craftory-automations-hooks` and `craftory-design-parity` is resolved.

- Live client check on VS Code and mobile, light and dark (terminal and Desktop passed on 2026-11-11): [automations-hooks ticket 11](../craftory-automations-hooks/issues/11-live-client-check.md).
- GitHub and GitLab sandbox fixtures captured and live-checked; the readers are built against hand-made files until then: [wayfinder-rail ticket 06](../craftory-wayfinder-rail/issues/06-capture-github-gitlab-fixtures.md).
- README screenshots, review of the end-to-end Local-tracker fixture run, and `craftory@1.0.0` cut from `main` through `nx release`: [automations-hooks ticket 12](../craftory-automations-hooks/issues/12-release-sign-off.md).

## Out of scope

- Multi-context `GLOSSARY-MAP.md` in the Craftory Glossary tab: ruled out of the 1.0.0 MVP by the user.
