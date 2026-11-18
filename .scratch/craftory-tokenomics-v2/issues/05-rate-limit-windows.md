# 05: Rate-limit windows on the Build card

**What to build:** The Build card shows each rate-limit window the account reports, such as `5-hour 72% · resets 18:40 · 7-day 31% · resets Mon 09:00`. The reading comes from `$.session.usage()` at session start and from each `session.measure`. A window at or above `rateLimits.throttleAt` (80, a new key, 100 = off) is amber and says "Throttled". With no reading (off a subscription) there is no line.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Config `rateLimits.throttleAt` with default and bounds; config tests
- [x] The shell keeps the last `rateLimits` reading; the harness can be given windows
- [x] Pure window format: labels, local 24-hour reset time, a weekday when not today, no reset; table tests
- [x] Build card line on the terminal, Desktop and VS Code, amber with "Throttled" at or above the threshold; fake-world tests
