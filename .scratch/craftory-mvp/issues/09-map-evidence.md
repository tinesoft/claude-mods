# Evidence rules for a map

Type: grilling
Status: resolved

## Question

How does the mod derive a map's state (decided, open, claimed, blocked, destination reached) from each tracker's facts without trusting skill text, and what makes a Feature's `map` link valid or stale?

## Answer

The mod derives map state from tracker structure only; it never reads skill prose (`## Answer`, Decisions so far) to decide state.

- **Tickets**: only a map's structural children (Local: `issues/NN-*.md` with a `Type:` line; GitHub/GitLab: sub-issues or linked children, falling back to a task list or `Part of #<map>` only when native links are missing). Mentions in prose never count.
- **State**: decided = `Status: resolved` or a closed issue (whatever the labels say); claimed = open with an assignee, or `Status: claimed`; blocked = an unresolved blocker, native links first, else a `Blocked by:` line. Frontier = open, unblocked, unclaimed.
- **Destination**: no "reached" state. The mod shows only the mechanical fact "No open tickets" (card: "Route clear?", with a hint when Not yet specified is non-empty). The user closes the map (closes the issue / sets `Status: resolved`).
- **Feature `map` link**: valid (resolves to a map-shaped item) is used as is; unknown (tracker unreachable) is kept with no warning; stale (missing, not map-shaped) shows a quiet "Map not found" line, the chip falls back to the active-map rule, and the stored link is never rewritten. A closed map still shows its tickets, labelled "Closed".
- **Counts**: the chip's open count includes claimed tickets (decided + open = total). The card lists takeable tickets first, then claimed ones with the assignee. No stale-claim detection; the user releases a claim in the tracker.
