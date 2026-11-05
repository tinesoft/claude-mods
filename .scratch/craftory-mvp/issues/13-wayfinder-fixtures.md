# Wayfinder fixtures

Type: grilling
Status: resolved

## Question

Which fixtures does the mod ship for Local, GitHub and GitLab maps, pinned to mattpocock-skills 1.3.x: what map shapes and states each covers (takeable, claimed, blocked, decided, stale link, no open tickets, native-links-missing fallback), where they live, and how the tests and the end-to-end run read them?

## Answer

Fixtures are real files compiled to a generated TS module, pinned to mattpocock-skills 1.3.x, one set serving the range.

- **Provenance**: Local is a trimmed snapshot of a real wayfinder tree (such as `.scratch/craftory-mvp`). GitHub and GitLab are captured once from sandbox repos, then hand-edited to reach rare states. Each file's header comment says "captured" or "hand-made". Hand-made GitLab output is checked against the `glab` docs and again in the manual release client check.
- **Scenarios**, per Map source: one `mixed` Map (2 takeable, 1 claimed with an assignee, 1 blocked, 2 decided, Not yet specified non-empty) plus small fixtures: `route-clear`, `closed-map`, `stale-link`, `prose-trap` (state never read from prose, per the evidence rules). GitHub and GitLab add `no-native-links` (task list or `Part of #<map>`, `Blocked by:` line). Local has no such variant; its claim is `Status: claimed`.
- **Location and form**: source files under `mods/craftory/tests/fixtures/wayfinder/1.3/<tracker>/<scenario>/` (Local as a `.scratch` tree, GitHub and GitLab as `.json` stdout). `tools/vendor-craftory-templates.mjs` is extended to generate `tests/wayfinder-fixtures.ts`; `validate` drift-checks it. One loader turns a scenario into the `ReadResult[]` the readers take.
- **Pinning**: a range bump to 1.4 adds a sibling `1.4/` set, runs tests and the end-to-end run over both, and drops `1.3/` once the supported range moves. The README states the tested range.
- **Use**: unit tests feed each scenario to its reader and assert the card model. The one end-to-end run reuses the Local `mixed` fixture in a fake filesystem with a stubbed `/wayfinder` that claims and resolves a ticket, and asserts the rail and Tickets tab update. GitHub and GitLab have canned CLI output only; a live check on a sandbox repo happens in the manual release check.
- **Side note**: no wayfinder Map reader exists yet, and GitLab is links-only today (`src/tracker/links.ts`). The fixtures define what those readers must satisfy.
