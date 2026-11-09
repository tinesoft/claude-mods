# Spec: Craftory design parity on the terminal and Desktop

**Status:** resolved

Target: the boards in `docs/design/craftory/artboards/` (Main, Wayfinder, States, Panel; Settings
and Mobile only where they touch the rail or the pane header) and `docs/design/craftory/DESIGN.md`.
Where a board and `DESIGN.md` or `plan.md` disagree, the documents win.

Limits: [analysis.md](./analysis.md). Its "Probe results" and its seven "Decisions the results
force" are settled facts about what each surface draws (Claude Code 2.1.317 on Desktop, 2.1.311
on the terminal). This spec does not reopen them.

## Problem Statement

On the Desktop Code tab, the Craftory band does not look like the design. With a Map attached, the
rail is gone: the band shows two dark pills, the map chip reading "Craftory MVP No open tickets ·
Route clear? · fog" in white and a summary chip, then a gear. The seven phases, the feature title
and the purple wayfinder chip from the board are missing. The terminal collapses the same way at
115 columns.

When the rail does show, it is still off the board: phases carry state glyphs, not numbered dots;
each step is a dark filled pill; the feature title trails the phases; the rail sits in a second
frame inside Desktop's own band frame. The frontier card has no **Work next ticket** or **Open
map** button. The pane opens on the plugin status line, not on the Feature, and its Flow tab is a
plain list, not the board's timeline.

The person who designed Craftory cannot trust the band to show where a Feature stands at a glance,
which is the band's whole job.

## Solution

The band and the pane follow the boards as closely as each surface can draw them, with the same
order, the same content and the board's colours wherever the surface keeps them.

- On Desktop, the rail is one row in the board's order (Inbox, map chip, feature title, seven
  phases, gear) that wraps onto a second line instead of collapsing. Chips and steps are tinted
  boxes; a phase shows its number in a dot (a check when Done); the map chip is purple. The rail
  sits directly on Desktop's band frame, with no frame of its own.
- On the terminal, the rail keeps its one-text-row-per-line form with glyphs and no borders, in the
  board's order, and only collapses to the summary chip when even the shortened row cannot fit.
- The map chip reads `name · n decided · n open` everywhere. Route status lives in the frontier
  card and the Tickets tab.
- The frontier card matches the board: purple kicker, a framed Frontier list with each Decision
  ticket's type, **Work next ticket** and **Open map**.
- The pane opens on the Feature: kicker, title, progress line, gear and close; its Flow tab is a
  timeline; its tabs do not depend on colour inside buttons.

Where a surface cannot draw the board, the fallback is the one the analysis names, and the user
stories below say which.

## User Stories

Each story ends with what changes on the **terminal** and on **Desktop**.

### Wayfinder map chip

1. As a person running a wayfinder Map, I want the map chip to read `◆ <map name> · 3 decided · 2
open`, so that I see how far the Map has come without the chip crowding out the rail.
   Terminal: new text, same glyph form. Desktop: same text.
2. As a person whose Active map has no open Decision tickets, I want the chip to read `◆ <map
name> · 5 decided · 0 open`, so that the chip keeps its shape and the "No open tickets · Route
   clear?" question lives where I can act on it.
   Terminal: the route status leaves the chip. Desktop: the same.
3. As a person whose Map is closed, I want the chip to say so after the counts, so that a finished
   Map is not mistaken for an open one.
   Terminal: unchanged meaning, new counts form. Desktop: the same.
4. As a person on Desktop, I want the map chip drawn purple (agent colour: border, fill and text)
   with a diamond icon, so that the Map reads as the parent of the Feature, as on the board.
   Terminal: unchanged (glyph in the agent colour where the tone is known). Desktop: a tinted Box
   with an `Svg` diamond; the counts and name are `Text` siblings in the agent colour; the press
   target is a plain Button whose label Desktop draws in ink (fallback from analysis decision 1).
5. As a person with the frontier card open, I want the chip to show it is pressed, so that I know
   which control opened the card.
   Terminal: underline as now. Desktop: the board's pressed ring (strong border) on the chip Box.
6. As a person in light and in dark mode, I want the agent colour taken from the same values
   session-activity uses, so that both mods agree in one band.
   Terminal: no change. Desktop: new agent triple in light and dark.

### Rail order and steps

7. As a person working a Feature, I want the rail in the order Inbox, divider, map chip, divider,
   feature title, seven phases, gear, so that I read from the parent Map to the Feature to its
   phases, as on the board.
   Terminal: the title moves before the phases. Desktop: the same order.
8. As a person on Desktop, I want the feature title drawn as a fill-tinted pill with a list icon,
   so that it reads as the Feature's name and not as loose text.
   Terminal: bold text as now. Desktop: tinted Box, `Svg` list icon, the title in ink, clipped with
   an ellipsis at the board's width.
9. As a person with several Features in flight, I want the title pill to stay the Feature switcher,
   so that I can still change the active Feature from the rail.
   Terminal: unchanged behaviour in the new position. Desktop: the same.
10. As a person on Desktop, I want each phase to show its number in a round dot (a check when
    Done), so that I can name a phase by its place, as on the board.
    Terminal: unchanged glyphs (no dot can be drawn; analysis "terminal" fallback). Desktop: an
    `Svg` dot per state: grey ring and number for not started, blue ring for Up next, blue fill and
    white number for Running, teal ring and check for Done.
11. As a person on Desktop, I want a Running phase to still look alive, so that I can tell work is
    happening.
    Terminal: spinner glyph as now. Desktop: the filled blue dot, with the spinner as its ring.
12. As a person on Desktop, I want the Needs you, Gated, Failed, Over budget and Skipped states to
    keep their own marks inside the dot, so that colour is never the only signal.
    Terminal: unchanged. Desktop: the state glyph in the dot, in the state's colour; Skipped struck
    through and dashed.
13. As a person on Desktop, I want phase steps to have no fill at rest, so that the rail sits on the
    band like the board's rail sits on its page.
    Terminal: unchanged. Desktop: no fill or border at rest (analysis decision 2).
14. As a person on Desktop, I want the step whose card is open drawn with a fill and a strong
    border, so that I see which phase the card belongs to.
    Terminal: underline as now. Desktop: `fill` and `lineStrong` on the selected step Box.
15. As a person on Desktop, I want hovering a step to tint it, so that I know it can be pressed.
    Terminal: none. Desktop: the existing hover mix, kept.
16. As a person on Desktop, I want phase labels in ink, with the state colour on the dot, so that
    the labels are readable whatever Desktop does to button text.
    Terminal: unchanged (label coloured by state). Desktop: labels in ink; Running and Up next
    keep blue on the dot only (analysis decision 1 fallback).
17. As a person, I want each phase's meta (`#42`, `5`, `1/5`, `Q6 of ~14`) as a small count pill
    after the label, so that progress shows at a glance.
    Terminal: unchanged. Desktop: mono count pill on the count background, as now.
18. As a person on Desktop, I want the connectors between phases drawn as short bars, teal after a
    Done phase and neutral otherwise, so that the rail reads as one path.
    Terminal: `─` glyph as now. Desktop: a short bar in the right colour.
19. As a person, I want the Inbox button to keep its dashed border and amber count, so that the
    entry point outside the seven phases stays distinct.
    Terminal: unchanged. Desktop: unchanged look; only its press target follows decision 1.
20. As a person, I want the gear at the right end of the rail, opening the pane on Settings, so
    that settings stay one press away.
    Terminal: unchanged. Desktop: a one-glyph plain Button, as the probe showed it draws cleanly.

### Rail frame, width and wrap

21. As a person on Desktop, I want the rail to draw no frame of its own, so that it does not sit as
    a dark card inside Desktop's band frame.
    Terminal: keeps whatever frame it has today. Desktop: no border and no fill on the rail
    container (analysis decision 3).
22. As a person on Desktop, I want the rail to wrap onto a second line when the band is narrow, so
    that I always see all seven phases instead of a summary.
    Terminal: unchanged rule. Desktop: never collapses for width (analysis decision 4).
23. As a person on the terminal, I want the rail to collapse to the summary chip only when the
    shortened row cannot fit in the band, so that at 115 columns with a Map attached I see the full
    rail.
    Terminal: the width rule uses the new map chip width. Desktop: not applicable.
24. As a person who chose the summary layout, I want the band to show the summary on every surface,
    so that my choice wins over the width rule.
    Terminal: unchanged. Desktop: unchanged.
25. As a person on Desktop with a card open, I want the wrapped rail and the card to fit in the band
    together, so that I do not scroll to reach the rail.
    Terminal: unchanged. Desktop: the card falls back to compact density when the rail wraps
    (analysis decision 7).

### Collapsed summary

26. As a person in summary mode with a Map, I want `[◆ <map> 3✓ 2?] › [<title> · <Phase> <count>]`,
    so that the summary carries the same Map-to-Feature path as the rail.
    Terminal: adds the `›` separator and the compact counts. Desktop: the same, styled as below.
27. As a person on Desktop in summary mode, I want the title in bold ink, the phase name in its
    state colour and the count as a pill, so that the summary reads like the board's.
    Terminal: unchanged colours. Desktop: title as the plain Button label (ink); phase name and
    count as `Text` siblings in their colours, outside the Button (decision 1 fallback).
28. As a person in summary mode, I want pressing the summary to expand the rail, so that the full
    rail is one press away.
    Terminal: unchanged. Desktop: unchanged behaviour.

### Card

29. As a person, I want the card to stay in the band above the rail, so that it does not cover the
    transcript.
    Terminal: unchanged. Desktop: unchanged (no popover).
30. As a person on Desktop, I want the card's close as a `×` glyph at its top right, so that it
    looks like the board's close and not a grey "Close" pill.
    Terminal: unchanged (`x` hotkey). Desktop: a one-glyph plain Button (analysis decision 6).
31. As a person, I want the card's kicker, title, paragraph, Command row, Helpers row, artifact tile,
    gate line and buttons in the board's order and styles, so that every phase card reads the same.
    Terminal: order and text checked, no new chrome. Desktop: inverse command chips, skill-tinted
    helper chips with the layers icon, tile background for the artifact, amber gate line with the
    lock icon, a primary Button for the command.
32. As a person, I want the Build card's Agents list to match the board (header with live count and
    total tokens, rows with id, title, status pill, TDD step, token bar with time, worktree line,
    footer with Pause all and Open panel), so that I can steer the agents from the card.
    Terminal: checked for order and text. Desktop: status pills as tinted Boxes with `Text`, not
    coloured Button labels.

### Frontier card

33. As a person, I want the frontier card's kicker in the agent colour, naming the Map source, so
    that the card ties to the purple chip that opened it.
    Terminal: agent colour where the tone is known. Desktop: agent colour.
34. As a person, I want the Takeable Decision tickets in a framed "Frontier · takeable now" list,
    one row each with a `▸` and the ticket title, so that I see what I can take now.
    Terminal: a heading line and `▸` rows, no frame. Desktop: a bordered section with a header
    strip and divided rows.
35. As a person, I want each Frontier row to show its Decision ticket's type (Research, Prototype,
    Grilling, Task) as a small outlined badge, so that I know what kind of work it is before I take
    it.
    Terminal: the type as text after the title. Desktop: an outlined badge in the type's colour,
    drawn as a Box with `Text`.
36. As a person, I want **Work next ticket** and **Open map** at the foot of the frontier card, so
    that I can act on the Map from the band.
    Terminal: two bracketed Buttons, Work next ticket as primary. Desktop: primary and secondary
    Buttons.
37. As a person whose Map has no Takeable tickets, I want **Work next ticket** shown but not
    pressable, with the hint "Nothing takeable", so that I understand why I cannot take one.
    Terminal: muted text. Desktop: muted text in place of the Button.
38. As a person whose Map has no open tickets, I want the card to say "No open tickets · Route
    clear?" (with the fog hint when Not yet specified is non-empty), so that I am asked whether the
    destination is reached.
    Terminal: this line moves here from the chip. Desktop: the same.
39. As a person with several Maps, I want the switcher in the card, so that I can change the Active
    map from the band.
    Terminal: unchanged. Desktop: unchanged.
40. As a person whose Feature names a Map that no longer exists, I want a quiet "Map not found" line,
    so that a stale link does not hide silently.
    Terminal: unchanged. Desktop: unchanged.

### Pane

41. As a person opening `/craftory`, I want the pane to start with the Feature: a mono kicker
    (`Craftory · spec #42`, or `Craftory` before a spec exists), its title, and a progress line
    (`3 of 7 phases done · Build running, 2 agents`), so that the pane opens on where the Feature
    stands.
    Terminal: three text lines. Desktop: mono caption kicker, heading title, ink-2 progress line.
42. As a person, I want a gear and a close at the top right of the pane header, so that I can jump
    to Settings or close the pane without hunting for it.
    Terminal: two one-glyph Buttons. Desktop: the same, drawn as glyphs.
43. As a person with no Feature in flight, I want the pane header to say so and point at
    `/grill-with-docs`, so that an empty pane still tells me what to do.
    Terminal: text. Desktop: the same.
44. As a person, I want the plugin status line in the Settings tab header, not at the top of every
    tab, so that the top of the pane is about the Feature.
    Terminal: line moves. Desktop: the same.
45. As a person on Desktop, I want the selected tab drawn as a raised tab on a fill strip with its
    label in ink, and unselected tabs with no fill, so that the tabs read as tabs whatever Desktop
    does to button text.
    Terminal: bold selected tab as now. Desktop: tab state carried by the Box (fill, border), the
    count as a `Text` sibling outside the Button.
46. As a person, I want the Flow tab as a vertical timeline: a state mark per phase joined by a line,
    then the label, its command in mono, and its one-line result, so that the seven phases read top
    to bottom like the board.
    Terminal: glyph per phase with a `│` joining line between rows. Desktop: the numbered dot of
    story 10 with a thin vertical bar between dots.
47. As a person, I want the Flow tab's per-phase buttons kept under their phase, so that I can still
    act on a phase from the pane.
    Terminal: unchanged. Desktop: unchanged.
48. As a person on mobile or VS Code, I want the Flow tab to keep heading with the rail and the map
    chip, so that I still see the path there.
    No change beyond what the rail stories give for free.
49. As a person, I want the Tickets map card's header to hold the Map source kicker and the map
    switcher on one row, so that I change Maps where I read which Map I am on.
    Terminal: one wrapped row. Desktop: one row.
50. As a person, I want each Tickets map card row to show its Decision ticket type in mono, so that
    the Tickets tab and the frontier card agree.
    Terminal: text. Desktop: mono `Text`.

### Cross-cutting

51. As a person with ASCII glyphs on, I want every new mark (dot fallback, `›`, `│`, `×`, type text)
    to have an ASCII form, so that the band stays one cell per glyph.
    Terminal: ASCII forms. Desktop: not applicable where `Svg` draws the mark.
52. As a person in light and dark mode, I want every new colour from the design tokens, so that the
    band matches the board in both.
    Terminal: tone rules unchanged. Desktop: light and dark tokens.
53. As a person on Desktop, I want no colour that matters placed inside a Button, so that nothing the
    design colours turns white.
    Terminal: not applicable. Desktop: enforced on every band and pane control.

## Implementation Decisions

- **Theme**: add an `agent` triple (light `#5B3A99 / #F3EEFB / #D9CCF0`, dark `#C3A8F5 / #2C2147 /
#463470`, copied from session-activity's tokens) and an `agent` role that `paint` answers. The map
  chip, frontier kicker and type badges use it.
- **Map view module**: the chip text helper returns `name · n decided · n open` (and `Closed` after
  the counts when closed); a compact form `n✓ n?` serves the summary. Route status moves to a helper
  the frontier card and the Tickets tab share. Each Takeable row carries its ticket type, already
  present on the Decision ticket.
- **Fit rule** (card model): takes the surface's kind. On a rich surface the rail mode is always
  `row` with wrap; the summary comes only from the person's layout choice. On the terminal the
  rule stays cell-based with the new chip width. The wrapped rail reports how many lines it takes
  so the card's density rule (roomy, compact) counts them.
- **Chip pattern** (new small shared piece in the UI helpers): one way to draw a tinted, pressable
  chip on a rich surface: a keyed Box holding the look (border, fill, hover, `Svg`, coloured
  `Text`), with a plain Button inside carrying the press and a neutral label. On the terminal it
  draws a coloured glyph plus a plain Button label, as now. The map chip, phase steps, title pill,
  summary chip, Inbox and tabs all use it, so decision 1 lives in one place.
- **Phase marker**: on rich surfaces a new `Svg` dot per state (number, check, spinner ring, state
  glyph), built in the icons module next to the existing phase icons. The terminal keeps glyphs.
- **Rail**: order changes to Inbox, map chip, title, phases, gear. On rich surfaces the rail
  container drops its border and fill. Connectors on rich surfaces become a short bar.
- **Summary**: map chip (compact counts), `›`, then the chip pattern with the title as the Button
  label and the phase name and count as `Text` siblings.
- **Card**: close becomes a one-glyph `×` Button on rich surfaces; order and chips audited against
  the board; Agents status pills drawn as Boxes with `Text`.
- **Frontier card**: framed section (rich) or heading (terminal) for the Frontier rows, type badge
  per row, then Work next ticket (primary) and Open map. Work next ticket dispatches the same
  wayfinder action the Tickets tab uses; Open map opens the Map's location as the Tickets tab's link
  does.
- **Pane**: a header block (kicker, title, progress line, gear, close) replaces the bold "Craftory"
  and plugin line; the plugin line moves to the Settings tab header. Tabs use the chip pattern. The
  Flow tab rows gain a joining line (glyph `│` on the terminal, a thin bar on rich surfaces) and the
  rich dot. The Tickets map card header puts the kicker and the switcher on one row.
- **Glossary**: the spec uses Rail, Band, Card, Pane, Map, Active map, Frontier, Takeable and
  Decision ticket as `GLOSSARY.md` defines them. No new term is needed.

## Testing Decisions

- A good test mounts the band or the pane through the engine and checks what the drawn tree holds:
  keys, text, the order of elements, which element types appear (`Svg` only off the terminal), and
  the props that carry the look (a Box's border, fill and colour; no `color` on any `Text` inside a
  Button on Desktop). It never reaches into component internals.
- **Main seam**: the existing harness that mounts the band and the pane per surface, looped over
  the terminal and Desktop (`BAND_SURFACES`), in light and dark where colour matters. Prior art:
  the band notice tests and the map rail tests, which already loop surfaces and tones and find
  elements by key.
- **Helper seam**: plain-data tests on the pure helpers (map chip text and compact form, route
  status text, the fit rule per surface kind and column count, the dot choice per phase state).
  Prior art: the map view, card and rail view tests.
- One guard test walks every band and pane tree on Desktop and fails if any `Text` inside a
  `Button` carries a `color`, so decision 1 cannot regress.
- Width cases to cover: the terminal at 115 columns with a Map and a long Feature title (row, not
  summary); the terminal at 60 columns (summary); Desktop at 85 body columns (row, wrapped).
- Tests run on the CI-pinned Claude Code, as the repo's checks require.
- Each ticket's done also needs a live look on Desktop and the terminal, per the repo's practice of
  verifying mods on both surfaces; the harness cannot show paint.

## Out of Scope

- Settings, Worktrees and Glossary tab internals (beyond moving the plugin line into the Settings
  tab header).
- Toasts.
- The mobile layout beyond what the rail changes give it for free.
- A popover card: the card stays in the band above the rail.
- Exact pixel heights (the board's 36 px steps against Desktop's ~44 px): Desktop sets them.
- Blue phase labels for Running and Up next on Desktop: Desktop drops colour inside a Button, so
  the blue moves to the dot.

## Further Notes

- The analysis's probe ran on Claude Code 2.1.317 (Desktop) and 2.1.311 (terminal). If a later
  Claude Code keeps colour inside Desktop Buttons, the chip pattern is the one place to change.
- The design canvas is at https://claude.ai/artifact/4DU8JVRxfgtaKVKQcVkrbw (owner access); the
  boards in the repo are a copy and do not run on their own.
