# Local features read from .scratch

Type: grilling
Status: resolved

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

Craftory reads the layout Matt's Local template documents, in place, and nothing else.

- **Layout.** `.scratch/<feature>/spec.md` and `.scratch/<feature>/issues/NN-*.md`, with `Status:` and `Blocked by:` lines. This is the only Local layout. The flat `docs/issues/<n>-<slug>.md` reader, the `tracker.local.folder` setting and its Settings field go; there are no users to migrate.
- **Refs are paths.** A spec's ref is its feature folder (`csv-export`); a ticket's is `csv-export/01`. They are the display form and the key. Where a `/` is not allowed they become `-`: feature record `.craftory/features/csv-export.json`, ticket branch `craftory/csv-export-01-<title>`, worktree `.claude/worktrees/csv-export-01-<title>`, agent `craftory-csv-export-01-<title>`. The integration branch stays derived from the title. Rejected: a derived global number (shifts when a feature is added), a sidecar of assigned numbers (merge conflicts across branches), writing a number into the user's files (Craftory never edits tickets, ticket 02), and keeping the import.
- **Skills get paths.** Craftory passes the file path (`.scratch/csv-export/issues/01-button.md`, `.scratch/csv-export/spec.md`) as the skill argument, the form Matt's Local template and `to-tickets` accept. The ref is never passed.
- **Template.** Setup vendors Matt's `issue-tracker-local` doc byte for byte, like the GitHub and GitLab docs, with a drift test. The Craftory-specific template goes.
- **Import.** `planScratchImport`, the Settings › Tracker offer, their tests and the README paragraph go. The Tickets-tab Inbox offer to start a feature from a spec with no feature stays.
- **Binding.** A `.scratch` spec binds to a draft by file mtime, the fallback the flat reader already used.
- **Defaults I chose, to confirm when building.** `Blocked by: 01` resolves inside the same feature and `Blocked by: other/02` across features. A folder with `map.md` is a Map, one with `spec.md` is a Feature, and one with both is read as both.
- **Wording.** The doc-driven `scratch` flag on the tracker setup (`e0dc6d5`) becomes the only Local layout and is removed with the flat one.

Plan and design updated: `docs/design/craftory/plan.md` (decision 12, the file map, the owned-files table, the evidence table) and `DESIGN.md` (Tickets tab header). Execution (reader, removals, tests, README) is in the fog below.
