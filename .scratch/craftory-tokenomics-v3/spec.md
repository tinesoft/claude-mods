# Craftory Tokenomics v3: routing, forecast and retro

Status: resolved

Source: `docs/design/craftory/tokenomics.md` (decisions 13–17 and slice v3), grilled on 2026-11-17. Builds on v1 (`.scratch/craftory-tokenomics-v1/`, **Spend** tracked by phase and ticket) and v2 (`.scratch/craftory-tokenomics-v2/`, budgets and rate-limit windows). The "Decisions made while building" sections of both record how that code actually works.

## Problem Statement

A developer can see what a Feature costs and cap it, but cannot make it cheaper. Every phase and every Build agent runs on the session's model at the session's effort, so a mechanical ticket costs the same as the hardest design question. When an agent fails or runs out of budget on a cheap model, the only way forward is to restart it by hand on a stronger one. A lead has no idea, before Build starts, what the next five tickets are likely to cost, and has no way to tell whether the account's 5-hour window can absorb them. And at Retro, the spend that v1 and v2 recorded never reaches `/retro`, so nobody learns from it.

## Solution

Craftory gains four things, all off or neutral until set:

- **Routing.** Settings › Pipeline gets a **model** and **effort** for each phase, `session` by default. A phase's subagents start on that model and run at that effort. Craftory sets the model when an agent spawns and never changes it mid-run, so the prompt cache is kept. Routing the main session too is a separate opt-in. While it is on, the band says what the phase runs on.
- **Escalation.** A Failed or Over budget ticket's card offers **Retry on opus** (the `routing.escalateTo` model). It starts the ticket again on that model, in its kept worktree.
- **Forecast.** From this repo's finished Features, Craftory forecasts what a phase and a Build ticket usually cost: the median and the p90. It shows `Build ≈ $9 (p90 $14) for 5 tickets` on the Tickets card, and keeps the forecast on the Feature when Build starts. Starting Build when the forecast would likely use up a rate-limit window warns first.
- **Retro.** The Retro card gains a spend summary: the total, forecast against actual, the costliest tickets and phases, the cache-hit % and the spend by model. `/retro` is given the same summary as context, and Craftory writes it to `.craftory/spend/<slug>/spend.md` once the Feature is through.

## User Stories

1. As a developer, I want to choose a model for each phase's subagents, so that mechanical work runs on a cheaper model than design work.
2. As a developer, I want to choose an effort level for each phase's subagents, so that I can trade thinking for cost per phase.
3. As a developer, I want every phase on `session` by default, so that nothing changes until I choose.
4. As a developer, I want a Build implementer to run on Build's model and effort, so that tickets are routed without my naming a model.
5. As a developer, I want any other subagent to run on the model of the phase running in the main session, so that, say, a `code-review` agent in Review follows Review's setting.
6. As a developer, I want an Agent call where Claude named a model to keep that model, so that routing never overrides an explicit choice.
7. As a developer, I want the model set only when an agent spawns and never changed during its run, so that its prompt cache is kept.
8. As a developer, I want each phase card to say what its subagents run on (`Runs on sonnet · medium`) when routing is set, so that I can see the routing without opening Settings.
9. As a developer, I want an opt-in to also route the main session while a phase runs, so that a long grill can run on a stronger model than chat.
10. As a developer, I want the band to say `Align runs on opus · high` while main-session routing applies, so that I know the main model changed.
11. As a developer, I want the main session back on its own model as soon as the phase ends, so that routing never leaks into chat between phases.
12. As a developer, I want the Settings hint to warn that switching the main model re-reads the context once, so that I know the cost of turning it on.
13. As a developer, I want a Failed or Over budget ticket's card to offer **Retry on opus**, so that I can escalate a stuck ticket with one press.
14. As a developer, I want the retry to reuse the ticket's kept worktree and branch, so that its work so far is not lost.
15. As a developer, I want the retry offered only when the escalation model differs from the one the agent ran on, so that it never offers the same model again.
16. As a tech lead, I want the escalation model in `routing.escalateTo`, with `session` hiding the button, so that a team can choose or turn off escalation.
17. As a developer, I want the Tickets card to show `Build ≈ $9 (p90 $14) for 5 tickets` once the repo has history, so that I know what Build will likely cost before it starts.
18. As a developer, I want "No forecast yet: it needs 2 finished features" until there is enough history, so that a guess is never shown as a forecast.
19. As a developer, I want the forecast to count only finished Features (Ship done, or archived), so that work in flight does not skew it.
20. As a developer, I want the forecast per Build ticket, scaled by the tickets meant for an agent, so that a Feature with more tickets forecasts more.
21. As a developer, I want the forecast saved on the Feature when Build starts, so that Retro can compare it with what Build actually cost.
22. As a developer, I want the Spend tab to show each phase's forecast next to its spend, so that I see which phases run over.
23. As a developer, I want starting Build to warn when the forecast p90 would likely use more of a rate-limit window than is left, so that I can wait for the reset.
24. As a developer, I want no such warning when Craftory cannot tell how window use relates to dollars, so that it never guesses.
25. As a developer, I want the Retro card to show the Feature's total, forecast against actual for Build, the three costliest tickets and phases, the cache-hit % and the spend by model, so that the retro starts from facts.
26. As a developer, I want `/retro` given the same summary as context, so that Matt's skill can rank cost-saving suggestions.
27. As a tech lead, I want the summary written to `.craftory/spend/<slug>/spend.md` once Retro is done (or Ship, with Retro off), so that it is kept with the Feature in the repo.
28. As a developer, I want `spend.md` written once and left alone after, so that nobody's edits to it are lost.
29. As a developer where the host keeps no cost ledger, I want forecasts and summaries in tokens, or left out, never `$0`, so that I am not misled.
30. As a reader, I want the README and the glossary to describe routing, escalation, the forecast and the Retro summary, so that the words mean one thing.

## Implementation Decisions

- **Config.** These keys live under each phase, beside `enabled`, `gate` and `command`, and in a new `routing` group:

  | Key                     | Default     | Values                                                   | Effect                                                          |
  | ----------------------- | ----------- | -------------------------------------------------------- | --------------------------------------------------------------- |
  | `phases.<phase>.model`  | `"session"` | `session`, `haiku`, `sonnet`, `opus`, or a full model id | The model the phase's subagents spawn on. `session` sets none   |
  | `phases.<phase>.effort` | `"session"` | `session`, `low`, `medium`, `high`, `xhigh`, `max`       | The effort of the phase's subagents' steps. `session` sets none |
  | `routing.mainThread`    | `false`     |                                                          | Also route the main session's steps while a phase runs          |
  | `routing.escalateTo`    | `"opus"`    | as `model`                                               | The model **Retry on …** offers. `session` hides the button     |

  The effort values are one exported constant. An unknown effort falls back to `session`, with the usual config problem line.

- **Which phase a subagent belongs to.** An implementer belongs to Build. Any other subagent belongs to the phase running in the main session when it spawns, and gets no routing when none is. One pure function decides this from the spawn and the running state, and the shell remembers the answer per agent id, so its later steps need not ask again.
- **Model at spawn.** The existing `agent.spawn` hook passes `model` on when the phase's model is not `session` and the spawn names none. Spawns that name a model (Claude chose one) are left alone. The model is never set on a later step.
- **Effort on steps.** The existing `turn.step` hook gives each of a routed subagent's steps the phase's effort, when that is not `session`. Every step of the agent gets the same level.
- **Main session.** With `routing.mainThread` on, each main step while a phase is running is given that phase's model and effort (any that is not `session`). Steps between phases are left alone, so the session's own model comes back by itself. While it applies, the band shows a one-line note: `Align runs on opus · high`.
- **Phase card.** When routing is set, the card shows a row `Runs on sonnet · medium`, or the one of the two that is set.
- **Escalation.**
  - The card of a Failed or Over budget ticket (in the Build card's agent list) gets **Retry on <escalateTo>**. It shows only when `escalateTo` is not `session` and differs from the model that ticket's last agent ran on. That model is kept on the agent record when the agent spawns.
  - The press records a pending escalation for the ticket, then submits `/implement <ticket>` with a context line. The line tells Claude to retry the ticket in its kept worktree and branch, on the escalation model.
  - The next spawn for that ticket gets the escalation model, even over Build's routing, and reuses the kept worktree and branch rather than cutting new ones. The pending escalation is cleared once used.
- **Forecast.**
  - **Finished Features** are those whose Ship is done, or that are archived.
  - **Per Build ticket**, each finished Feature's Build tickets give one sample each: that ticket's dollars across every session.
  - **Per phase**, each finished Feature gives one sample per phase it spent on.
  - It is pure: a function takes the samples and gives the median and p90, or none with fewer than 2 finished Features.
  - **Build's forecast** is the per-ticket median and p90 times the tickets meant for an agent (not ready-for-human).
  - **Text:** `Build ≈ $9 (p90 $14) for 5 tickets`. Below $10 it shows cents, as `usdText` does.
  - **No cost ledger:** the samples are fresh tokens and the text reads `Build ≈ 410k fresh (p90 620k) for 5 tickets`.
- **Saving the forecast.** When Build starts (typed, pressed, or the first implementer spawn), the Feature record gains `forecast: { build: { median, p90, tickets, unit }, at }`, written once and never overwritten.
- **Warning against the window.**
  - The shell keeps this session's readings of the cost and of each window's `percentUsed`. From them it estimates the points of a window used per dollar, once at least $0.50 and 2 points have moved in the session.
  - When Build starts and `forecast.p90 × points per dollar` is more than the tightest window has left, a band notice says so: `Build is forecast at up to $14, about 35% of the 5-hour window · 22% is left, resets 18:40`, with **Dismiss**. It never drops the command.
  - With no estimate there is no notice. v2's throttle warning still shows as before.
- **Retro summary.**
  - One pure function gives the summary from a Feature's breakdown, its saved forecast and the cost-ledger flag:
    - the total;
    - Build's forecast against its actual;
    - the three costliest tickets and the three costliest phases;
    - the cache-hit %;
    - the spend by model.
  - It renders as card rows, as Markdown context, and as the `spend.md` file.
  - The Retro card shows it as rows.
  - When `/retro` is submitted (typed, pressed, or through the Retro automation), the existing `startContext` adds the Markdown summary as context.
  - The file `.craftory/spend/<slug>/spend.md` is written once:
    - when Retro is done;
    - or, when Retro is turned off, when Ship is done.
  - `isWritable` gains that one path. A file already there is never rewritten.
- **Surfaces.** Displays follow the existing split. Routing and escalation work wherever hooks run. The band note and the warning are band notices, shown in the pane where there is no band, as v2's are.

## Testing Decisions

- **What makes a good test.** It asserts what the engine is asked for or what the user sees, never helper calls:
  - the `model` passed on by `agent.spawn`, and the `model` and `effort` of a step `turn.step` sends;
  - a card row, a notice, the context added to `/retro`, the file written.
- **Seam 1: the pure core.** Table tests for:
  - which phase a subagent belongs to;
  - the routing an effort and model resolve to;
  - the escalation-button rule;
  - median and p90 (odd and even counts, one Feature, none);
  - the forecast text, in dollars and in tokens;
  - the window estimate and the warning rule;
  - the summary (top 3, ties, no forecast, no cost ledger).
- **Seam 2: the hooks in the fake world** (`tests/harness.ts`, `tests/build-harness.ts`). The harness's `agent.spawn` and `turn.step` record what they were asked, so a test can assert the model and the effort. The tests cover:
  - an implementer spawned on Build's model;
  - a `code-review` agent on Review's model, and a spawn that named its own model left alone;
  - effort on every step, and the model never on a later step;
  - main-session routing on and off, and between phases;
  - Retry on opus reusing the kept worktree;
  - the Tickets card forecast, with spend files of finished Features as fixtures;
  - the forecast saved at Build start;
  - the window warning;
  - the Retro card, the `/retro` context, and `spend.md` written once.
- **Seam 3: Settings.** The model and effort rows per phase, the two routing rows, and the cache hint.
- **Prior art.** `spend-cards.test.ts`, `spend-tab.test.ts`, `throttle.test.ts`, `build.test.ts`, `agents-list.test.ts`, `retro-on-pr.test.ts`, `settings.test.ts`, `config.test.ts`.
- Run on the pinned Claude Code (`CLAUDE_CODE_VERSION` in `.github/workflows/ci.yml`).

## Out of Scope

- Changing a running agent's model, or the main session's model, mid-phase.
- Routing per ticket (a `model:` line in a ticket), or automatic escalation. Escalation is a press.
- A price table, or forecasting from ticket size or text.
- Forecasts across repos, or shared between teams.
- Rewriting `spend.md` after it is written, or a Spend report per session.
- Changing what `/retro` does with the summary. Matt's skill decides.

## Decisions made while building

- (01) A spawn is left alone entirely (no model, no effort) when its call names a model, when it is a fork (forks always inherit) or when it resumes a run (its model and cache are kept). A subagent spawned between phases gets no routing.
- (01) The route a subagent gets is remembered per agent id at spawn, in the session-only `routes` atom, so a config change mid-run never changes a running agent's effort.
- (01) A model of your own must look like a model id (letters, digits and `.-_:@/[]`, at most 100 characters); config.json with anything else falls back to `session` with a problem line, and the Settings field refuses it. With only an effort set the card row reads `Runs on high effort`.
- (02) The band note is derived from the running phase, not a held notice, so it has no Dismiss and goes when the phase ends; the pane shows it on every surface, as it does v2's throttle warning. A grill waiting on the user is still running, so its next turn stays routed. With only an effort set it reads `Build runs on low effort`.
- (04) The forecast lives in `src/forecast.ts` (`samplesOf`, `forecastOf`, `spreadOf`, `buildForecastOf`, the texts) and `hooks/shell/forecast.ts` (`forecastNow`, `buildForecastNow`, `saveForecast`). The p90 (and median) is linear between the closest ranks. "2 finished Features" counts, per forecast, the finished Features that gave it a sample: a Build ticket for the per-ticket forecast, spend on that phase for a phase's. The Feature being forecast is never one of its own samples. From a record alone, Ship counts as done when Ship was marked done or Retro ran (only the active Feature's PR state is known); archived means archived now. Dollar samples skip a ticket or phase no row was priced for. At or above $10 the forecast shows whole dollars (`$14`), below as `usdText`. The Tickets card's Forecast row is left out while a forecast has no agent tickets to scale by. With no forecast at Build start nothing is saved, and a later Build start or first implementer spawn saves one once there is; a merge keeps the earliest saved.
- (03) The model kept on the agent record is the one `agent.spawn` answered (an alias from a hook, else the engine's resolved id); an alias and a full id of its family count as the same model, so `opus` is not offered to an agent that ran on `claude-opus-4-5`, and a record with no model is offered it. The button shows only on a finished attempt (not while an over-budget run is still being stopped). The pending escalation is session-only (the `escalations` atom); the escalation model wins over a model the Agent call names, and the kept worktree and branch are the ones on the ticket's record. The press runs `/implement <ticket>` like any pressed command (gates and budget checks apply), and `startContext` adds the retry line to it. A bad `routing.escalateTo` falls back to `opus` with a problem line; the Settings row is Pipeline › "Retry stuck tickets on", whose `session` choice reads Off.
- (05) The estimate lives in `src/window-use.ts` (`noteWindowUse`, `pointsPerDollarOf`, `windowWarningOf`, `windowWarningText`) and the session-only `windowUse` atom in `hooks/shell/limits.ts`. Each window is estimated on its own, from its first reading since it last reset (its `resetsAt` changed or its use fell) or was first seen, to its latest; a reading is the cost and the windows taken together, at session start and at each `session.measure` with a cost. The notice names, of the windows the p90 would use up, the one with least left, where left is 100 less the whole percent the Build card shows; at exactly what is left there is no notice. A forecast in tokens never warns. The forecast checked is the one computed at Build start (as saved), and the notice (`forecast-window`) is held beside the throttle one and shown in the pane like it.
- (06) The summary lives in `src/spend-summary.ts` (`spendSummaryOf`, `spendSummaryRows`, `spendSummaryMarkdown`, `spendSummaryPath`) and `hooks/shell/spend-summary.ts`. Costliest is by dollars, by fresh tokens without a cost ledger; a tie goes to the costlier in fresh tokens, then the phase order, the ticket's number or the model's name. Between phases counts in the total but is not a phase. The card's labels are short to fit its label column (`Tickets`, `Phases`, `Cache`, `Models`); the Markdown names them in full (`Costliest tickets`, …). Build compares in the saved forecast's unit, adds `above the p90` past it, and with a dollar forecast but no priced Build step says the forecast is in dollars rather than show `$0`. A Feature with no spend has no rows, no context and no `spend.md`. "Retro turned off" is Retro skipped (off in config or for the Feature). Only the active Feature (and one being auto-archived, just before) is checked, so older finished Features gain no file. A pressed or automated `/retro` gets its context as the engine submits the command (`prompt.submit` with `command`), the same path as a typed one.

## Further Notes

- Tickets, in vertical slices:
  - (01) model and effort per phase for subagents;
  - (02) routing the main session;
  - (03) escalation;
  - (04) the forecast from history;
  - (05) the forecast warning against the window;
  - (06) the Retro summary, `/retro` context and `spend.md`;
  - (07) the README and the glossary.
- Blocking:
  - 02 and 03 are blocked by 01;
  - 05 and 06 by 04;
  - 07 by every other ticket;
  - 01 and 04 can start at once.
- Commit scope is `craftory`, with subjects lower-case after the scope (commitlint's `subject-case`, PR titles included). Do not edit versions or `CHANGELOG.md` by hand.
