# 01: Spend ledger and attribution, shown on the status line

**What to build:** The tracer bullet. Each answered `turn.step`, on main and in agents, becomes a spend entry in memory. It has the step's four token counts and model, and its share of the `cost.usd` delta from `$.session.usage()`. It is charged to the feature, phase, ticket and agent by the rules in the spec. The status line and summary chip end with this session's total for the active feature (`· $x.xx`, or `· 412k` when there are no dollars). Nothing is written to disk yet.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Spike first: confirm whether `cost.usd` moves with each `turn.step` answer, subagent steps included, or only at `session.measure`, and note the answer in the spec's Open Questions
- [ ] `src/spend.ts`: `SpendEntry`, `attribute`, `splitDelta`, `rollup`, with table tests
- [ ] `turn.step` wiring on the main and agent branches; the budget stop path is not charged
- [ ] Between phases and Outside features attribution
- [ ] Baseline on the first step and after a resume; a missing `cost` gives `usd: null`, never `0`
- [ ] `statusLine` and `chipText` append the total; fake-world tests for main-only, 3 parallel agents (the phase is exact, the agents are `≈`) and no `cost`
- [ ] The latency test covers the new `turn.step` work
