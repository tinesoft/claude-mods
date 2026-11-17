# 01: Spend ledger and attribution, shown on the status line

**What to build:** The tracer bullet. Each answered `turn.step`, on main and in agents, becomes a spend entry in memory. It has the step's four token counts and model, and its share of the `cost.usd` delta from `$.session.usage()`. It is charged to the feature, phase, ticket and agent by the rules in the spec. The status line and summary chip end with this session's total for the active feature (`· $x.xx`, or `· 412k` when there are no dollars). Nothing is written to disk yet.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Spike first: confirm whether `cost.usd` moves with each `turn.step` answer, subagent steps included, or only at `session.measure`, and note the answer in the spec. Settled from the types, with a design that works either way (see the spec's Decisions made while building). The live check is left for a human (see Comments)
- [x] `src/spend.ts`: `SpendEntry`, `attribute`, `splitDelta`, `rollup`, with table tests
- [x] `turn.step` wiring on the main and agent branches; the budget stop path is not charged
- [x] Between phases and Outside features attribution
- [x] Baseline on the first step and after a resume; a missing `cost` gives `usd: null`, never `0`
- [x] `statusLine` and `chipText` append the total; fake-world tests for main-only, 3 parallel agents (the phase is exact, the agents are `≈`) and no `cost`
- [x] The latency test covers the new `turn.step` work

## Comments

- 2026-11-17: no authenticated Claude Code session was available, so the cost-timing spike was not run live. To check by hand: in a real session with this branch loaded, run a Build with 2 or more agents and compare the status line total with `/cost`. The two should match to the cent, less any spend from before the first step.
