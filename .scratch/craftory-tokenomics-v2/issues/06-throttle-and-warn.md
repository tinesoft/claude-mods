# 06: Throttle spawns near a full window, and warn before Build

**What to build:** While any rate-limit window is at or above `rateLimits.throttleAt`, Craftory starts at most `rateLimits.throttledParallel` (1, a new key) implementers at once, never above `maxParallel`. A held spawn's reason names the window, its use and its reset. The Build card's agents summary adds `· Throttled`.

Starting `/implement-spec` or `/implement` while a window is that full shows a band notice first: `5-hour window at 84% · Build runs 1 agent at a time until it resets at 18:40`, with **Dismiss**. It never drops or delays the command. Settings › Worktrees gains "Throttle at" and "While throttled".

**Blocked by:** 05

**Status:** resolved

- [x] Config `rateLimits.throttledParallel`; config tests
- [x] `decideSpawn` takes the windows and lowers the limit, with the reason; build table tests (under, at, over, off at 100, above maxParallel)
- [x] Agents summary `· Throttled`
- [x] The warn-before-Build notice from the rail, the pane and a typed command; never drops the command; fake-world tests
- [x] Settings › Worktrees rows; settings tests
