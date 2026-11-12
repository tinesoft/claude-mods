# Craftory demo

A throwaway sample repo ("Invoicely") for taking README screenshots of Craftory. It is not part of the mod and is never published.

```sh
node mods/craftory/demo/setup.mjs --run   # rebuild the workspace, then start Claude Code in it
node mods/craftory/demo/setup.mjs         # rebuild only
```

`setup.mjs` copies `template/` to `demo/.workspace/` (git-ignored), runs `git init`, puts the repo on `feat/csv-export`, adds two real worktrees, and writes `.craftory/features/csv-export.json` with timestamps relative to now. Run it again before each session to reset. It needs the `mattpocock-skills` 1.3.x plugin installed, as Craftory itself does.

## What the workspace shows

| Where                         | State                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Feature `csv-export`          | Align, Spec and Tickets done; Build running with 2 of 5 tickets resolved and 2 live agents |
| `.scratch/bug-reports/`       | 3 `needs-triage` bugs, so the Inbox reads `Triage 3`                                       |
| `.scratch/billing-v2/`        | A wayfinder map: 2 decided, 1 claimed, 1 takeable, 1 blocked, and a non-empty fog list     |
| `docs/agents/`, `GLOSSARY.md` | Present, so no "Set up Craftory" offer                                                     |

## Shot list

Take each in the terminal, in light and dark. Save to `assets/images/craftory/` at the repo root as `<name>-<theme>.png`.

1. **rail**: the idle band above the prompt.
2. **phase-card**: press **Build** to open its card with the Agents list.
3. **map-card**: press the `◆ Billing v2` chip to open the frontier card.
4. **pane-flow**: `/craftory`, Flow tab.
5. **pane-tickets**: Tickets tab, with the map card above the Inbox.
6. **pane-worktrees**: Worktrees tab.
7. **pane-settings**: gear, Settings tab.

If the map chip is missing, attach the map from the Tickets tab.
