# Craftory Tokenomics v1: spend visibility and storage

Status: ready-for-agent

Source: `docs/design/craftory/tokenomics.md` (decisions 1–8, 18 and slice v1), grilled on 2026-11-17. Slices v2 (budgets and rate limits) and v3 (routing, forecast and retro) get their own specs once this ships.

## Problem Statement

A developer running a feature through Craftory has no idea what it costs. The per-agent token bar in Build covers one agent's fresh tokens and nothing else. Align, Spec, Review and the chat between phases are invisible, there are no dollars anywhere, and once a session ends even the agent figures are gone. A lead who asks "what did the CSV export cost us?" gets no answer: the spend is spread over several sessions and teammates, and nothing adds it up.

## Solution

Craftory records every answered step's tokens and its share of the session's `cost.usd`, and charges both to a feature, phase, ticket, agent and model. Tracking is always on and refuses nothing. Each session writes its own append-only file in the repo, so a feature's total adds up across sessions and teammates without git conflicts. Spend shows on the status line and summary chip, on each phase card, beside each Build agent's token bar, and in a new **Spend** pane tab.

## User Stories

1. As a developer, I want the status line and the summary chip to end with the active feature's total, such as `Export invoices as CSV · Build 2/5 · $4.12`, so that I see the cost without opening anything.
2. As a developer, I want each phase card to have a Spend row, such as `$2.14 · 318k fresh · 61% cache`, so that I see what each phase cost.
3. As a developer, I want each Build agent to show `≈$0.42` beside its token bar, so that I can spot an expensive ticket while it runs.
4. As a developer, I want an agent's dollars marked `≈` whenever they were split across agents that ran at the same time, so that I don't read an estimate as exact.
5. As a developer, I want a phase's dollars to be exact (the sum of the session's cost deltas), so that the totals I report are right even when the per-agent split is not.
6. As a developer, I want the token counts to use the same "fresh" count as the agent budget (input + cache-creation + output), with cache reads and the cache-hit % shown apart, so that the numbers match the budget bar.
7. As a developer, I want spend from the main session with no phase running charged to the active feature as **Between phases**, so that chat between phases still counts.
8. As a developer, I want spend with no active feature kept as **Outside features**, shown only in the Spend tab, so that it doesn't pollute a feature.
9. As a developer, I want Align's spend, which happens before a spec exists, to land on the feature once its spec binds, so that the grill counts as part of the feature.
10. As a teammate, I want a feature's spend from my sessions and from others' sessions added together, so that the total is the feature's, not just mine.
11. As a teammate, I want spend stored so that two people's sessions never conflict in git, so that tracking never costs me a merge.
12. As a lead, I want the Spend tab to break a feature down by phase, then ticket, and to group by model and by person, so that I can see where the money went.
13. As a lead, I want archived features' totals listed in the Spend tab, so that shipped work stays comparable.
14. As a developer on a surface whose host keeps no cost ledger, I want tokens only and a line saying "$ unavailable on this surface", never `$0`, so that I am not misled.
15. As a developer resuming a session, I want the first cost reading after the resume to set the baseline and not be charged, so that earlier spend is not counted twice.
16. As a developer, I want a corrupt or unreadable spend file skipped and named in the Spend tab, so that one bad file doesn't hide the rest.
17. As a developer on `claude -p` or the cloud, I want `/craftory`'s text reply to include the feature's total, so that text-only surfaces get it too.
18. As a reader, I want the glossary and README to define Spend, Fresh tokens, Cache-hit %, Between phases and Outside features, so that the words mean one thing.

## Implementation Decisions

- **Pure core in `src/spend.ts`.** It has no I/O and holds:
  - the `SpendEntry` type from the design doc;
  - `attribute(step, flow, ledger)`, which picks the feature, phase, ticket and agent;
  - `splitDelta(deltaUsd, steps)`, which gives one step the whole delta, and splits by fresh-token share across several steps with each part flagged estimated;
  - `rollup(entries)`, which groups by `(phase, ticket, agentId, model)`;
  - `sumFiles(files)`, which adds up the session files when they are read.
- **Shell in `hooks/shell/spend.ts`.** It holds an in-memory atom of this session's entries and the last `cost.usd` reading, plus the flush and the reading of every session file.
- **Wiring.** In the existing `turn.step` hook (`hooks/register.tsx`), on both the main branch and the agent branch, after `next(e)` answers:
  - read `$.session.usage()` with no breakdown (free), take the `cost.usd` delta and hand the step to the shell;
  - the step's `usage` (`TurnUsage`) gives the four counts and `model`;
  - the existing budget stop path (yield and return without `next`) sends no request and is not charged.
- **Attribution rules.**
  - A subagent step is charged to its `AgentRun`'s ticket and to Build, or to Review when the run is a `code-review` agent.
  - A main step goes to `state.running.phase` when a phase is running; otherwise to the active feature as `'between'`; with no active feature, to `null`.
- **Delta timing.** The delta since the last reading covers every step answered since then. Steps are queued until a reading moves, then `splitDelta` spreads the delta over the queue. A reading that has not moved charges `0` and leaves the queue. A missing `cost` means `usd: null` on every entry.
- **Baseline.** On the first step of a session or a resume, the reading only sets the baseline. That step's tokens are recorded with `usd: null`, not `0`.
- **Storage paths.** These differ from the design doc, which assumed a folder per feature. Feature records are flat files (`.craftory/features/<slug>.json`), and `isWritable` only allows `^[A-Za-z0-9-]+\.json$` there. So:
  - spend lives in `.craftory/spend/<feature-slug>/<sessionId>.json`, where `<feature-slug>` is `refSlug(spec)` and `<sessionId>` comes from `$.session.id()`;
  - `isWritable` gains that one pattern;
  - `.craftory/features/` is untouched;
  - the design doc is corrected to match.
- **Session file shape.** `{ version: 1, session, user?, startedAt, rows: Rollup[] }`.
  - `user` is `git config user.email`, left out when it is unset.
  - The file is rewritten whole on each flush. Only this session writes it.
- **Flush points.** On `turn.complete` of the main thread, on `session.end`, and every 30 seconds while Build runs, debounced. A failed write is retried at the next flush point, and the error is not shown to the user unless it persists through `session.end`.
- **Drafts.** A draft feature has no spec, so its spend stays in `$.store` under `spend:draft:<draftId>`, rolled up the same way.
  - When `promote()` binds the spec, the draft rollup is written into the session file under the new slug and the store key is cleared.
  - A draft that is discarded keeps its spend local; it is not committed.
- **Outside features.** Kept in `$.store` only, under `spend:outside`, as a rolling 30-day rollup. It is not committed: it isn't any feature's cost, and the team doesn't need it. The first draft of the design doc committed it; this is flagged for confirmation.
- **Reading totals.** On session start, and whenever the tracker refreshes, list `.craftory/spend/<slug>/`, parse each file, skip and remember the bad ones, and sum them. This session's in-memory entries are added on top until they are flushed, so the figures update live.
- **UI.**
  - `statusLine` and `chipText` append `· $x.xx` when the active feature's total is known, or `· 412k` when there are tokens but no dollars.
  - The phase card model gets an optional `spend` row.
  - The Build agent row gets `≈$` beside the existing token bar.
  - Format: under $10 with two decimals, above with one, and `k`/`M` for tokens (reuse `budgetK`).
- **Spend tab.** Add `{ id: 'spend', hotkey: '6', title: 'Spend' }` to `TABS`, last, so the existing hotkeys 1–5 keep their meaning.
  - Content, in order: the active feature's total and breakdown (phases, then tickets under Build and Review), then a group-by toggle (Phase, Model or Person), then other features by most recent, archived ones last, then Between phases inside each feature, then Outside features, then any skipped files.
  - Mobile: read-only, the same content.
- **Text surfaces.** `markdownSummary` adds one line: `Spend: $4.12 (318k fresh tokens) across 3 sessions`.
- **Surfaces.** Tracking runs wherever hooks run. The UI follows the existing surface split, and the band never shows a spend notice in v1.

## Testing Decisions

- **What makes a good test.** It asserts what the user sees (a status line, a card row, tab text) or what ends up on disk. It doesn't assert on internal calls.
- **Seam 1: the pure core.** Table tests for `attribute`, `splitDelta` (one step, three concurrent agents, a zero delta, a missing `cost`, a baseline), `rollup` and `sumFiles` (two sessions, two people, one corrupt file).
- **Seam 2: the hooks in the fake world.** Use `tests/harness.ts` and `build-harness.ts` with a scripted `turn.step` sequence and a fake `$.session.usage()` whose `cost.usd` climbs. Cover:
  - main-only Align, then a draft that binds;
  - Build with 3 parallel agents, where the phase total is exact and the agent figures are `≈`;
  - a budget stop step, which is not charged;
  - no `cost`, which shows tokens only and the "unavailable" line;
  - a resume baseline.
- **Seam 3: storage.** The flush writes only `.craftory/spend/<slug>/<sessionId>.json`. `isWritable` accepts that pattern and still refuses `../`, `.git` and other names. A second session's file is summed and never rewritten.
- **Latency.** The latency test covers the extra `turn.step` work: one `usage()` read and an in-memory push.
- **Prior art.** `evidence-build.test.ts`, `stale-agents.test.ts`, `pane-tab-row.test.ts`, `band.test.ts`, `settings.test.ts`.
- Run on the pinned Claude Code (`CLAUDE_CODE_VERSION` in `.github/workflows/ci.yml`).

## Out of Scope

- Budgets, `deny.overBudget`, rate-limit windows and throttling (v2).
- Model and effort routing, escalation, forecasts, the Retro summary and `spend.md` (v3).
- A price table. Dollars come only from `cost.usd` deltas.
- A switch to keep spend out of git (`spend.commit: false`). It is noted in the design doc and not in v1.
- Exporting spend (CSV or JSON) beyond the committed files.

## Open Questions

- Confirm that Outside features stays local-only (see Implementation Decisions), not committed as the design doc said.
- Does `cost.usd` move synchronously with each `turn.step` answer, including subagent steps, or only at `session.measure`? Ticket 01 settles this. If it lags, the queue in `splitDelta` absorbs it, but a phase boundary that falls inside the lag would charge some spend to the wrong phase.

## Further Notes

- Tickets, as vertical slices:
  - (01) the in-memory ledger and attribution, shown on the status line for this session;
  - (02) the committed session files and totals across sessions;
  - (03) draft spend that binds to the spec;
  - (04) the phase card Spend row and the Build agent `≈$`;
  - (05) the Spend tab;
  - (06) the text surfaces, glossary and README.
- Commit scope is `craftory`. Do not edit versions or `CHANGELOG.md` by hand.
