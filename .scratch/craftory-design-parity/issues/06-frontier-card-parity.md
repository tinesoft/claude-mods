# 06: Frontier card matches the board

**What to build:** The frontier card opened from the map chip matches the Wayfinder board. Its kicker names the Map source in the agent colour. Takeable Decision tickets sit in a "Frontier · takeable now" list, one row each with `▸`, the ticket title and its type (Research, Prototype, Grilling, Task): on Desktop a bordered section with a header strip, divided rows and an outlined type badge drawn as a Box with `Text` in the type's colour; on the terminal a heading line and `▸` rows with the type as text after the title. At the foot sit **Work next ticket** (primary) and **Open map**: Work next ticket dispatches the same wayfinder action the Tickets tab uses, and Open map opens the Map's location as the Tickets tab's link does. When nothing is Takeable, Work next ticket gives way to a muted "Nothing takeable" hint. The Map switcher and the quiet "Map not found" line stay.

Spec: [spec.md](../spec.md), stories 33–37, 39 and 40.

**Blocked by:** 01 (the agent role and the route-status line in the card)

**Status:** resolved

- [ ] The kicker uses the agent role on both surfaces.
- [ ] Each Takeable row carries its ticket type; Desktop draws a bordered Frontier section with type badges, the terminal a heading and text types (ASCII forms too).
- [ ] Work next ticket (primary) and Open map are present and act like their Tickets tab counterparts; with nothing Takeable, a muted "Nothing takeable" hint replaces Work next ticket.
- [ ] The switcher and "Map not found" behave as today.
- [ ] Harness tests on the terminal and Desktop cover rows, badges, both buttons and the nothing-takeable case.
- [ ] `pnpm nx affected -t lint typecheck validate test` passes on the CI-pinned Claude Code.
- [ ] Live look on Desktop and the terminal against the Wayfinder board's frontier card.
