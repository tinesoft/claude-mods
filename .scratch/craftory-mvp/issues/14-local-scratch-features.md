# Local features read from .scratch

Type: grilling
Status: open

## Question

How does the Local tracker read the layout the repo's own `docs/agents/issue-tracker.md` describes (`.scratch/<feature>/spec.md` and `issues/NN-*.md`, with `Status:` and `Blocked by:` lines), so a `.scratch` repo needs no import and Craftory never assumes its own flat `docs/issues/<n>-<slug>.md`?

The blocker is identity. Craftory keys everything on `#n`: `record.spec`, `parent`, `blockedBy`, `/implement #44`, agent names, worktree and branch names. `.scratch` ticket numbers restart at `01` inside each feature, so `01` is not unique across features. Decide the ref scheme first; everything else follows from it.

## Context

- This repo is the motivating case: its tracker is `.scratch`, and the flat default hid its own specs until they were imported. See the Inbox fix `db9a844` for the stopgap.
- `parseTrackerDoc` reads only the H1, and `tracker.local.folder` defaults to `docs/issues/` (`mods/craftory/src/config.ts`). Since `e0dc6d5` the doc's `.scratch/` mention is read as `{ kind: 'local', scratch: true }`, and used only to word the `CLAUDE.md` block.
- `planScratchImport` renumbers globally and rewrites `Blocked by:`; it is the only code that maps the two layouts.
- The wayfinder-rail spec (`../craftory-wayfinder-rail/spec.md`, around line 82) already plans a Local reader for `.scratch/<effort>/map.md` and `issues/NN-*.md`. Reuse its model so there is one `.scratch` reader.

## To decide

- The ref scheme: a path-style ref such as `<feature>/01`; a stable global number kept in front matter or a sidecar; or keep the import and only close the Inbox gap. A derived global number is ruled out because it shifts when a feature is added.
- Where each ref appears: record, `parent`, `blockedBy`, commands, branch, worktree and agent names, and the Tickets-tab rows.
- Whether the reader serves both layouts, chosen from the tracker doc, or `.scratch` replaces the flat one.
- What happens to Settings › Import from `.scratch/` and to `planScratchImport`.
- The Local default: `.scratch` or `docs/issues/` (this is the cleanup item in the map).
- Evidence and `bindSpec` for `.scratch` specs, which have no `created` front matter.

## Answer

Open.
