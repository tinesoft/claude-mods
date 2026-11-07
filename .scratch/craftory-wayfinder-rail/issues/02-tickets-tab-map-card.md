# 02: Tickets tab map card with Work next ticket

**What to build:** The pane's Tickets tab opens with a map card above the Inbox and Feature tickets. The header reads `3 decided · 2 open (1 claimed)` beside **Work next ticket**. Groups run Takeable, Claimed (with assignee), Blocked (each row `waits on <ticket name>`), a collapsed Decided, then **Open map**. **Work next ticket** submits `/wayfinder <map>`, and a Takeable row can submit a named ticket to pick out of order. With nothing takeable the button is disabled with the hint "Nothing takeable", while Claimed and Blocked stay visible. Rows link to the tracker issue or file. The card is hidden when there is no map.

**Blocked by:** 01 (Local map in the rail chip)

**Status:** resolved

- [x] Header counts and group order match the `mixed` scenario
- [x] Work next ticket submits `/wayfinder <map>`; a Takeable row submits its named ticket
- [x] Disabled with "Nothing takeable" when the frontier is empty; Claimed and Blocked still shown
- [x] Rows link to the issue or file
- [x] The mod never edits a map or ticket
- [x] Tests assert the rendered card and the submitted command in the fake world
