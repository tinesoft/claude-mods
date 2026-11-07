# 03: Edge-case states: route clear, closed map, prose-trap

**What to build:** The map surfaces handle the awkward states honestly. When no ticket is open the card shows "No open tickets · Route clear?" instead of a "destination reached" state, with a hint when Not yet specified is non-empty, and the user closes the map themselves. A closed map still shows its tickets, labelled "Closed". A ticket that quotes another ticket in prose (`## Answer`, Decisions so far, comments) never changes the counts. Adds the Local scenarios `route-clear`, `closed-map` and `prose-trap`.

**Blocked by:** 01 (Local map in the rail chip)

**Status:** resolved

- [x] "No open tickets · Route clear?" shows on the chip, frontier card and Tickets tab card, with the fog hint when Not yet specified is non-empty
- [x] No stale-claim detection and no destination-reached state
- [x] A closed map is labelled "Closed" and keeps its tickets visible
- [x] `prose-trap` proves state is never read from prose
- [x] Reader tests cover each scenario's state, blockers and claims
