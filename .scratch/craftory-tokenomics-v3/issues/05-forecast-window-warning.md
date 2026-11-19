# 05: Warn when Build's forecast would use up a rate-limit window

**What to build:** The shell keeps this session's cost readings and each window's `percentUsed`. Once at least $0.50 and 2 points have moved, it estimates the points used per dollar. When Build starts and the forecast p90 × points per dollar is more than the tightest window has left, a band notice says `Build is forecast at up to $14, about 35% of the 5-hour window · 22% is left, resets 18:40`, with **Dismiss**. It never drops the command. With no estimate there is no notice; v2's throttle warning is unchanged.

**Blocked by:** 04

**Status:** resolved

- [x] Pure estimate from readings, with its minimums; table tests
- [x] Warning rule and text; table tests
- [x] The notice from a typed command, a press and the pane; fake-world tests (warn, no estimate, enough room)
