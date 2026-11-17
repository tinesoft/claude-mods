# 05: The Spend pane tab

**What to build:** A sixth pane tab, **Spend** (hotkey `6`, placed last so hotkeys 1 to 5 are unchanged). From the top:

- the active feature's total and its breakdown by phase, then by ticket under Build and Review;
- a group-by toggle: Phase, Model or Person;
- the other features, most recent first, with archived ones last;
- Between phases inside each feature;
- Outside features;
- any spend files that were skipped.

It is read-only on mobile.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] The `TABS` entry, hotkey and tab count; `pane-tab-row` tests updated
- [ ] Breakdown and the group-by toggle (the toggle is a personal setting in `$.store`)
- [ ] Archived features listed with their totals
- [ ] Skipped files named with their path
- [ ] Pane tests on the terminal, Desktop and mobile
