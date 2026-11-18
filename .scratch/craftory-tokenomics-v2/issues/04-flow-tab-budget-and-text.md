# 04: The active Feature's budget in the Flow tab

**What to build:** The Flow tab gains a "Budget" row for the active Feature: its spend `of` its budget, and an **Edit** field that writes the Feature's own `budgets.usd` on its record (a whole number of dollars; empty or `0` clears it). For a draft it shows the default and "set once the spec binds".

**Blocked by:** 01

**Status:** resolved

- [x] Flow tab Budget row on the terminal, Desktop and mobile (read-only on mobile)
- [x] Edit writes `budgets.usd` on the record; empty or `0` clears it; invalid input is refused with a line
- [x] A draft shows the default and the note
- [x] Fake-world pane tests
