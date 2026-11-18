# 07: README and glossary for budgets and rate limits

**What to build:**

- **README.** Budgets and their levels, the budget notice and its actions, `deny.overBudget` (Gates section, config table, "What its hooks decide"), rate-limit windows and throttling (Build section), the new config keys, and the new Settings rows.
- **Glossary.** Add **Budget**, **Near budget**, **Rate-limit window** and **Throttled**, and extend **Over budget**, **Hard gates** and **Gate** where they now cover budgets.

**Blocked by:** 01, 02, 03, 04, 05, 06

**Status:** resolved

- [x] README sections and tables updated, with "Data, programs and permissions" covering the rate-limit reading
- [x] Glossary entries with _Avoid_ lines that do not appear in the code
- [x] `prettier --check` passes
