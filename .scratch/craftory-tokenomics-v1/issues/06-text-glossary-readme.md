# 06: Text surfaces, glossary and README

**What to build:**

- `/craftory`'s text reply (`claude -p`, the cloud) adds `Spend: $4.12 (318k fresh tokens) across 3 sessions`.
- `GLOSSARY.md` defines **Spend**, **Fresh tokens**, **Cache-hit %**, **Between phases** and **Outside features**.
- The README gains a Spend section (what is tracked, where it is stored, the `≈` rule, surfaces without cost), the Spend tab in the pane list, and a features bullet.

**Blocked by:** 04, 05

**Status:** resolved

- [x] `markdownSummary` line, with tests for dollars, tokens only and no spend
- [x] Glossary entries with their _Avoid_ lines. "Cost" is not one of them: glossary drift would flag every `cost.usd` in a diff
- [x] README updated; the screenshots are left for `/screen-recording` (ticket 07, ready-for-human)
