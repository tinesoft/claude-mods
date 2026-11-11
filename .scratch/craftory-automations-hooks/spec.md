# Craftory automations, hooks and release readiness

Status: ready-for-human

Source: `.scratch/craftory-mvp/map.md` (resolved decisions 06, 10, 11, 12 and the Cleanup, Cloud summary and README fog items). Sibling spec: `.scratch/craftory-wayfinder-rail/spec.md`.

## Problem Statement

A developer running the Craftory SDLC flow still has to remember the chores around it. They must write a handoff before a session's context runs out, run a retro once a PR merges, and check the codebase's architecture every so often. They also get no signal when a Build agent's tests fail, when a phase ends without its evidence, or when someone edits straight on the integration branch or skips a gate. The designed hook set covers the workflow only softly, so these slips go unnoticed until review.

Separately, the docs and README still describe limits that are about to be lifted, the plan carries stale checkboxes and open items, and the cloud text reply on claude.ai/code and `claude -p` is not described accurately or fully tested. Craftory 1.0.0 cannot ship while those disagree with the code.

## Solution

Craftory gains three opt-in automations and three opt-in guardrails, all off by default and all visible before they act:

- **Handoff at 80%**, **retro on PR** and a **weekly architecture check**, each a band notice with a click that submits the matching skill.
- A **test run** after a Build implementer's final turn, an **unmet Done-when nudge** and two **deny rules** (`skipGate`, `editOnIntegrationBranch`).

Craftory only submits commands, observes outcomes and edits its own configuration; the skills decide which files they write. The cloud summary gets aligned documentation and the two untested branches covered. The repo cleanup lands, and the release bar is split so that human-only steps are clearly marked and not left to an agent.

## User Stories

1. As a developer, I want all three automations off by default, so that installing Craftory never changes my workflow until I opt in.
2. As a developer, I want one switch per automation in `.craftory/config.json` (`handoffAt80`, `retroOnPr`, `weeklyArchitecture`), so that I enable each independently.
3. As a developer, I want no automation to run while a turn is running, so that it never interrupts work in flight.
4. As a developer, I want every automation to show a band notice first and act only on my click, so that nothing submits unseen.
5. As a developer, I want a dismissed automation never to repeat for that Feature or session, so that I am not nagged.
6. As a developer, I want Craftory never to edit files itself for an automation, so that the skill owns its output.
7. As a developer nearing the end of my context window, I want a band notice at 80% of the main session's context, so that I write a handoff before quality drops.
8. As a developer, I want that threshold read from the token counts the mod already sees each step, so that no new instrumentation is needed.
9. As a developer, I want the handoff notice to offer **Write handoff**, which submits `/handoff` on a click, so that the handoff is one action.
10. As a developer, I want the handoff notice once per session, re-armed only in a new session, so that I am not nagged at 81%.
11. As a developer, I want subagents never offered a handoff and the per-agent token budget kept separate, so that the two limits do not mix.
12. As a developer, I want the handoff document linked from the Feature's card after it is written, so that I can find it.
13. As a developer, I want Craftory to notice my Feature's PR is merged, so that the retro offer arrives at the right moment.
14. As a developer, I want a PR merged outside the session caught at `session.start`, so that I do not miss a retro because I was away.
15. As a developer, I want the retro offered as a band notice that submits `/retro`, once per Feature, so that one merge means one prompt.
16. As a developer, I want the Retro phase to read the ranked suggestions `/retro` produced as its evidence, so that the phase completes by fact.
17. As a developer, I want a weekly architecture check at `session.start` when the last run is over 7 days old, so that I keep the codebase agent-friendly without remembering.
18. As a developer, I want the check skipped while any Feature is mid-Build, so that it never competes with active work.
19. As a developer, I want the check to submit `/improve-codebase-architecture` and its findings to land as `needs-triage` items in the Inbox, so that they enter the normal flow.
20. As a developer, I want the last run stored per repo in a git-ignored `.craftory/state.json` with `architectureLastRun` as an ISO date, so that config stays settings only.
21. As a developer, I want the last-run date written when the skill reports done, not when submitted, so that a cancelled run does not count.
22. As a developer, I want a `worktrees.test` command in `.craftory/config.json`, so that Craftory runs my project's real test command.
23. As a developer, I want the test hook to do nothing when `worktrees.test` is unset, so that Craftory never guesses a command or parses prose.
24. As a developer, I want the test run after a Build implementer's final turn in its ticket worktree, once per turn end, so that a ticket is checked when it claims to be finished.
25. As a developer, I want the run never to fire mid-run or for the main session, so that it stays scoped to Build implementers.
26. As a developer, I want a non-zero exit to mark the ticket Failed with the output tail on the ticket card, so that I see why.
27. As a developer, I want `worktrees.testTimeoutSec` (default 600) to turn a timeout into Failed with the reason "timed out", so that a hung test does not stall the queue.
28. As a developer, I want `keepFailed` to keep a failed worktree, so that I can inspect it.
29. As a developer, I want the next implementer turn to re-run the test and clear Failed on success, so that state follows evidence.
30. As a developer, I want the hook never to re-prompt the agent or block the turn, so that it observes only.
31. As a developer, I want a band notice when a turn ends in a Running phase whose evidence condition is unmet, so that a phase cannot quietly stall.
32. As a developer, I want the nudge wording to name the phase and quote the unmet condition, such as "Align is still running: no spec has been created yet. Ask for it, or mark Align done.", so that I know the exact next step.
33. As a developer, I want the nudge at most once per phase per Feature, dismissed per Feature, with no submit action, so that it informs without acting.
34. As a developer, I want `automation.nudgeUnmetDone` to enable it, off by default, so that I opt in.
35. As a developer, I want a `deny.skipGate` rule that blocks a gated phase's skill until its predecessor is done, so that gates are enforced.
36. As a developer, I want a `deny.editOnIntegrationBranch` rule that blocks Edit and Write in the main checkout on `feat/*`, so that work stays in worktrees.
37. As a developer, I want each denial to name the rule and the switch that turns it off, so that I can adjust it.
38. As a developer, I want deny rules off by default, so that Craftory never blocks a tool I did not ask it to.
39. As a maintainer, I want no `maxParallelHard` rule and no generic tool-and-pattern policy language, so that the config surface stays small.
40. As a user of Claude on claude.ai/code cloud or `claude -p`, I want `/craftory` to reply with a text summary of the active Feature, so that I get the status without a UI.
41. As a user, I want that reply to say "No feature in flight" when none exists, and a clear message when the Claude Code version is unsupported, so that failure states are explicit.
42. As a user, I want the reply optionally to name the next action, so that I know what to do next.
43. As a reader of DESIGN.md and the README, I want chat and `claude -p` replies described accurately, so that the docs match the code.
44. As a reader of the README and Settings, I want the "not built" limits removed once the features exist, so that nothing advertises a gap that is closed.
45. As a maintainer, I want the stale M0, M2 and M3 boxes ticked in `plan.md`, so that the plan reflects reality.
46. As a maintainer, I want open items O1 and O2 closed in `plan.md`, so that the release bar can be met.
47. As a maintainer, I want the pending glossary and agent docs committed, so that the glossary is complete at release.
48. As a maintainer, I want the Settings tab to expose the new switches and thresholds, so that I configure them without editing JSON.

## Implementation Decisions

- **Configuration, not new stores.** Switches live in `.craftory/config.json`: the three automation switches, `automation.nudgeUnmetDone`, `worktrees.test`, `worktrees.testTimeoutSec` and `deny.skipGate` and `deny.editOnIntegrationBranch`. Everything defaults off or inert. The only new persisted state is `.craftory/state.json` (git-ignored, per repo), holding `architectureLastRun`.
- **Visible before it acts.** Each automation raises a band notice with a single action; the click submits the skill. A toast is not used, because it carries no action in 2.1.302. Craftory never submits while a turn runs, never auto-submits without a notice, never repeats after a dismiss, and never edits files for an automation.
- **Handoff at 80%.** 80% of the main session's context window, from token counts `turn.step` already sees, separate from the per-agent budget. Once per session, re-armed in a new session. Output location belongs to the skill; the Feature card links the written document.
- **Retro on PR.** The `tool.call` evidence refresh already tracks the PR; a merged state raises the notice, and `session.start` catches a merge made outside the session. One notice per Feature. The Retro phase evidence reads the ranked suggestions.
- **Weekly architecture check.** At `session.start`, when the last run is over 7 days old, per repo, and only when no Feature is mid-Build. Submits `/improve-codebase-architecture`; findings arrive as `needs-triage` Inbox items. The date is written on the skill's done report.
- **Test hook.** On `turn.complete` for a Build implementer's final turn in its ticket worktree. Non-zero exit or timeout marks the ticket Failed with the output tail shown on the ticket card. The next turn re-runs it and can clear Failed, because state is recomputed from evidence. The hook calls `next(e)` and never blocks the turn.
- **Unmet Done-when nudge.** Fires when a turn ends in a Running phase whose Phase-evidence condition is unmet, using that table's text. At most once per phase per Feature; dismissal is per Feature. No submit action.
- **Deny rules.** `skipGate` blocks a gated phase's skill until its predecessor is done. `editOnIntegrationBranch` blocks Edit and Write in the main checkout on `feat/*`. A denial names the rule and the switch. `maxParallelHard` is dropped because the queue covers it, and a generic rule list is out.
- **Mod hooks only.** The new behavior uses the mod's own hook events (`turn.step`, `turn.complete`, `tool.call`, `session.start`). No settings-file hooks.
- **Hook shape.** Hooks take `($, e, next)` and return the result of `next(e)` unless the hook deliberately answers for itself. Helpers in `src/` take plain data, never `$`, so `claude plugin test` can test them without the engine.
- **Cloud summary.** `summary.ts` already produces the text summary; the gaps are doc alignment (DESIGN.md and the README on chat and `claude -p` replies), tests for the "No feature in flight" and unsupported-version branches, and the optional next-action line.
- **Cleanup.** Close O1 and O2, tick the stale M0, M2 and M3 boxes, commit the pending glossary and agent docs, and lift the "not built" wording in the README and Settings once the features are built. Versions and `CHANGELOG.md` are never edited by hand.

## Testing Decisions

- **What makes a good test.** It drives events into the fake world and asserts visible results: notices, submitted commands, card state, denials and reply text. It never asserts internal call order.
- **Seam 1 (main): the rendered surfaces in the fake world.** Using the existing harness, assert:
  - each automation's notice and submitted skill, firing once and staying silent after a dismiss or when its switch is off;
  - the 80% threshold from token counts;
  - a PR merged in-session and out-of-session;
  - the 7-day and mid-Build rules, with a cancelled run not advancing `architectureLastRun`;
  - the test hook's Failed, "timed out" and cleared states, and the nudge wording and once-per-phase limit;
  - each deny rule's block message;
  - the cloud reply's three branches (a Feature in flight, "No feature in flight", an unsupported version).
- **Seam 2: configuration parsing,** only where defaults and validation need pinning, through the existing `config.test.ts`.
- **Prior art.** `notices.test.ts`, `build-notices.test.ts`, `band.test.ts`, `gate.test.ts`, `gates.test.ts`, `review-gate.test.ts`, `build.test.ts`, `reply.test.ts`, `summary.test.ts`, `settings.test.ts`, `signals.test.ts` and `latency.test.ts` for hook cost.
- **Latency.** Hooks must not slow turns; extend the existing latency test to cover the new hooks.
- **Tests run on the pinned Claude Code,** not a local auto-updated one.

## Out of Scope

- The wayfinder rail, readers and fixtures, covered by `.scratch/craftory-wayfinder-rail/spec.md`.
- Settings-file hooks, a generic tool-and-pattern deny language and `maxParallelHard`.
- Automations that edit files themselves, or that run without a visible notice.
- Multi-context `GLOSSARY-MAP.md` (ruled out of 1.0.0 by the user).
- Stale-claim detection and any other write path to trackers.

## Further Notes

**Release bar: `ready-for-human`.** Only the user can do these, so they should not be handed to an agent. They block the `craftory@1.0.0` cut, which `nx release` performs from `main`, never by hand:

- Live client check on the pinned Claude Code across Desktop, VS Code, terminal and mobile, in light and dark. It covers the band, pane, hover cards, `$.ui.ask` in a Skill hook, `TaskStop` and glyph widths. The user's standing practice is to live-test on Desktop and terminal before changing code, so schedule this early.
- README screenshots.
- The GitHub and GitLab sandbox capture and live check named in the rail spec.
- The end-to-end Local-tracker fixture run is automated (see the rail spec), but its result needs the user's eyes before release.
- **Decision for the user:** whether `docs/issues` or `.scratch` is the Local tracker default. It is too small for a map ticket, but it must be settled before the README wording is finished.
