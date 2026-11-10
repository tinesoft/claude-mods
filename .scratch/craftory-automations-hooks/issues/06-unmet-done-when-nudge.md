# 06: Unmet Done-when nudge

**What to build:** With `automation.nudgeUnmetDone` on, when a turn ends in a Running phase whose Phase-evidence condition is unmet, the band shows a notice naming the phase and quoting the unmet condition from that table, for example "Align is still running: no spec has been created yet. Ask for it, or mark Align done." It has no submit action. At most once per phase per Feature; a dismiss holds for that Feature. Uses the automation notice from 01.

**Blocked by:** 01 (Automation notice pattern, proven with Handoff at 80%)

**Status:** ready-for-agent

- [ ] `automation.nudgeUnmetDone` exists, off by default, and appears in Settings
- [ ] Fires on turn end in a Running phase with unmet evidence; silent when the evidence is met
- [ ] Wording names the phase and quotes the Phase-evidence text
- [ ] No submit action
- [ ] At most once per phase per Feature; dismissed per Feature
- [ ] Fake-world tests assert the wording, the once-per-phase limit, dismiss and switch off
