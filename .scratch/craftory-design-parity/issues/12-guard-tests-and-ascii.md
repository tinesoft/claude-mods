# 12: Guard against colour inside Desktop Buttons

**What to build:** A guard test walks every band and pane tree the mod draws on Desktop (rail, summary, phase card, Build card, frontier card, every pane tab) and fails if any `Text` inside a `Button` carries a `color`, so the decision that keeps colour out of Desktop Buttons cannot regress. The same pass checks that every new mark (dot fallback, `›`, `│`, `×`, type text) has an ASCII form, and that every new colour comes from the design tokens in light and dark.

Spec: [spec.md](../spec.md), stories 51–53. Limits: [analysis.md](../analysis.md), decision 1.

**Blocked by:** 03, 05, 06, 07, 09, 10, 11 (every tree must already be clean)

**Status:** ready-for-agent

- [ ] The guard test mounts each band and pane state on Desktop through the harness and fails on any coloured `Text` inside a `Button`.
- [ ] With ASCII glyphs on, the band and pane trees on the terminal hold no non-ASCII mark from this spec.
- [ ] Light and dark runs show only design-token colours for the new elements.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] One final live look on Desktop and the terminal across the band and the pane.
