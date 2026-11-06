# Craftory wayfinder rail

Status: ready-for-agent

Source: `.scratch/craftory-mvp/map.md` (resolved decisions 01, 02, 03, 04, 05, 07, 08, 09, 13). Sibling spec: `.scratch/craftory-automations-hooks/spec.md`.

## Problem Statement

A developer using Craftory on a large, foggy effort charts a wayfinder map with Matt's `/wayfinder` skill, but Craftory cannot see it. The mod's rail shows one Feature at a time. It has no way to show that a Feature belongs to a larger map, how many decisions are made, which ticket to take next, or who has claimed what. The developer has to open the tracker, read the map by hand, and remember to type `/wayfinder` with the right argument. The mod also never tells a developer who is deep in a long Align grill that the idea may be too big for one session and wants a map.

Map support is also uneven across trackers. Local and GitHub are readable today for Features; GitLab shows links only, and none of them has a reader for the wayfinder map shape.

## Solution

Craftory treats a map as an optional parent of a Feature, derived from the tracker and never stored beyond one optional `map` link on the Feature. It reads maps from Local (`.scratch`), GitHub and GitLab through one shared model, and shows them in three places:

- A single chip in the rail that heads the Flow tab on mobile, opening a frontier card above the rail with a map switcher when several maps exist.
- A map card at the top of the pane's Tickets tab, with the groups Takeable, Claimed, Blocked and a collapsed Decided, plus a **Work next ticket** button.
- A band notice that suggests `/wayfinder` once an Align grill passes a configurable question count, or offers **Attach** when an open map already exists.

The mod is read-only plus submit: it never edits a map or ticket. It submits `/wayfinder <map>` and lets the skill claim, resolve and update. State comes only from tracker structure, never from skill prose, so a skill wording change cannot corrupt the display.

## User Stories

1. As a developer with a Local `.scratch` wayfinder map, I want Craftory to find the map without configuration, so that the frontier appears the first time I open the repo.
2. As a developer whose issue tracker is GitHub, I want Craftory to read maps labelled `wayfinder:map` with their sub-issues, so that the rail shows my map's real state.
3. As a developer whose issue tracker is GitLab, I want the same reading from the `wayfinder:map` label, `Part of #<map>` links and native blocking links, so that GitLab is not a second-class tracker.
4. As a developer on a tracker Craftory does not read, I want links to the map and its tickets, so that I can still jump to them.
5. As a developer whose configured tracker is remote but who also has a Local map under `.scratch`, I want both read without a prompt, so that my own wayfinder work is not hidden.
6. As a developer, I want the card kicker to name the source (`Wayfinder · Local · .scratch/<effort>`, `Wayfinder · GitHub · #12`), so that I know where a map came from.
7. As a developer with several open maps, I want one chip for the active map and a switcher in the card, so that the rail row does not grow.
8. As a developer, I want the active map to be the one my active Feature names, else the most recently updated open map, so that the chip is predictable.
9. As a developer, I want a Feature to store only an optional `map` reference, so that I never maintain map data by hand.
10. As a developer, I want a Feature with a valid `map` link to use it as is, so that the parent rail matches my intent.
11. As a developer whose tracker is unreachable, I want the stored `map` link kept with no warning, so that a network blip does not look like an error.
12. As a developer whose `map` link points to something missing or not map-shaped, I want a quiet "Map not found" line and a fallback to the active-map rule, so that I notice without being nagged.
13. As a developer, I want the stored stale `map` link never rewritten by the mod, so that I decide when to fix it.
14. As a developer, I want a closed map to still show its tickets, labelled "Closed", so that finished efforts remain readable.
15. As a developer, I want a ticket counted decided when its file says `Status: resolved` or its issue is closed, whatever labels say, so that the count follows structure.
16. As a developer, I want a ticket counted claimed when it is open with an assignee (or `Status: claimed` on Local), so that parallel sessions see each other's work.
17. As a developer, I want a ticket counted blocked while any blocker is unresolved, using native links first and a `Blocked by:` line only as a fallback, so that blocking is read the way the tracker draws it.
18. As a developer, I want the frontier to be open, unblocked, unclaimed tickets in order, so that "next" is unambiguous.
19. As a developer, I want ticket state never read from prose such as `## Answer` or Decisions so far, so that a ticket quoting another ticket cannot change the counts.
20. As a developer, I want child tickets limited to a map's structural children, so that a ticket mentioned in a comment does not join the map.
21. As a developer on GitHub or GitLab without native sub-issue or blocking support, I want a fallback to a task list, `Part of #<map>` and `Blocked by:` lines, so that the map still reads.
22. As a developer, I want the chip's open count to include claimed tickets and decided plus open to equal the total, so that the numbers add up.
23. As a developer, I want the card to show "No open tickets · Route clear?" instead of a "destination reached" state, so that the mod states a mechanical fact and I close the map myself.
24. As a developer, I want the "Route clear?" line to hint when Not yet specified is non-empty, so that I do not close a map that still has fog.
25. As a developer, I want no stale-claim detection, so that the mod never guesses and I release a claim in the tracker.
26. As a developer, I want one chip in the single-row rail that opens the frontier card above it, so that the rail stays compact.
27. As a developer in a narrow terminal, I want a collapsed summary on narrow bands, so that the rail never wraps.
28. As a mobile user, I want the chip to head the Flow tab, so that the map is the first thing I see.
29. As a developer, I want the pane's Tickets tab to open with a map card above the Inbox and Feature tickets, so that the frontier is the first fact on the tab.
30. As a developer, I want the header line `3 decided · 2 open (1 claimed)` and **Work next ticket**, so that status and action sit together.
31. As a developer, I want groups ordered Takeable, Claimed (with assignee), Blocked (each row saying `waits on <ticket name>`), then Decided collapsed, then **Open map**, so that the most actionable rows come first.
32. As a developer, I want **Work next ticket** to submit `/wayfinder <map>` for the next frontier ticket, so that the skill does the work.
33. As a developer, I want to submit a named ticket from a Takeable row, so that I can pick out of order.
34. As a developer, I want **Work next ticket** disabled with the hint "Nothing takeable" when no ticket is ready, so that I do not submit an empty run.
35. As a developer, I want claimed and blocked groups still shown when nothing is takeable, so that I can see why.
36. As a developer, I want the card hidden when there is no map, so that non-map Features are unchanged.
37. As a developer, I want rows to link to the tracker issue or file, so that I can open them from the card.
38. As a developer, I want the mod to never edit map or ticket files, so that `/wayfinder` stays the only writer and cannot conflict.
39. As a developer in a long Align grill, I want a band notice `Chart a map instead? · /wayfinder` once the counted questions pass my threshold, so that I switch to a map before the session degrades.
40. As a developer, I want the threshold to default to 12 questions and be configurable through `entry.wayfinder.afterQuestions`, so that I tune it.
41. As a developer, I want `entry.wayfinder.suggest: "off"` as a global switch in Settings, so that I can turn the suggestion off.
42. As a developer, I want the suggestion to fire once per grill when the count first crosses the threshold, so that it does not nag.
43. As a developer, I want Dismiss to silence the suggestion for that Feature only, so that other Features still get it.
44. As a developer, I want running `/wayfinder` from the notice to clear it, so that it does not linger.
45. As a developer whose Feature already has a `map` link, I want no suggestion, so that I am not told to chart what exists.
46. As a developer whose Feature has no link but an open map exists, I want the button to read **Attach to <map name>**, so that I join the existing map.
47. As a developer reading the README, I want the tested mattpocock-skills range stated, so that I know which skill versions the readers support.
48. As a maintainer, I want fixtures pinned to mattpocock-skills 1.3.x for every tracker, so that a skill change shows up as a test failure.
49. As a maintainer moving to 1.4, I want a sibling `1.4/` fixture set run alongside `1.3/` until the supported range moves, so that migration is gradual.
50. As a maintainer, I want each fixture file to say in a header comment whether it was "captured" or "hand-made", so that I know how far to trust it.
51. As a maintainer, I want `validate` to drift-check the generated fixtures module, so that stale fixtures fail CI.
52. As a user on Desktop, terminal, VS Code or mobile, I want the map UI to degrade by surface (band on terminal and Desktop, Flow tab on mobile), so that nothing assumes a surface that cannot draw it.

## Implementation Decisions

- **Map is derived, not stored.** The only persisted fact is an optional `map` reference on a Feature. A map is an optional parent of a Feature and sits before the Spec in the flow (DESIGN.md: Spec is `/to-spec` or `/wayfinder`).
- **One shared model, three readers.** A map reader per source (Local, GitHub, GitLab) returns the same model: the map, its tickets with a type, a state of open, claimed or resolved, and blockers. Each reader plugs into the existing tracker registry and takes the same read results the existing readers take. Other trackers return links only.
  - Local reads `.scratch/<effort>/map.md` and `issues/NN-*.md`, taking the type and status from the `Type:` and `Status:` lines and blockers from a `Blocked by:` line.
  - GitHub uses the `wayfinder:map` label, sub-issues and native dependencies. Fallback is a task list and a `Blocked by:` line.
  - GitLab uses the label, `Part of #<map>` and native blocking links (Premium). Fallback is a `Blocked by:` line. GitLab is links-only today, so this is a new reader.
- **Map discovery.** The configured tracker is primary. Local maps are found by scanning `.scratch/*/map.md` for the map shape, recognised by a `## Destination` heading. No prompt.
- **State rules (evidence).** State is read from tracker structure only:
  - tickets are structural children only;
  - decided means resolved or closed;
  - claimed means open with an assignee, or `Status: claimed`;
  - blocked means an unresolved blocker, native links first;
  - the frontier is open, unblocked and unclaimed.
- **No destination-reached state.** Only the fact "No open tickets", with a hint when Not yet specified is non-empty. The user closes the map.
- **Link validity.** Three states for a Feature's `map` link: valid, unknown (tracker unreachable, kept silently) and stale (shown as a quiet "Map not found", never rewritten).
- **Active map.** The map named by the active Feature's `map` link, else the most recently updated open map. A switcher in the card lists the rest. The chip is unchanged by source.
- **Rail.** One chip in the single-row rail opens a frontier card above it. A collapsed summary replaces it on narrow bands. On mobile the chip heads the Flow tab. The card kicker names the source.
- **Tickets tab.** A map card above the Inbox: header with decided and open counts and **Work next ticket**, groups in order Takeable, Claimed, Blocked, collapsed Decided, then **Open map**. Prototype: `.scratch/craftory-mvp/prototypes/07-tickets-tab-frontier.txt`; rail prototype: `.scratch/craftory-mvp/prototypes/04-rail-layout.txt`.
- **Read-only plus submit.** The mod submits `/wayfinder <map>` (next ticket, or a named one) and never edits a map or ticket.
- **Suggest trigger.** The signal is the number of questions the mod has counted in the current Align grill (the count behind the `Q6 of ~14` marker), not the skill's estimate. Config shape: an `entry.wayfinder` object with `suggest` as `"long-grill"` or `"off"` and `afterQuestions` defaulting to 12. It displays as a band notice with an action, because a toast carries no action in Claude Code 2.1.302. It fires once per grill, is dismissed per Feature (stored on the Feature), and silent when a `map` link exists. If no link exists but an open map does, the action reads **Attach to <map name>**.
- **Fixtures.** Real files compiled to a generated TS module, pinned to mattpocock-skills 1.3.x. The vendor script that copies skill templates is extended to generate the module, and `validate` drift-checks it. One loader turns a scenario into the read results the readers take.
  - Scenarios per source: `mixed` (2 takeable, 1 claimed with an assignee, 1 blocked, 2 decided, Not yet specified non-empty), `route-clear`, `closed-map`, `stale-link` and `prose-trap`.
  - GitHub and GitLab add `no-native-links`. Local has no such variant.
  - Local is a trimmed snapshot of a real wayfinder tree. GitHub and GitLab are captured from sandbox repos, then hand-edited for rare states. Hand-made GitLab output is checked against the `glab` docs.
- **Surfaces.** Band notices render on terminal and Desktop only; mobile gets the chip on the Flow tab and the Tickets tab. VS Code follows the pane.
- **Glossary.** Use the Craftory glossary terms. If "Map", "Frontier" or "Takeable" are not yet defined there, add them in the same change.

## Testing Decisions

- **What makes a good test.** It asserts what the user sees or what the mod submits, not internal structure. Feed a fixture scenario in, assert the rail, cards, notices and submitted command. Never assert helper calls.
- **Seam 1 (main): the rendered surfaces in the fake world.** The existing harness and fake UI feed each scenario in and assert:
  - the chip, frontier card, Tickets tab map card, switcher and kicker;
  - the Tickets tab groups, plus the disabled "Nothing takeable" state;
  - the stale-link line;
  - the suggest notice, its once-only firing, Dismiss and Attach variants;
  - the submitted `/wayfinder` command.
- **Seam 2: each tracker reader.** One test file per source turns each scenario into the shared model and asserts state, blockers, claims and the no-native-links fallbacks. `prose-trap` proves state is never read from prose.
- **One end-to-end run.** The Local `mixed` fixture goes into a fake filesystem with a stubbed `/wayfinder` that claims and resolves a ticket. The test asserts that the rail and Tickets tab update.
- **Prior art.** `local-tracker.test.ts` and `github-tracker.test.ts` for readers; `rail.test.ts`, `rail-view.test.ts`, `pane-tabs.test.ts` and `band.test.ts` for surfaces; `harness.ts` and `fake-ui.ts` for the fake world; `templates.test.ts` and `upstream-fixtures.ts` for fixture loading and drift.
- GitHub and GitLab have canned CLI output only; no test touches a live tracker.

## Out of Scope

- Editing maps or tickets from the mod, including claiming, resolving and closing.
- A "destination reached" state, stale-claim detection and automatic rewriting of a stale `map` link.
- The multi-context `GLOSSARY-MAP.md` in the Craftory Glossary tab (ruled out of 1.0.0 by the user).
- Tracker support beyond Local, GitHub and GitLab, which get links only.
- The automations, hooks, cloud-summary follow-ups and release bar, covered by `.scratch/craftory-automations-hooks/spec.md`.
- A live check against a real GitHub or GitLab sandbox. That happens in the manual release check.

## Further Notes

- Tickets for this spec should land in vertical slices, for example Local reader plus chip, then Tickets tab card, then GitHub reader, GitLab reader, and the suggest notice. Fixtures grow with each slice, not after.
- The GitHub and GitLab fixture capture needs sandbox repos and a logged-in `gh` or `glab`, which only the user can provide. Raise a `ready-for-human` task for that capture before the readers' tests need it, and hand-make the files until then.
- Run tests on the pinned Claude Code (`CLAUDE_CODE_VERSION` in `.github/workflows/ci.yml`), not a local auto-updated `claude`.
