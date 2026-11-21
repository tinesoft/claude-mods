# Craftory multi-context glossary

Status: needs-triage

Source: grilling thread on 2026-11-21 ("what next for craftory"), decisions Q1, Q3, Q4, Q5, Q8 and Q9. Lifts the 1.0.0 cut in Decision 19 of `docs/design/craftory/plan.md` and the "Out of scope" line in `.scratch/craftory-mvp/map.md`. Builds on `src/glossary.ts`, `src/drift.ts`, `src/reply.tsx`, `src/agents-md.ts` and the glossary paths in `hooks/shell/repo.ts` and `hooks/shell/settings.ts`.

## Problem Statement

Matt's `domain-modeling` skill supports repos with several **contexts**: a `GLOSSARY-MAP.md` at the root lists one `GLOSSARY.md` per context. Craftory reads only one glossary. Worse, in a multi-context repo it reads the wrong file: `parseDomainDoc` (`src/agents-md.ts:70`) takes the first `- **`<file>`** at the repo root` line of `docs/agents/domain.md`, and in a multi-context repo that line names `GLOSSARY-MAP.md`. Craftory then parses the map as if it were a glossary. The Glossary tab is empty or wrong, term underlining and hover cards find nothing, the drift scan checks no avoid-words, and Settings › Glossary would add terms to the map. This repo, which builds Craftory, is multi-context, so the gap shows up every day.

## Solution

Craftory reads the **glossary map** when one exists and treats each listed context's `GLOSSARY.md` as its own glossary. A repo without a map is one context, exactly as today.

- **Glossary tab.** Every context's terms, grouped under the context's name, with filter chips (All, then one per context). Search spans all of them. **Used in last reply** and the terms added this session are labelled with their context.
- **Settings › Glossary.** List, add, edit and delete work in each context's file, with the same byte-for-byte round-trip as 1.0. **Add term** asks which context. The default is the context whose folder the active Feature's diff touches most, or the first one in the map when there's no diff. The map itself is shown read-only (contexts and relationships).
- **A term in several contexts.** The hover card and the Glossary tab show every definition, each labelled with its context.
- **Drift scan.** A changed file is checked against the avoid-words of the context whose folder holds it. A file outside every context's folder (root docs, `tools/`) is checked against every context's avoid-words.
- **Missing or broken context files.** A context whose `GLOSSARY.md` does not exist shows "No glossary yet". **Add term** there creates the file in Matt's format (title, one-line description from the map, `## Language`). A file that exists but does not parse shows the existing problem line and stays read-only, so Craftory never overwrites it.
- **Language.** The concept is called **Context**, as in Matt's skills. Where Craftory's README and band text mean the model's context, they say **context window**.

## User Stories

1. As a developer in a multi-context repo, I want Craftory to read each context's glossary, not the map, so that the Glossary tab shows real terms.
2. As a developer in a single-context repo, I want nothing to change, so that this ships without changing my day.
3. As a developer, I want terms grouped by context with filter chips, so that I can see one area's language at a time.
4. As a developer, I want search to span every context, so that I find a term without knowing where it lives.
5. As a developer, I want to add, edit and delete a term in any context, so that the editing I have in 1.0 works everywhere.
6. As a developer, I want **Add term** to suggest the context my Feature is working in, so that I usually just confirm.
7. As a developer, I want edits to leave the rest of each file byte for byte as it was, so that Matt's skills and teammates without Craftory read the same file.
8. As a developer, I want the map shown but not editable, so that creating or reshaping contexts stays with `/domain-modeling`.
9. As a developer reading a reply that uses a term defined in two contexts, I want the hover card to show both definitions labelled, so that I see which one applies.
10. As a developer, I want the drift scan to use the avoid-words of the context a file belongs to, so that one mod's avoid-list does not flag another mod's correct usage.
11. As a developer changing a root doc, I want it checked against every context, so that shared docs do not drift.
12. As a developer, I want a context with no glossary file yet shown as "No glossary yet", with **Add term** creating it, so that glossaries are created lazily, as Matt's skill does.
13. As a developer, I want a glossary file that does not parse left untouched and reported, so that Craftory never corrupts it.
14. As a developer, I want a map entry pointing outside the repo, or a malformed map, reported as a problem line and ignored, so that one bad line does not hide the rest.
15. As a developer, I want Settings › Docs to keep the `## Agent skills` block's multi-context line when it saves, so that saving Settings never turns my repo back into single-context.
16. As a reader of the README and the glossary, I want the Glossary section and the **Context** and **Glossary map** entries to describe this, so that the docs match the behaviour.

## Implementation Decisions

- **Find the layout.** `src/agents-md.ts` learns a `multi` docs layout: `GLOSSARY-MAP.md` at the root, as Matt's `domain.md` template describes. `parseDomainDoc` reports which layout `docs/agents/domain.md` names, not just the first file. Whether `GLOSSARY-MAP.md` exists on disk decides it in the end (Matt's rule: "If `GLOSSARY-MAP.md` exists, read it to find contexts"), so a stale `domain.md` cannot hide a map.
- **Parse the map.** A pure `parseGlossaryMap` in a new `src/glossary-map.ts`: `## Contexts` bullet lines `- [Name](./path/GLOSSARY.md): description` and `## Relationships` bullet lines, read-only, round-trip not needed. A context's **folder** is its glossary's directory. Paths are relative to the root. One outside the repo, or a line that does not match, becomes a problem line.
- **One shape for both layouts.** Repo snapshot (`hooks/shell/repo.ts`) holds `contexts: { name, description, path, folder, glossary: Loaded<GlossaryDoc> | 'missing' }[]`. A single-context repo is one context named after the glossary's `# Title`, with folder `.`. Every reader (`glossaryTerms`, reply underline, drift, Settings) goes through it, so nothing branches on layout after loading.
- **Edits.** `addTerm`, `editTerm`, `deleteTerm` in `src/glossary.ts` are unchanged. Settings passes the context's path. Creating a missing file uses a new `newGlossary(name, description)` and then `addTerm`.
- **Default context for Add term.** From the active Feature's integration diff (already read for drift): the context whose folder holds the most changed lines. Ties and no diff → first in the map.
- **Drift.** `findDrift` takes the avoid-words per file. The caller picks the deepest context folder that holds the file, or every context's words when none does.
- **Hover and reply terms.** `src/reply.tsx` matches across all contexts. A name defined in several contexts gives one entry with several labelled definitions.
- **Setup block.** `agents-md.ts:173` writes a "Single-context" line in the `## Agent skills` block. When the repo has a map, Settings writes the multi-context line Matt's setup skill writes instead, and keeps the one already there. Check the setup skill's exact text against the vendored templates before writing it.
- **Personal state.** The selected filter chip is a `$.store` per-repo convenience, like the pane tab.

## Testing Decisions

- **Seam 1: pure helpers.** `parseGlossaryMap` against this repo's `GLOSSARY-MAP.md` and Matt's format example, plus malformed and out-of-repo lines. `parseDomainDoc` on this repo's `docs/agents/domain.md` reports the multi layout. `newGlossary` then `addTerm` gives Matt's format.
- **Seam 2: the hooks in the fake world** (`tests/harness.ts`). A fixture repo with a map and two contexts (one with a missing glossary):
  - the Glossary tab lists both contexts' terms, grouped, and the filter narrows them;
  - add, edit, delete write only the chosen context's file, byte for byte elsewhere;
  - **Add term** on the missing context creates the file;
  - a broken glossary file is reported and never written;
  - drift flags a file under context A only for A's avoid-words, and a root file for both;
  - a reply term in both contexts gives a hover card with two labelled definitions;
  - a Settings save keeps the multi-context line in the `## Agent skills` block.
- **Regression.** The existing single-context glossary, drift and reply tests pass unchanged.
- Run tests on the pinned Claude Code (`CLAUDE_CODE_VERSION` in `.github/workflows/ci.yml`).

## Out of Scope

- Editing `GLOSSARY-MAP.md`: adding, renaming or removing a context, or editing relationships.
- Converting a single-context repo to multi-context, or the reverse.
- Context-scoped ADRs (`<context>/docs/adr/`) in Craftory's UI.
- Editing a context's Relationships or Flagged ambiguities sections (read-only, as in 1.0).

## Further Notes

- Tickets, in vertical slices: (1) layout detection and the map parser, which fixes the wrong-file bug with a read-only Glossary tab grouped by context; (2) editing per context, the Add-term context picker and lazy file creation; (3) drift per context; (4) reply underline and multi-definition hover cards; (5) the setup block's multi-context line; (6) README, the **Context** and **Glossary map** glossary entries, the "context window" wording pass, and closing Decision 19 in the plan. 2–5 are blocked by 1.
- Commit scope is `craftory`. Do not edit versions or `CHANGELOG.md` by hand.
