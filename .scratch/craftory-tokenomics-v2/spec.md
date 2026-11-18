# Craftory Tokenomics v2: budgets and rate limits

Status: resolved

Source: `docs/design/craftory/tokenomics.md` (decisions 9–12 and slice v2), grilled on 2026-11-17. Builds on v1 (`.scratch/craftory-tokenomics-v1/`), which tracks every Feature's **Spend** by phase and ticket.

## Problem Statement

A developer can now see what a Feature costs, but nothing tells them when it costs too much. A grill that runs long, or a Build whose agents keep retrying, can spend far past what the work is worth, and they only notice afterwards. A lead has no way to set "this feature should cost about $20" and hear about it when it goes over. Separately, a Build that starts five agents near the end of the account's 5-hour rate-limit window burns the rest of it in minutes and leaves the developer locked out mid-Feature, with no warning from Craftory.

## Solution

Craftory gains optional **budgets** in dollars: one for the Feature, and one per phase. All are off until set.

- **Near budget.** At 80% of a budget, its figures turn amber and say "Near budget".
- **Over budget.** At 100%, the phase shows **Over budget** on the rail, and a band notice offers **Raise budget**, **Continue** or **Diagnose**.
- **Refusals are opt-in.** Nothing is refused unless a team turns on a new `deny.overBudget` rule, which `deny.hardGates` also turns on.

Craftory also reads the account's **rate-limit windows**:

- The Build card shows each window and when it resets.
- Above a threshold, Craftory starts fewer agents at once and says why.
- Starting Build while a window is that full says so before the agents start.

## User Stories

1. As a developer, I want to set a dollar budget for a Feature, so that I hear when it costs more than I meant it to.
2. As a tech lead, I want a default Feature budget in `.craftory/config.json`, so that every new Feature starts with one without anyone remembering.
3. As a tech lead, I want a default budget per phase, so that a runaway grill or Build is caught on its own and not only at the Feature total.
4. As a developer, I want budgets off until someone sets one, so that nothing changes for a repo that does not want them.
5. As a developer, I want a Feature's own budget to override the default, so that a big Feature can have more room than a small one.
6. As a developer, I want a phase card's Spend row to read `$9.80 of $12` once that phase has a budget, so that I see how close it is.
7. As a developer, I want the status line and the summary chip to read `$9.80 of $20` once the Feature has a budget, so that the total is always in view.
8. As a developer, I want a figure at 80% of its budget or more to turn amber and say "Near budget", so that I am warned before it goes over, and never by colour alone.
9. As a developer, I want a figure at its budget or more to turn red and say "Over budget", so that the overrun is plain.
10. As a developer, I want a phase that is running or up next and over its budget to show **Over budget** with `▲` on the rail, so that I see it without opening a card.
11. As a developer, I want a band notice once a phase or the Feature reaches its budget, naming it, the spend and the budget, so that I hear about it while I work.
12. As a developer, I want **Raise budget** on that notice to add half the budget again, kept on the Feature, so that I can keep going with one press.
13. As a developer, I want **Continue** on that notice to silence it until the budget changes, so that it does not nag me once I've decided.
14. As a developer, I want **Diagnose** on that notice to run `/diagnosing-bugs` about the overrun, so that I can find out why it cost so much.
15. As a developer, I want the notice raised once per budget per Feature, and again only after the budget is raised and reached again, so that it is never repeated for the same overrun.
16. As a developer on a surface whose host keeps no cost ledger, I want budgets not to apply, and the Settings rows to say they need dollars, so that I'm never warned about a $0 total.
17. As a tech lead, I want an opt-in `deny.overBudget` rule that refuses a phase's skill once that phase or the Feature is over budget, so that the cap is enforced, not just shown.
18. As a tech lead, I want `deny.overBudget` to refuse new Build agents once Build or the Feature is over budget, so that a Build cannot keep spending past its cap.
19. As a tech lead, I want `deny.hardGates` to turn on `deny.overBudget`, so that one switch still means "enforce everything".
20. As a developer, I want each refusal to name the rule, the spend, the budget, and the switch that turns it off, so that I can recover.
21. As a developer, I want `deny.overBudget` to let calls through when Craftory cannot tell (no cost ledger, no budget set, unreadable config), so that a missing signal never locks me out.
22. As a developer, I want to edit the active Feature's budget from the Flow tab, so that I don't have to edit JSON.
23. As a developer, I want the per-phase defaults and the Feature default in Settings › Pipeline, so that I find them next to each phase's command and gate.
24. As a developer, I want the Build card to show each rate-limit window, such as `5-hour 72% · resets 18:40`, so that I know how much room the account has.
25. As a developer, I want a window above the throttle threshold shown amber, with a word, so that I notice it.
26. As a developer, I want Craftory to start at most `rateLimits.throttledParallel` implementers while any window is at or above `rateLimits.throttleAt`, so that one Build cannot use up the account's window.
27. As a developer, I want a held spawn's reason to name the window, its use and when it resets, so that Claude and I know when to try again.
28. As a developer, I want the Build card to say "Throttled" while throttling is in force, so that the lower parallelism is not a mystery.
29. As a developer, I want starting `/implement-spec` while a window is at or above the threshold to show a band notice before the agents start, so that I can wait for the reset instead.
30. As a developer, I want the throttle threshold and the throttled limit in Settings › Worktrees, with 100% meaning throttling is off, so that a team can tune or disable it.
31. As a developer off a subscription (no rate-limit windows), I want nothing shown and nothing throttled, so that the feature costs nothing where it does not apply.
32. As a developer on `claude -p` or the cloud, I want `/craftory`'s Spend line to read `of $20` when the Feature has a budget, so that text surfaces get the budget too.
33. As a reader, I want the README and the glossary to describe budgets, Near budget, Over budget, rate-limit windows and throttling, so that the words mean one thing.

## Implementation Decisions

- **Config.** New keys, each written by Settings and editable in the file. Bounded numbers are clamped and rounded, as every number is, so budgets are whole dollars and `0` means off.

  | Key                            | Default | Bounds   | Effect                                                                   |
  | ------------------------------ | ------- | -------- | ------------------------------------------------------------------------ |
  | `budgets.featureUsd`           | `0`     | 0–100000 | Default budget for every Feature. `0` is none                            |
  | `budgets.phaseUsd.<phase>`     | `0`     | 0–100000 | Default budget for that phase of every Feature. `0` is none              |
  | `budgets.warnAtPercent`        | `80`    | 50–95    | Share of a budget at which its figures turn amber and say "Near budget"  |
  | `rateLimits.throttleAt`        | `80`    | 50–100   | `percentUsed` of any window at which spawns are throttled. `100` is off  |
  | `rateLimits.throttledParallel` | `1`     | 1–16     | The parallel limit while throttled, never above `worktrees.maxParallel`  |
  | `deny.overBudget`              | `false` |          | Refuse phase skills and agent spawns over budget. On when `hardGates` is |

- **Feature record.** It gains an optional `budgets: { usd?: number; phases?: Partial<Record<PhaseId, number>> }`, merged like the record's other shared fields.
  - The Feature's effective budget is `budgets.usd` when set, else `budgets.featureUsd`.
  - A phase's effective budget is `budgets.phases[phase]` when set, else `budgets.phaseUsd[phase]`.
  - `0` means none, at every level.
  - Drafts have no record, so a draft gets the defaults only.
- **Budget level.** A pure function takes spend dollars and a budget and gives `none`, `ok`, `near` (≥ `warnAtPercent`) or `over` (≥ 100%).
  - It gives `none` with no budget, with no dollars (`usd` null), or where the host keeps no cost ledger.
  - It is the one place every display, notice and refusal asks, so they agree.
- **Display.**
  - The phase card's Spend row appends ` of $12` when the phase has a budget.
  - At `near` or `over`, the row adds the word "Near budget" or "Over budget" and takes the `hook` (amber) or `danger` (red) role.
  - The status line and the summary chip read `$9.80 of $20` when the Feature has a budget.
  - The Spend tab's lines and the text reply's Spend line follow the same rule.
- **Over budget on the rail.** Flow derivation takes each phase's budget level. A phase that is `running`, `next` or `needs-you` and whose level is `over` shows the existing **Over budget** state (`▲`, danger) instead. Its meta is `$12.4 / $12`. That state gains a dollar variant, beside the per-agent token one it has today. Done, skipped and gated phases keep their state.
- **The band notice.** It is a new event notice kind, raised when a phase or the Feature crosses into `over`. Its text reads `Build is at $12.40 of $12` or `Export invoices as CSV is at $20.10 of $20`. Its actions are **Raise budget**, **Continue** and **Diagnose**.
  - **Raise budget** sets the Feature's own budget for that phase (or for the Feature) to 1.5× the current one, rounded up to a whole dollar. It writes the Feature record and drops the notice.
  - **Continue** records the budget it was pressed at, in `$.store` (personal), and drops the notice. The same budget never raises it again.
  - **Diagnose** submits `/diagnosing-bugs` with a line naming the overrun.
  - It is raised at most once per (Feature, phase or `feature`, budget), checked after each step that changed the text.
- **deny.overBudget.** `ruleVia` takes `overBudget`, and `hardGates` implies it, like the other two rules.
  - **When it refuses.**
    - A gated-path check (a typed command, Claude's `Skill` call, a rail or pane press) for a phase whose own level or the Feature's level is `over`.
    - A Build spawn (`decideSpawn`) while Build's level or the Feature's level is `over`.
  - **Fail-open.** It refuses only on a positive `over`. Everything else lets the call through: no ledger, no budget, an invalid config.
  - **Refusal text.** It names the phase or the Feature, the spend, the budget and `switchText('overBudget')`, or `hardGates` when that is why. A refused press shows the refusal in the band with **Raise budget** and **Diagnose**.
- **Rate-limit windows.**
  - **Reading.** The shell keeps the last `rateLimits` reading from `$.session.usage()` at session start and from each `session.measure`.
  - **On the Build card,** a pure function formats each window: `5-hour 72% · resets 18:40`, `7-day 31% · resets Mon 09:00`, `Spend limit 40%`. Times are local, 24-hour, with a weekday when the reset is not today.
  - **Levels.** A window at or above `throttleAt` takes the `hook` role and the word "Throttled". Windows with no reading are left out. With none at all there is no line.
- **Throttling.** `decideSpawn` takes the windows. While any window's `percentUsed ≥ throttleAt` (and `throttleAt < 100`), the parallel limit is `min(maxParallel, throttledParallel)`. The queue reason names the window, its use and its reset: `Craftory holds csv/03: the 5-hour window is at 84% (resets 18:40), so at most 1 implementer runs at once. Start it after csv/01 returns.` The Build card's agents summary adds `· Throttled`.
- **Warn before Build.** When `/implement-spec` (or `/implement`) is started from the rail, the pane or a typed command while a window is at or above `throttleAt`, a band notice says so. It reads `5-hour window at 84% · Build runs 1 implementer at a time until it resets at 18:40`, with **Dismiss**. It never drops or delays the command. The design doc's forecast-based warning is v3.
- **Settings.**
  - **Pipeline** gains a "Feature budget" row (Off, $5, $10, $20, $50, or a value of your own) and a "Budget" row per phase (Off, $1, $5, $10, $25, or your own). Both write the config defaults.
  - **Worktrees** gains "Throttle at" (Off, 70%, 80%, 90%, or your own) and "While throttled" (1, 2, 3, or your own).
  - **Automation** gains the `deny.overBudget` toggle, locked on while `hardGates` is on, like the other two.
  - Where this session has no cost ledger, the budget rows carry the note "Needs a cost ledger: budgets do not apply on this surface".
- **The Flow tab** gains a "Budget" row for the active specced Feature: its spend `of` its budget, and an **Edit** field that writes `budgets.usd` on the record. A draft shows the default with "set once the spec binds".
- **Surfaces.** Displays follow the existing surface split. Refusals follow the gate rules: a typed command is refused on every surface, a press where the band or pane shows it.

## Testing Decisions

- **What makes a good test.** It asserts what the user sees (a card row's text and role, a rail state, a notice's text and actions, the Build card's window line) or what a hook answers (a deny reason, a let-through, a queued spawn). It never asserts helper calls.
- **Seam 1: the pure core.** Table tests for:
  - the budget level (none, ok, near, over, no cost);
  - effective budgets (record over config, `0` as none, drafts);
  - the window format (today, another day, no reset, spend limit);
  - the throttle decision (under, at, over, `throttleAt` 100, `throttledParallel` above `maxParallel`).
- **Seam 2: the hooks in the fake world.** Using `tests/harness.ts` (which answers `$.session.usage()` with `cost` and can be given `rateLimits`) and `tests/build-harness.ts`. They assert:
  - the card, rail and status line at near and over;
  - the notice raised once, with **Raise budget** writing the record, **Continue** silencing it and **Diagnose** submitting;
  - `deny.overBudget` refusing a typed command, a `Skill` call, a press and a spawn, and letting each through when off, under budget, or without cost;
  - a spawn held while throttled, with the reason, and the Build card line;
  - the warn-before-Build notice.
- **Seam 3: Settings.** The new rows write the right keys, the deny toggle locks under `hardGates`, and the no-cost note shows.
- **Prior art.** `spend-cards.test.ts`, `spend-flow.test.ts`, `deny-rules.test.ts`, `hard-gates.test.ts`, `build.test.ts` (`decideSpawn`), `build-notices.test.ts`, `settings.test.ts`, `config.test.ts`.
- Run on the pinned Claude Code (`CLAUDE_CODE_VERSION` in `.github/workflows/ci.yml`).

## Out of Scope

- Token budgets above the agent level. Budgets are in dollars only; the per-agent token budget is unchanged.
- Budgets per ticket or per person.
- Forecasts, and a warning based on what Build is forecast to cost (v3).
- Model and effort routing, and escalation (v3).
- Stopping a running agent because the Feature or phase is over budget. `deny.overBudget` refuses new spawns and new phase skills; it does not stop work in flight (the agent's own token budget still does).
- Waiting for a window to reset, or retrying after it.
- Any server-side or account-level spend control. This is a client guard, like the gates.

## Decisions made while building

- (01) A figure near or over its budget ends with ` · Near budget` or ` · Over budget` everywhere it shows: the card's Spend row, the status line, the summary chip, the Spend tab and the text reply (`Spend: $0.85 of $1 (3k fresh tokens) across 1 session · Near budget`).
- (01) A Feature record's `budgets` merge per key: the writer's own value wins, else the disk's, so a budget set in one session is never dropped by another that did not touch it.
- (01) The per-phase row is labelled "<Phase> budget" (such as "Build budget") and sits under that phase's gate row; "Feature budget" heads Pipeline. An own value is whole dollars, typed with or without `$`.
- (01) The text reply's Spend line reads of the Feature's budget already in 01; 04 is left with the Flow tab's Budget row. In the Spend tab only the Feature total and phase lines take budgets, not tickets, "Between phases" or other Features.
- (01) The budget level, words, roles and resolution live in `src/budgets.ts`; displays pass a `SpendFigure` (`{ text, level }`) so the ink follows the level.
- (05) A window's use is floored to a whole percent (`79.9` reads `79%`), so it never reads as at the threshold before it is Throttled. The Build card's row is labelled "Limits", and a window of a kind with no label reads its own name (`opus_weekly` as `Opus weekly`). Reset times use the host's local zone offset, passed into the pure format as `offsetMinutes`; `isThrottled` is exported for ticket 06.
- (06) When several windows are Throttled, the fullest is the one a held spawn's reason and the warning name. The throttle reason ends, like the other queue reasons, with "and do not call Agent for <ticket> again before then", and names the running tickets as `one of csv/01, csv/02` when there are several. Throttling only holds a spawn when `throttledParallel` is below `maxParallel`; otherwise the plain queue reason stands. The warning is raised wherever a Build run passes its gate (a typed command's `prompt.submit` and the rail or pane's run), so one id (`throttle`) keeps it to one row.
- (03) A refusal reads `Craftory denied <skill>: Build is at $12.40 of $12, over its budget.` and the switch text, the spend to the cent; the phase is checked before the Feature, and a spawn names `the agent for csv/01`, refused (not queued) after the human, blocked and duplicate checks. A refused press is its own notice kind, `over-budget-refusal` (one per scope, id `over-budget-<scope>`), reading `Build is at $12.40 of $12 · deny.overBudget refuses /implement-spec`; its Raise budget (button `raise-refused-budget-<scope>`, beside 02's notice) is 02's `raise-spend-budget`, which drops it too, and the pane shows it beside the gate notices.
- (04) Empty or `0` in the Flow tab's Budget field writes `budgets.usd: 0` on the record, so the Feature has no budget even over a default (a removed key would come back from disk in the per-key merge). The field's button reads "Set", as Settings' own-value fields do; a refusal reads `Budget: use whole dollars up to $100000, or 0 for none` under the row. Its note says where the budget comes from ("The default from Settings › Pipeline", or for a draft "The default · set once the spec binds"), and without a cost ledger it carries Settings' no-ledger note in place of `of`. Record budget writes go through a `{ kind: 'budget'; target: 'feature' | PhaseId; usd }` Feature change.
- (02) The dollar Over budget state only changes how a phase looks: the Flow's `next` and `current` still name the phase it replaced, and so do the gates and the blockers. Its card keeps the phase's command and offers no agent Diagnose; its Flow tab row reads `Over budget · $12.40 of $12`.
- (02) The notice is checked when the status line's spend text changes (`refreshSpend`), so a phase that crosses its budget while the Feature's total text stands still waits for the next change. "Raised once" is kept per session (`budgetsRaised`); Continue's budgets are kept in `$.store` under `budgetsContinued`, by Feature and scope. A draft's notice offers Continue and Diagnose only, as a draft has no record to raise a budget on. Diagnose submits `<notice text>: find out why it cost so much`.
- (review) "Throttled" follows the hold: the agents summary's `· Throttled`, the warning before Build and a held spawn all need throttling in force, a window at or above `throttleAt` with `throttledParallel` below `maxParallel` (`throttleInForce`). The Limits row still marks such a window amber with "Throttled", as it shows the window, not the hold. The warning says "implementer(s)", the glossary word, as the hold does.
- (review) An empty Flow tab Budget field now writes `budgets.usd: null` on the record, an explicit "use the default" marker, in place of 04's `0`: the per-key merge takes the writer's `null` over the disk's number, so the default comes back and stays after a reload. `0` still means no budget for this Feature, even with a default set. The notice is now checked after every step whose dollars moved, and the budgets it was raised at are kept in `$.store` under `budgetsRaised`, by Feature and scope as Continue's are, so a new session does not raise it again; these replace 02's per-session `budgetsRaised`.

## Further Notes

- Tickets, in vertical slices:
  - (01) budgets in config, Settings and the Spend displays;
  - (02) Over budget on the rail, and the budget notice;
  - (03) `deny.overBudget`;
  - (04) the Flow tab's Feature budget and the text reply;
  - (05) the rate-limit windows on the Build card;
  - (06) throttling and the warning before Build;
  - (07) the README and the glossary.
- Blocking: 02, 03 and 04 are blocked by 01; 06 by 05; 07 by all the others. 01 and 05 can start at once.
- `rateLimits.throttleAt` defaults to 80, as the design doc says, so throttling is on by default. That is the one exception to "off until set": it only ever lowers parallelism, and only near the account's own limit.
- Commit scope is `craftory`. Do not edit versions or `CHANGELOG.md` by hand.
