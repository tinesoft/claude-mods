# 04: Spend on the phase cards and the Build agent list

**What to build:** Each phase card gets a Spend row (`$2.14 · 318k fresh · 61% cache`). It is left out when the phase has no spend. Each Build agent row shows `≈$0.42` beside its token bar, without the `≈` when the agent ran alone. The words are shown as well as the colours. The row follows each surface's existing card layout (terminal, Desktop, VS Code, mobile pane).

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `card-model` gets an optional `spend` row; the formatting helpers are shared with the status line
- [ ] Agent row `≈$`, with `≈` only when the delta was split
- [ ] Tokens only, plus "$ unavailable on this surface", when `cost` is absent
- [ ] Band and card tests on the terminal and Desktop surfaces; the VS Code layout is checked against `docs/agents/vscode-surface.md`
