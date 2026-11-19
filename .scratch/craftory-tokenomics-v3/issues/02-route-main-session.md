# 02: Route the main session while a phase runs (opt-in)

**What to build:** With `routing.mainThread` on (Settings › Automation, off by default), each main-session step while a phase is running gets that phase's model and effort (any that is not `session`). Steps between phases are left alone. While routing applies, the band shows `Align runs on opus · high`. The Settings hint warns that switching the main model re-reads the context once.

**Blocked by:** 01

**Status:** resolved

- [x] `routing.mainThread` config key; config tests
- [x] `turn.step` rewrites main steps only while a phase is running; fake-world tests (on, off, between phases, a phase on `session`)
- [x] The band note while it applies, also in the pane where there is no band; band tests
- [x] Settings toggle with the cache hint; settings tests
