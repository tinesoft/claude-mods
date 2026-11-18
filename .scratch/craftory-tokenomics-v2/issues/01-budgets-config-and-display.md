# 01: Budgets in config and Settings, shown on the Spend displays

**What to build:** A developer can set a dollar budget for every Feature and for each phase, in Settings › Pipeline (written to `budgets.featureUsd` and `budgets.phaseUsd.<phase>` in `.craftory/config.json`). A Feature's own record can override either (`budgets.usd`, `budgets.phases`). Once a budget is set:

- the phase card's Spend row reads `$9.80 of $12`;
- the status line and the summary chip read `$9.80 of $20`;
- the Spend tab and `/craftory`'s text reply follow the same rule.

At `budgets.warnAtPercent` (80) or more, a figure turns amber and says "Near budget". At 100% it turns red and says "Over budget". Budgets are whole dollars, `0` is none, and all are off by default. They do not apply where the host keeps no cost ledger, and the Settings rows say so.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Config keys `budgets.featureUsd`, `budgets.phaseUsd.<phase>`, `budgets.warnAtPercent` with defaults and bounds; config tests
- [x] Feature record gains optional `budgets`, parsed, serialised and merged; features tests
- [x] One pure budget-level function (none / ok / near / over) and effective-budget resolution (record over config, `0` as none, drafts get defaults); table tests
- [x] Card Spend row, status line, summary chip, Spend tab and text reply show `of $N` and the Near/Over words and roles; fake-world tests on the terminal and Desktop
- [x] Settings › Pipeline: "Feature budget" row and a "Budget" row per phase, with presets and an own-value field; the no-cost-ledger note; settings tests
