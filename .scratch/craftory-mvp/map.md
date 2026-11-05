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

- [Which SDLC behaviors get enforced vs. guided](issues/06-enforced-vs-guided.md): designed hooks cover the workflow softly; add opt-in deny rules, a test-run-on-turn-complete hook and an unmet-Done-when nudge; mod hooks only.

## Not yet specified

- Wayfinder fixtures: per-tracker fixtures pinned to mattpocock-skills 1.3.x, once the evidence rules and Tickets-tab design are decided.
- Release bar: live client check (band, pane, hover cards, `$.ui.ask` in a Skill hook, `TaskStop`, glyph widths, Desktop/VS Code/mobile light and dark), end-to-end Local-tracker fixture run, README screenshots.
- Cleanup: close O1 and O2, tick the stale M0/M2/M3 boxes in `plan.md`, settle `docs/issues` vs `.scratch` as the Local default, commit the pending glossary and agent docs.
- Cloud summary follow-ups: align DESIGN.md and the README on chat and `claude -p` replies, test the "No feature in flight" and unsupported-version branches, optionally name the next action.
- README and Settings wording once the "not built" limits are lifted.

## Out of scope

- Multi-context `GLOSSARY-MAP.md` in the Craftory Glossary tab: ruled out of the 1.0.0 MVP by the user.
