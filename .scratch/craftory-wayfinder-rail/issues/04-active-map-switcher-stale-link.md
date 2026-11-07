# 04: Several maps, active-map rule, switcher and stale map link

**What to build:** A Feature can store one optional `map` reference. The active map is the one the active Feature names, else the most recently updated open map, and when several maps exist the card shows a switcher listing the rest while the chip row does not grow. A Feature's `map` link has three states: valid (used as is), unknown (tracker unreachable, kept silently) and stale (missing or not map-shaped, shown as a quiet "Map not found" line with fallback to the active-map rule). The mod never rewrites a stale link. Adds the `stale-link` scenario.

**Blocked by:** 01 (Local map in the rail chip)

**Status:** ready-for-agent

- [x] Active map follows the Feature link, else the most recently updated open map
- [x] Switcher appears only with several maps and does not widen the rail
- [x] Unreachable tracker keeps the link with no warning
- [x] Stale link shows "Map not found", falls back, and is never rewritten
- [ ] Tests cover all three link states in the fake world
