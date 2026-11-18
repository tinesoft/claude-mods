# 03: `deny.overBudget` refuses phase skills and agent spawns over budget

**What to build:** With `deny.overBudget` on (or `deny.hardGates`), Craftory refuses:

- a phase's skill (typed, Claude's `Skill` call, or a rail or pane press) once that phase or the Feature is over budget;
- new Build agents once Build or the Feature is over budget.

Each refusal names the phase or the Feature, the spend, the budget and the switch that turns it off. A refused press shows the refusal in the band with **Raise budget** and **Diagnose**. It refuses only on a positive "over": no cost ledger, no budget, or an invalid config lets the call through. Work already running is never stopped.

**Blocked by:** 01

**Status:** resolved

- [x] `deny.overBudget` in config (default off), implied by `hardGates` through `ruleVia`; config and deny tests
- [x] Refusal of a typed phase command and of Claude's `Skill` call; fake-world tests
- [x] Refusal of a rail or pane press, with Raise budget and Diagnose and no Run anyway
- [x] Refusal of a Build spawn in `decideSpawn`, with the reason; build tests
- [x] Fail-open tests: off, under budget, no budget, no cost ledger
- [x] Settings › Automation toggle, locked on under `hardGates`; settings tests
