# Handoff: Tokenomics for craftory

Nov 17, 2026 · @Tine Kondo

## Summary

Add **Tokenomics** to craftory: a record of what each feature costs, kept phase by phase and ticket by ticket, plus budgets, rate-limit awareness, a choice of model and effort for each phase, and a cost forecast that feeds Retro. It ships in three slices. The engine already provides everything this needs (Claude Code 2.1.325). Craftory adds the attribution, the storage and the UI.

Principles (from the grill, and the same as craftory's own):

- **Observe, then steer.** Spend is always tracked. Every budget and every route is off until you set it.
- **Soft by default.** A limit that is reached asks or warns. It refuses only behind an opt-in deny rule, which `deny.hardGates` also turns on.
- **Shared facts in the repo.** Each feature's spend is committed under `.craftory/features/`, so the team sees it. Personal UI preferences stay in `$.store`.
- **Never colour alone.** Every amber or red state is also a word.

## Decisions

All settled in the grill on Nov 17, 2026.

| # | Question | Decision |
| --- | --- | --- |
| 1 | Scope | All four: spend visibility, budgets and guardrails, model and effort routing, forecasting and retro |
| 2 | Unit of truth | Both. Tokens come from each step. $ comes from deltas of the session's `cost.usd`, charged to whatever was active. No price table |
| 3 | Storage | The feature record, committed and shared |
| 4 | Audience | Both equally: you while you work, and the team or lead afterwards |
| 5 | Token counting | Budgets keep the **fresh** count (input + cache-creation + output, as today). Views also show cache reads and the cache-hit % |
| 6 | $ per agent | The delta is split across the active agents by their token share in that interval and shown as an estimate (`≈$1.20`). $ is exact at the phase level |
| 7 | Display | Phase cards, the Build agent list, the status line and summary chip, and a new **Spend** pane tab |
| 8 | Merge-safe storage | One append-only file per session: `.craftory/spend/<slug>/<session>.json`. Totals are summed when read |
| 9 | Budget levels | An optional $ cap per feature and per phase. The per-agent token cap (80k) is unchanged |
| 10 | Enforcement | Amber at 80%. At 100%, a band notice with **Raise budget**, **Continue** and **Diagnose**. A new `deny.overBudget` refuses new phase skills and agent spawns. `deny.hardGates` turns it on |
| 11 | Rate limits | Show the windows on the Build card, slow down parallelism above a threshold, and warn before `/implement-spec` when the forecast exceeds what is left of a window |
| 12 | Budget defaults | Off until set. Tracking is always on |
| 13 | Routing | A model and effort for each phase, set in Settings › Pipeline. The default, `session`, rewrites nothing |
| 14 | Main thread | Routing applies to subagents only. Routing the main thread is a separate opt-in. When it is on, the band says so and the model reverts when the phase ends |
| 15 | Escalation | Offered on the card (**Retry on <stronger model>**), never automatic |
| 16 | Forecast basis | This repo's history: the median and p90 per ticket and per phase. Shows "no history yet" until 2 or more features have finished |
| 17 | Retro | A spend summary on the Retro card, injected into `/retro`'s context, and written to `.craftory/spend/<slug>/spend.md` |
| 18 | Spend outside a phase | Spend under the active feature with no phase running is "Between phases". Spend with no active feature goes to "Outside features", which appears only in the Spend tab |
| 19 | Delivery | Three slices (below), this document first |

## Engine facts this rests on

Cites refer to `tools/claude-code-types/2.1.325/index.d.ts`. Where it disagrees with this document, the types win.

- `turn.step` has `model`, `effort` and `agentId` (absent on main). Its result carries `usage` (`ModelUsage`: the four counts) and the model that answered. `next({ ...e, model, effort })` rewrites one step. The hard stop at the per-agent budget already hooks here.
- `$.session.usage()` returns `context`, `rateLimits[]` (`kind`, `percentUsed`, `resetsAt`) and `cost?.usd`. That `usd` is summed over every priced response, subagents and mods' `$.model` calls included. Without `breakdown` the call is free, so it can be read after every step.
- `session.measure` fires after each main-thread turn and whenever a rate-limit window moves a whole point. Use it for rate limits. Use the per-step read for $ deltas.
- `UserPromptSubmit` / `UserPromptExpansion` take `additionalContext`. This is how the spend summary reaches `/retro`.
- `cost` is absent where the host keeps no ledger. Then craftory shows tokens only and says "$ unavailable on this surface". It never shows `$0`.

## Model

### Attribution

Each answered step is one **spend entry**:

```ts
type SpendEntry = {
  at: Millis
  feature: FeatureId | null          // null → "Outside features"
  phase: PhaseId | 'between' | null
  ticket: IssueRef | null            // set for Build/Review agents
  agentId: AgentId | null            // null on main
  model: string                      // the model that answered
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  usd: number | null                 // this entry's share of the cost delta
  usdEstimated: boolean              // true when split across concurrent agents
}
```

- **Phase of a step.** A subagent's step is charged to its run's ticket and to Build, or to Review for `code-review` agents. A main step is charged to the phase that is Running. If none is running, the active feature gets it as `between`. With no feature it goes to `null` (Outside features).
- **$ delta.** After each step, read `cost.usd`. The delta since the last read covers every step answered in between. One step gets the whole delta. Several steps split it by fresh-token share and are marked estimated. Splitting by token count leans towards cheap models when models are mixed, so the "≈" stays on screen.
- Entries are kept in memory and flushed to the session file on turn end, on `session.end` and every 30 seconds while Build runs. Each flush rewrites only this session's file.

### Storage

Feature records are flat files (`.craftory/features/<slug>.json`), and `isWritable` allows only `<slug>.json` there. So spend lives in its own folder:

```
.craftory/features/<slug>.json          # existing record; gains budgets in v2
.craftory/spend/<slug>/<sessionId>.json # { version, session, user?, startedAt, rows }: rolled up per (phase, ticket, agent, model)
.craftory/spend/<slug>/spend.md         # v3: written at Retro (or Ship when Retro is off)
```

- A session file holds rollups, not every step, so files stay small. Raw entries stay in memory only.
- `user` is `git config user.email`. When it is unset, the field is left out. The Spend tab can group by person.
- A draft feature (no spec yet) keeps its spend in `$.store` and moves it into the session file when the spec binds.
- Outside-features spend stays in `$.store` only, as a rolling 30-day rollup. It is not committed.
- Readers sum every session file. A file that fails to parse is skipped and named on the Spend tab.

### Config

New keys in `.craftory/config.json`. All are off or empty by default.

| Key | Default | Effect |
| --- | --- | --- |
| `budgets.featureUsd` | `null` | Default $ cap for new features. A feature's own `budgets.usd` overrides it |
| `budgets.phaseUsd.<phase>` | `null` | Default $ cap per phase |
| `budgets.warnAt` | `0.8` | Fraction at which the bar turns amber |
| `rateLimits.throttleAt` | `80` | `percentUsed` of any window above which new spawns are held to `rateLimits.throttledParallel` |
| `rateLimits.throttledParallel` | `1` | The parallel limit while throttled |
| `pipeline.<phase>.model` | `"session"` | Model alias or id for the phase's subagents. `session` rewrites nothing |
| `pipeline.<phase>.effort` | `"session"` | `low` to `max`, or `session` |
| `routing.mainThread` | `false` | Also route the main thread while a phase runs |
| `routing.escalateTo` | `"opus"` | The model **Retry on …** offers |
| `deny.overBudget` | `false` | Refuse new phase skills and agent spawns once the feature or phase budget is reached. On when `deny.hardGates` is on |

## Slices

### v1: Visibility and storage

- Attribution and flush as above. Add `src/spend.ts` (pure: the rollup, the delta split, the sums) and `hooks/shell/spend.ts` (I/O).
- **Phase cards** get a `Spend` row: `$2.14 · 318k fresh · 61% cache`.
- **Build agent list.** `≈$0.42` beside each token bar.
- **Status line and summary chip:** `Export invoices as CSV · Build 2/5 · $4.12`.
- **Spend tab** (pane hotkey `6`): the feature total, then phases, then tickets, with toggles to group by model and by person. Then Between phases, then Outside features. It also shows archived features' totals.
- Text surfaces (`claude -p`, cloud): `/craftory` adds one line with the feature's total.
- Glossary: add **Spend**, **Fresh tokens**, **Cache-hit %**, **Between phases**, **Outside features**.

### v2: Budgets and rate limits

- Budgets in Settings: a feature row in Flow, and per phase under Pipeline. Store them on the feature record.
- A new phase state is not needed. The existing **Over budget** state and glyph `▲` now apply to a phase as well as an agent.
- At 100%: a band notice (`Build is at $12.40 of $12 · Raise budget / Continue / Diagnose`). **Continue** silences it for that phase. `deny.overBudget` refuses with the rule's name and the switch that turns it off.
- **Rate limits** on the Build card: `five_hour 72% · resets 18:40`. Above `throttleAt`, Craftory refuses a spawn beyond `throttledParallel` and gives the reason, as `maxParallel` does today.
- Before `/implement-spec`, Craftory warns when the forecast p90 is more than what is left of the tightest window. This needs v3's forecast. Until v3, it warns only on `throttleAt`.

### v3: Routing, forecast and retro

- **Routing.** For a subagent, the model is set at spawn: the `Agent` call's `model` input in the existing `tool.call` hook, with `effort` on the agent's first step. Craftory never changes the model mid-loop, because a model switch throws away the prompt cache. Main-thread routing (opt-in) rewrites `turn.step` while the phase runs, and the band shows `Align runs on opus/high`.
- **Escalation.** On a Failed or Over budget ticket, the card adds **Retry on <escalateTo>**. It reuses the kept worktree.
- **Forecast.** From all finished features' spend files, it takes the median and p90 $ per ticket for Build and per phase for the rest. It shows on the Tickets card (`Build ≈ $9 (p90 $14) for 5 tickets`) and is saved on the feature when Build starts, so Retro can compare.
- **Retro.** The card shows the total, forecast against actual, the top 3 tickets and phases by cost, the cache-hit % and the spend by model. When `/retro` is submitted, the same summary goes in as `additionalContext`. At the end of Retro (or Ship, when Retro is off), Craftory writes `.craftory/spend/<slug>/spend.md`.

## Risks and open edges

- **$ split accuracy** when concurrent agents run on different models. Accepted, and marked `≈`. A price table could fix it later without changing the storage.
- **Prompt cache.** Routing must never switch the model mid-loop. Add a test that it can't.
- **Resumed sessions.** `cost.usd` covers the session from its first launch. The first read after a resume sets the baseline and is not charged.
- **Committed cost data.** Some teams will not want dollars in git. This is not in scope yet; it would be a `spend.commit: false` switch that falls back to `$.store`.
- **Fixtures.** Tests need captured `turn.step` and `session.usage()` sequences: one main-only run, one with 3 parallel agents, one on a surface without `cost`.
