# 01: Map chip reads its counts and is purple on Desktop

**What to build:** With a Map attached, the map chip reads `◆ <map name> · n decided · n open` on both surfaces (with `Closed` after the counts when the Map is closed). The route status ("No open tickets · Route clear?", plus the fog hint) leaves the chip and shows in the frontier card instead. On Desktop the chip is drawn in the agent colour, as on the board: purple border, fill, diamond icon and text. This ticket also lays the two shared pieces later tickets build on: an `agent` colour role in the theme (light and dark values copied from session-activity's tokens) and the **chip pattern**, one way to draw a tinted, pressable chip: a keyed Box carries the look (border, fill, hover, `Svg`, coloured `Text`) and a plain Button inside carries only the press and a neutral label. On the terminal the chip pattern draws a coloured glyph plus a plain Button label, as today.

Spec: [spec.md](../spec.md), stories 1–6 and 38. Limits: [analysis.md](../analysis.md), decisions 1 and 5.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [ ] The chip text helper returns `◆ <name> · n decided · n open`, `… Closed` when closed, never the route status; a compact `n✓ n?` form exists for the summary (ASCII forms too).
- [ ] A shared route-status helper produces "No open tickets · Route clear?" (with the fog hint when Not yet specified is non-empty); the frontier card shows it when the Active map has no open tickets.
- [ ] The theme has an `agent` triple in light and dark and `paint` answers an `agent` role.
- [ ] The chip pattern exists in the UI helpers and the map chip uses it; on Desktop no `Text` inside the chip's Button carries a `color`, and the diamond and counts are `Svg`/`Text` siblings in the agent colour.
- [ ] With the frontier card open, the chip shows pressed: underline on the terminal, strong border on the chip Box on Desktop.
- [ ] Harness tests mount the band on the terminal and Desktop, light and dark, and check the chip's text, keys and look props; helper tests cover chip text, compact form and route status.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] Live look on Desktop and the terminal: the chip matches the board's wayfinder chip as closely as the surface allows.
