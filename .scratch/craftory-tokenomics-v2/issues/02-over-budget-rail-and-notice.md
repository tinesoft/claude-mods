# 02: Over budget on the rail, and the budget notice

**What to build:** When a phase that is running, up next or waiting on you reaches its budget, it shows **Over budget** (`▲`) on the rail, with `$12.4 / $12` as its meta. Done, skipped and gated phases keep their state.

When a phase or the Feature crosses into over budget, a band notice reads `Build is at $12.40 of $12` (or names the Feature), with three actions:

- **Raise budget** sets the Feature's own budget for it to 1.5× the current one, rounded up, and writes the record;
- **Continue** silences it until the budget changes, kept in `$.store`;
- **Diagnose** submits `/diagnosing-bugs` about the overrun.

It is raised once per Feature, phase-or-Feature and budget.

**Blocked by:** 01

**Status:** resolved

- [x] Flow derivation takes each phase's budget level; the Over budget state gains a dollar variant; rail and card tests
- [x] The new notice kind with its text and three actions, in the band
- [x] Raise budget writes the record and the notice drops; reaching the new budget raises it again
- [x] Continue records the budget in `$.store`; the same budget never raises it again
- [x] Diagnose submits `/diagnosing-bugs` with a line naming the overrun
- [x] Fake-world tests: once-only, each action, and no notice without a cost ledger
