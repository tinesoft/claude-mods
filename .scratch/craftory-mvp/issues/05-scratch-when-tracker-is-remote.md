# Local maps when the tracker is GitHub or GitLab

Type: grilling
Status: resolved

## Question

When `docs/agents/issue-tracker.md` says GitHub or GitLab but `.scratch/<effort>/map.md` exists (as in this repo's own wayfinder use), does the mod read the Local map too, prefer the configured tracker, or ask? How does the rail say which source a map came from?

## Answer

Read both. The configured tracker is primary; Local maps are found by scanning `.scratch/*/map.md` for the Map shape (a `## Destination` heading). No prompt. The source is named only in the frontier card's kicker (`Wayfinder · Local · .scratch/craftory-mvp`, `Wayfinder · GitHub · #12`), and the pane's Tickets tab header repeats it; the chip is unchanged. One chip shows the active map: the one the active Feature names through its `map` ref (which may point at either source), else the most recently updated open map, with a switcher in the card when several exist. Rejected: reading only the configured tracker (hides real maps, so the chip lies), asking every time, a source glyph on the chip (width on narrow bands), and one chip per map (row grows).
