# Equal tracker support

Type: grilling
Status: resolved

## Question

Which trackers does map support cover?

## Answer

Local, GitHub and GitLab get equal treatment: one reader each behind a shared model (map, tickets with type, state open/claimed/resolved, blockers). Local reads `.scratch/<effort>/map.md` and `issues/NN-*.md`. GitHub uses the `wayfinder:map` label, sub-issues and native dependencies, falling back to a task list and a `Blocked by:` line. GitLab uses the label, `Part of #<map>` and native blocking links (Premium), falling back to `Blocked by:`. Other trackers show links only.
