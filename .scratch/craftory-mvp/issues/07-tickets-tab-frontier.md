# Frontier in the Tickets tab

Type: prototype
Status: resolved

## Question

What does the pane's Tickets tab show for a Map (frontier list, decided and open counts, claimed tickets, the map switcher from the source decision) and where does **Work next ticket** sit, for Local, GitHub and GitLab maps and when a map has no ready ticket?

## Answer

The Tickets tab opens with a **map card** above the Inbox and the feature tickets. Its kicker names the source (`Wayfinder · Local · .scratch/billing-v2`, `Wayfinder · GitHub · #12`) and holds the map switcher. The header line shows `3 decided · 2 open (1 claimed)` and **Work next ticket**. Below it, groups in order: **Takeable**, **Claimed** (with assignee), **Blocked** (each row says `waits on <ticket name>`), then **Decided (n)** collapsed, and **Open map**.

- **No ready ticket**: **Work next ticket** stays in the header, disabled, hint "Nothing takeable"; the groups still show claimed and blocked.
- **No open tickets**: the card reads "No open tickets · Route clear?" (with the Not-yet-specified hint when that section is non-empty) and **Open map**.
- **No map or a stale link**: the card is hidden, with the quiet "Map not found" line for a stale link.
- Rows link to the tracker issue or file; the mod stays read-only plus submit.

Rejected: sub-tabs (an extra navigation level) and a single flat list (weak frontier emphasis).

Prototype: `.scratch/craftory-mvp/prototypes/07-tickets-tab-frontier.txt`.
