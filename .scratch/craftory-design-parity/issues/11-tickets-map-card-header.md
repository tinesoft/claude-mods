# 11: Tickets map card header holds the switcher

**What to build:** In the pane's Tickets tab, the map card's header puts the Map source kicker and the map switcher on one row (a wrapped row on the terminal), so a person changes Maps where they read which Map they are on. Each row shows its Decision ticket type in mono, so the Tickets tab and the frontier card agree. The route-status line uses the shared helper from 01.

Spec: [spec.md](../spec.md), stories 49–50.

**Blocked by:** 01 (the route-status helper)

**Status:** resolved

- [ ] Kicker and switcher share one header row on both surfaces.
- [ ] Each ticket row shows its type in mono `Text`.
- [ ] Route status text comes from the shared helper.
- [ ] Harness tests on the terminal and Desktop with one Map and several Maps.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] Live look on Desktop and the terminal against the Panel board's Tickets tab.
