# Craftory UI vs design: gap analysis

**Status:** resolved

Input for `/prototype` then `/to-spec`. Compares the mod's code (`mods/craftory/src/*.tsx`) with
`docs/design/craftory/artboards/*.dc.html` and `DESIGN.md`. Where a board and `DESIGN.md` disagree,
`DESIGN.md` wins (gear not chevron, `Inbox` not `Triage`).

What was not done: the boards were not rendered (their `support.js` runtime is not in the repo), and
the mod was not live-drawn on Desktop or the terminal. The only render seen is the Desktop band in
`image.png`. Every Desktop claim below marked **(verify)** needs a live check first.

## Root causes (cut across every surface)

1. **Desktop draws every `Button` as a native button, `plain` or not** (engine types:
   "A desktop draws its native button either way"). The mod wraps each `plain` Button in a styled
   `Box` (phase step, map chip, triage, tabs), so Desktop shows a native pill inside or beside the
   Box chrome, and the label colours set on the child `Text` are lost (the map chip is white, not
   tinted). The design's controls are one flat surface each. **(verify)** what Desktop keeps of child
   `Text` colour, and whether a Box with `hover` + a press target can stand in for a Button.
2. **The band falls to the summary chip on Desktop.** `fitRail` (`src/card-model.ts`) budgets in
   terminal cells against `bodyColumns`; with a map chip it needs ~160 cells, so it drops to `chip`
   mode. The board's rail is `flex-wrap: wrap`: on Desktop it should wrap, not collapse.
   **(verify)** what `bodyColumns` reports on Desktop.
3. **The map chip text carries the route status.** `mapChipText` (`src/map-view.ts:160`) renders
   `◆ Craftory MVP No open tickets · Route clear? · fog`. `DESIGN.md` puts "No open tickets · Route
   clear?" in the card and the Tickets tab, and the chip is `name · 3 decided · 2 open`
   (`3✓ 2?` only in the collapsed summary). This alone makes the chip ~2× wider and forces cause 2.
4. **No `agent` role in the theme.** The wayfinder chip and card are purple in the design
   (`--agent-fg/bg/bd`); `TRIPLES` has only skill, perm, hook, so the mod paints them skill blue.
5. **Double container on Desktop.** Desktop already frames the band (grey rounded slot in the
   screenshot); the rail's own round border + surface fill nests a second frame inside it.

## Band: rail (Main.dc.html, States.dc.html)

| Element      | Design                                                                                                                      | Mod                                                                | Gap                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Order        | Inbox │ map chip │ **feature title** │ 7 phases … gear                                                                      | Inbox │ map chip │ 7 phases │ title … gear                         | Title should lead the phases, as a fill-tinted pill with a list icon that opens the pane                 |
| Phase marker | 22px circle: step number (grey ring = todo, blue ring = next, blue fill + white number = running), teal ring + check = done | State glyph/SVG (`·`, `▸`, spinner, `✓`)                           | No step numbers; todo is a dot. Spinner is fine as the running cue but the number is the design's anchor |
| Phase button | Transparent at rest; selected = fill + strong border + 3px blue ring                                                        | Surface fill, border painted surface, native button inside         | See cause 1                                                                                              |
| Meta badge   | Mono count pill (`#42`, `5`, `1/5`)                                                                                         | Mono caption with mixed bg                                         | Close                                                                                                    |
| Connector    | 10×2 px bar, teal after done, line otherwise                                                                                | `─` text                                                           | Fine on terminal; on Desktop a thin Box with `backgroundColor` is closer                                 |
| Map chip     | Purple border + fill, ◆ SVG, bold name, mono counts                                                                         | Surface fill, no border, `◆` text, skill colour (white on Desktop) | Causes 1, 3, 4                                                                                           |
| Inbox        | Dashed border, inbox icon, amber count pill                                                                                 | Same                                                               | Matches, apart from cause 1                                                                              |

## Band: collapsed summary

Design: `[◆ Billing v2 3✓ 2?] › [Title · Build 2/5]` + expand chevron, phase name in its state
colour, the count as a pill. Mod: map chip, then one bordered Box with a state icon and a single
bold clipped string. Missing: the `›` separator, the split title / phase / count styling. The
screenshot is this mode.

## Band: detail card and frontier card

|                                       | Design                                                                                     | Mod                                             | Gap                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Placement                             | Popover anchored over the pressed step, 440 px (540 with agents), shadow                   | Full-width Box in flow above the rail           | Use `position="absolute"` anchored left where Desktop allows **(verify)**; terminal keeps in-flow |
| Close                                 | × icon, trailing                                                                           | `Close` plain Button (native button on Desktop) | Add `role="dismiss"` so Desktop draws its native close at the trailing edge                       |
| Command / Helpers rows                | Inverse mono chip; skill-tinted chip with layers icon                                      | Same chips                                      | Close                                                                                             |
| Artifact tile, gate line, agents list | Tile, amber lock line, agents table with bars                                              | Present                                         | Detailed parity not checked; agents grid (132 px right column) is the likeliest drift             |
| Frontier card kicker                  | `Wayfinder · 3 decided · 2 open · 4 specs`, purple                                         | `view.kicker`, skill blue                       | Cause 4                                                                                           |
| Frontier list                         | Bordered section `Frontier · takeable now`, rows with ▸ + type badge (Prototype, Grilling) | Plain `▸ label` lines                           | No section frame, no type badges                                                                  |
| Frontier buttons                      | **Work next ticket** (primary), **Open map**                                               | **None**                                        | Missing, and `DESIGN.md` requires both                                                            |

## Pane (Panel.dc.html)

|                     | Design                                                                                                                              | Mod                                                                  | Gap                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Header              | Mono kicker `Craftory · spec #42`, title, `3 of 7 phases done · Build running, 2 agents`, gear + close icons                        | Bold `Craftory` + plugin line                                        | Header is the plugin status, not the feature. Plugin line belongs to the Settings tab header per `DESIGN.md` |
| Tabs                | Tablist with mono counts, selected = surface tab on fill strip                                                                      | Same idea, native button inside each tab Box                         | Cause 1                                                                                                      |
| Flow tab            | Vertical timeline: mark + a connecting vertical line, label + mono skill, detail                                                    | Glyph + label + command + result, plus buttons per row               | No timeline line; per-row buttons are not in the board (keep only if `plan.md` asks)                         |
| Tickets map card    | Kicker + map `Select` in one header row; summary + hint left, **Work next ticket** right; groups; Decided as a disclosure; Open map | Kicker; summary + Work next; groups; per-row **Take** buttons; links | Map switcher not in the header row; per-row Take not in the board; rows lack the mono type tag               |
| Inbox, spec tickets | Id, title, role/status pills, `/triage #n`, `/implement #n`                                                                         | Present                                                              | Pill styling likely drifts (cause 1)                                                                         |

Settings, Worktrees and Glossary tabs, notices and toasts were not compared line by line here.

## What the surfaces allow (target per surface)

- **Terminal**: glyphs, one row that wraps, text colour, round/dashed borders, no SVG, no pointer
  positioning. Target: same order and content as the board, glyph markers (`1`…`7` in a ring is
  not possible; keep the state glyph, add the number only if it fits).
- **Desktop**: SVG, exact colours, hover, borders, absolute positioning, native buttons.
  Target: layout and colours at board parity, with native Buttons accepted only where the board has
  a real button (card actions), not for chips and steps.
- **Mobile / VS Code**: pane only; the Flow tab heads with the wrapped rail and the map chip.

## Open questions for the prototype

1. On Desktop, does a `Button`'s child `Text` keep its `color` / `backgroundColor`? Can a Button be
   made to draw without native chrome, or must chips be Boxes with another press path?
2. What does `bodyColumns` report on Desktop, and does `flexWrap` wrap the band there?
3. Does `position="absolute"` on a band Box escape upward (popover over the transcript) or is it
   clipped to the band?
4. Does Desktop draw the band's own frame always, so the rail should drop its border there?

## Probe results

Probe mod: `band-probe` (throwaway, in this session's dev-mods folder). Q-popover dropped: the card
stays in the band above the rail, as now.

### Docs (engine types, 2.1.317)

- Desktop draws every `Button` as its native button; `plain` changes nothing there.
- `variant="primary"` gets the surface's primary look; `role="dismiss"` gets Desktop's native close.
- `bodyColumns` on Desktop = band width / the advance of one code-font character. Proportional UI
  text is narrower than that, so cell math over-estimates rich chips on Desktop.
- Not in the docs: whether a Desktop Button keeps its child Text colour, whether Desktop wraps a row
  Box, whether Desktop always frames the band.

### Terminal (Claude Code 2.1.311, 120 columns)

- `bodyColumns` = 115 (120 less the `[-]` mark). `maxRows` = 8.
- **The Craftory band is in summary mode on the terminal too**, at 115 cells: the map chip text
  (`◆ Craftory MVP No open tickets · Route clear? · fog`, 51 cells) leaves no room for the rail.
  Confirms root cause 3 on both surfaces.
- `plain` Button: label only, no chrome; a non-plain one is `[ label ]`. Primary and dismiss look
  the same as a plain bracketed Button.
- A row Box with `flexWrap="wrap"` wraps (9 bordered chips per line at 115 cells).
- A bordered chip costs 3 rows on the terminal. A wrapped rail of bordered steps would take 6 of the
  8 rows: keep the terminal rail borderless, one text row per line, as it is now.

### Desktop (Code tab, band about 770 px wide, dark)

- `bodyColumns` = 85, `viewport.columns` = 98, `maxRows` = 12.
- **Q1, Button colour: Desktop drops every colour inside a `Button`.** A plain Button with purple
  Text draws white text with no chrome. A non-plain one is a grey native pill, white text. Primary
  is a white pill. `role="dismiss"` is a grey `Close` pill in place, not a close mark at the edge.
- **A styled `Box` with `Text` and `Svg` children draws exactly as designed** (probe E: purple
  border, purple fill, purple ◆ and text). A plain Button inside such a Box keeps the Box's tint
  and border but its label is white (probe F). This is the Craftory map chip in `image.png`.
- A one-glyph plain Button (`⚙`) draws as the glyph alone.
- **Q2, wrap: a row Box with `flexWrap="wrap"` wraps on Desktop.** Ten `1 Align`-sized bordered
  chips fit on one line; cell maths says about 119 cells for them against 85. Desktop text is about
  30% narrower than the cell estimate, so `fitRail` collapses the rail far too early there.
- A bordered chip is about 44 px high on Desktop (design: 36 px), and three wrapped lines of them
  plus two text lines already scroll the band at `maxRows` = 12.
- **Q3, frame: Desktop always draws its own grey rounded frame around the band.** A rail Box with
  its own border and surface fill draws as a darker card nested in that frame (probe I). With no
  border and no fill (probe J) the rail sits on the frame, as the board's rail sits on its page.
  The dark `surface` token (#1B1D21) is darker than Desktop's band frame, so surface-filled chips
  read as holes, not as raised controls.

## Decisions the results force

1. **Chips and steps on Desktop: a tinted `Box` carries the look, and a plain Button carries only
   the press and a neutral label.** Colour that matters (state, role) moves out of the Button into
   `Svg` icons, the Box's border and fill, and `Text` siblings such as the counts. Phase labels the
   design paints blue (running, up next) will be ink; the blue stays on the numbered dot and the
   selected ring.
2. **No surface fill at rest on Desktop.** The board's steps are transparent at rest anyway; only
   the selected step gets `fill` and a strong border.
3. **The rail draws no outer frame on Desktop.** Desktop's band frame is the rail's container. The
   terminal keeps today's behaviour.
4. **On Desktop the rail never collapses for width; it wraps.** The summary chip stays for the
   person's own choice (`railLayout: summary`) and for the terminal when the row cannot fit.
5. **Map chip text is `name · n decided · n open`** on both surfaces; the route status moves to
   the frontier card and the Tickets tab, as `DESIGN.md` says.
6. **Card close on Desktop is a plain glyph Button (`×`)**, not `role="dismiss"` (that draws a
   grey pill in the band).
7. **Height budget.** On Desktop a rail line is about 44 px and the band holds 12 rows; the open
   card and a wrapped rail must fit together, so the card keeps its compact density rule.
