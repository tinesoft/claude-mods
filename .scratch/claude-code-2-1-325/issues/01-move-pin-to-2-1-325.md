# 01: Move the pinned Claude Code from 2.1.302 to 2.1.325

**What to build:** Move the pin to 2.1.325 for both mods and the mod kit, following CONTRIBUTING.md's "Updating the pinned Claude Code version", and fix what the new types and engine break. Deferred from the Craftory `1.0.0` sign-off so the release isn't held up by an API migration. Craftory 1.0.0 ships on 2.1.302; do not merge this into `develop` ahead of it unless the owner decides 1.0.0 ships on the new pin (then ticket 11 in `craftory-automations-hooks` needs a live recheck).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

Decisions (grilled 2026-11-14): target 2.1.325, falling back to 2.1.323 only if 2.1.325 breaks something 2.1.323 didn't. The mods keep their stated floor, so permission-result handling must cope with both the old and new answer shapes. Only the "tested with" lines change; the floor wording stays, except the mismatch below.

- [x] Rerun the trial on 2.1.325 first (see below); note any breakage beyond the 2.1.323 list
- [x] `tools/claude-code-types/2.1.325/index.d.ts` added, `2.1.302` removed
- [x] Pin updated: `CLAUDE_CODE_VERSION` in `ci.yml` and `release.yml`, the `tsconfig.json` `include` of both mods **and `libs/mod-kit`**, the `version` default in both `tests/harness.ts`, the READMEs' "Tested with" lines, root `README.md`, `CLAUDE.md`, `CONTRIBUTING.md` (the `npm install -g` line)
- [x] The floor mismatch is settled: root `README.md` says "2.1.287 or later", both mod READMEs say "2.1.299 or later". Confirm which is right from the types and make them agree. Otherwise leave the floors alone
- [x] Permission-result handling in session-activity works on the old and new shapes, with the new behaviour tested on the pin
- [x] `pnpm nx run-many -t lint typecheck validate test` passes on 2.1.325
- [x] `claude plugin validate . --strict` passes at the root
- [x] `node tools/sync-kit.mjs --check` and `node tools/sync-plugin-version.mjs --check` pass

Out of scope (ticket 02): re-checking the doc claims tied to 2.1.302, and the VS Code band tests.

## Getting the snapshot

Claude Code writes `.claude-plugin/types/claude-code/index.d.ts` only in an interactive session that loads the mod. `claude plugin validate` and `claude -p` don't write it. This worked from the devcontainer:

```sh
(sleep 20; printf '\003\003') | timeout 40 script -qec "claude --plugin-dir mods/craftory" /dev/null >/dev/null 2>&1
head -1 mods/craftory/.claude-plugin/types/claude-code/index.d.ts   # must say 2.1.325
```

Then copy that file to `tools/claude-code-types/2.1.325/index.d.ts`. `.claude-plugin/types/` is git-ignored; do not commit it. Never edit the snapshot.

## What broke in a trial run on 2.1.323 (2026-11-13)

Pin moved, nothing else changed:

- **craftory typecheck (14 errors):**
  - `hooks/register.tsx` (~356-478): the `Edit`/`Write` tool-call hook fields are now `unknown`, and the shared `guard` handler no longer fits the `Edit`/`Write` overloads.
  - The site context now requires `isCollapsed`: `tests/band.test.ts`, `handoff.test.ts`, `harness.ts`, `rail.test.ts`, `retro-on-pr.test.ts`.
- **session-activity typecheck (4 errors):** the same `isCollapsed` gap in `tests/band.test.ts` and `tests/harness.ts`.
- **craftory tests (2 fail):** "another mod's row stays in its own row above the notice" and "another mod's row is drawn in its own row above the rail". The band layout changed.
- **session-activity tests (4 fail):** "the band keeps another mod content first" (looks like the same band change), and three permission-result behaviours: "an asked call that runs ends as approved, not pending", "every observed event reaches the caller exactly as the engine answered it", "an asked call that never ran shows a denied toast".
- **`validate --strict`:** fails for both mods. Warnings not yet read.
