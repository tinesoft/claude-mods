# craftory: artboards

A copy of the boards of the Craftory design canvas
(https://claude.ai/artifact/4DU8JVRxfgtaKVKQcVkrbw, owner access), taken on Oct 25, 2026.

These are a **visual and behavioural reference, not code to port**. Each file is a self-contained
Design Component page: the markup shows layout, copy and colour tokens, and the
`<script type="text/x-dc" data-dc-script>` block at the bottom holds the sample data and interaction
logic. They load `./support.js` from the canvas runtime, so they do not run on their own: open the
canvas to click through them.

| File | Board | Size | Interactive |
| --- | --- | --- | --- |
| `Main.dc.html` | Phase rail above the prompt bar, Build open with live agents and worktrees | 1280 × 1080 | yes |
| `Panel.dc.html` | Craftory pane beside the chat: flow, tickets with inbox, worktrees, glossary, settings | 1280 × 900 | yes |
| `Settings.dc.html` | Settings tab of the `/craftory` pane: entry points, tracker, docs, glossary, pipeline, worktrees | 1280 × 3600 | yes |
| `States.dc.html` | Phase states, rail variants (plugin missing, first run, entering from triage), glossary, toasts | 1280 × 1900 | no |
| `Mobile.dc.html` | Mobile: scrolling phase rail | 390 × 844 | no |
| `Logo.dc.html` | Logo in light and dark, full logo and mark | 960 × 600 | no |
| `canvas.json` | The canvas index: board positions, sizes and titles | | |

`Logo.dc.html` points at the SVGs in `assets/images/` at the repo root. Colour tokens are the
session-activity ones (see DESIGN.md › Palette), declared at the top of each board for light and dark.
Where a board and `DESIGN.md` or `plan.md` disagree, the documents win.
