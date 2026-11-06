# 08: Suggest /wayfinder notice

**What to build:** A developer deep in a long Align grill sees a band notice `Chart a map instead? · /wayfinder` once the questions the mod has counted pass `entry.wayfinder.afterQuestions` (default 12). It fires once per grill when the count first crosses the threshold. **Dismiss** silences it for that Feature only, stored on the Feature, and running `/wayfinder` from the notice clears it. It is silent when the Feature already has a `map` link. When no link exists but an open map does, the action reads **Attach to <map name>**. `entry.wayfinder.suggest: "off"` is a global switch in Settings. It renders on terminal and Desktop only.

**Blocked by:** 04 (Several maps, active-map rule, switcher and stale map link)

**Status:** ready-for-agent

- [ ] Fires once per grill at the configured threshold, using the counted-question signal
- [ ] Dismiss is per Feature; running `/wayfinder` clears the notice
- [ ] No notice when a `map` link exists; Attach variant when an open map exists
- [ ] `suggest: "off"` in Settings disables it everywhere
- [ ] Not shown on mobile
- [ ] Tests assert the notice, its once-only firing, Dismiss, Attach and the submitted command
