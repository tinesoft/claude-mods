# Parent rail layout

Type: prototype
Status: resolved

## Question

How do the parent rail (decided/open counts, frontier) and the child Feature rails stack above the prompt, especially in a narrow terminal and on mobile, next to the existing summary chip, phase strip and detail card?

## Answer

The parent is one chip (`Billing v2 · 3 decided · 2 open`) inside the existing single-row rail, between Triage and the seven phases. Pressing it opens a frontier card above the rail, the same pattern as the phase detail cards: destination, the takeable decision tickets, **Work next ticket** and **Open map**. It replaces any open phase card. Under about 60 columns the chip leads the collapsed summary (`Billing v2 3✓ 2? › Export invoices · Build 2/5`). On mobile the Flow tab heads with the chip, then the scrolling rail. Rejected: a stacked always-visible parent row (costs a row, up to 4 in narrow terminals) and a read-only chip (frontier only in the pane).

Prototype: `.scratch/craftory-mvp/prototypes/04-rail-layout.txt`. Mockups: Wayfinder, States and Mobile boards of the Craftory design canvas.
