# 02: The rail wraps on Desktop and fits at 115 columns on the terminal

**What to build:** On Desktop the rail never collapses to the summary for width: it stays a row and wraps onto a second line, and it draws no frame of its own (no border, no fill on the rail container), so it sits directly on Desktop's band frame. On the terminal the width rule stays cell-based but uses the new, shorter map chip, so at 115 columns with a Map and a long Feature title the full rail shows; it only collapses to the summary when even the shortened row cannot fit (for example at 60 columns). A person's own choice of the summary layout still wins on every surface. The wrapped rail reports how many lines it takes so the card's density rule (roomy, compact) counts them, and a card opened over a wrapped rail on Desktop falls back to compact density so both fit the band.

Spec: [spec.md](../spec.md), stories 21–25. Limits: [analysis.md](../analysis.md), decisions 3, 4 and 7.

**Blocked by:** 01 (the new map chip width)

**Status:** resolved

- [ ] The fit rule takes the surface's kind: rich surfaces always give `row` with wrap; the terminal gives `row` or `summary` by cells.
- [ ] The summary layout setting forces the summary on every surface.
- [ ] On Desktop the rail container has no border and no fill; the terminal keeps today's frame.
- [ ] The wrapped line count reaches the card density rule; a card over a wrapped Desktop rail is compact.
- [ ] Width cases are tested: terminal at 115 columns with a Map and a long title → row; terminal at 60 → summary; Desktop at 85 body columns → wrapped row.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] Live look on Desktop and the terminal with a Map attached: all seven phases show; on Desktop no nested dark frame.
