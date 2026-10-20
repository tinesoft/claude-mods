# claude-mods

Claude Code mods by [tinesoft](https://github.com/tinesoft), published as one plugin marketplace, `tinesoft-mods`. Each mod is an Nx project under `mods/`.

## Install

Add the marketplace from the `main` branch, which holds released code only. Without `@main` you track `develop`, which is unreleased.

```sh
claude plugin marketplace add tinesoft/claude-mods@main
```

Then install a mod from inside Claude Code:

```text
/plugin install <mod-name>@tinesoft-mods
```

> `<mod-name>` = Name of the Mod to install (see below)

Mods need Claude Code 2.1.287 or later. CI tests against 2.1.302.

## Mods

|                                                                                                                                                                                                                                                                      | Mod                                         | What it does                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="assets/images/session-activity-logo-dark.svg"> <img alt="session-activity — see what took part in your Claude Code session" src="assets/images/session-activity-logo-light.svg" width="128"></picture> | [`session-activity`](mods/session-activity) | Chips above the prompt showing the skills, agents, MCP servers, permissions, hooks and rules active in the current session. |

## Development

Requires Node 22 or later, pnpm, and the `claude` CLI on the PATH.

```sh
pnpm install
pnpm nx dev session-activity       # claude --plugin-dir mods/session-activity
pnpm check                         # nx affected -t lint typecheck validate test
```

Targets per mod: `lint`, `typecheck`, `validate` (`claude plugin validate . --strict`), `test` (`claude plugin test`) and `dev`. Claude Code loads `.ts` directly, so there is no build step.

`typecheck` reads the declarations in `tools/claude-code-types/<version>/index.d.ts`, a snapshot of the types Claude Code generates. Refresh the snapshot when the pinned Claude Code version changes.

### Branches and commits

- Branch from `develop` as `feat/...`, `fix/...` or `chore/...`, and open a PR to `develop`.
- Commits follow Conventional Commits. The scope is a project name (`session-activity`) or one of `repo`, `ci`, `deps`, `release`.
- Releases come from `main`. Fast-forward `main` to `develop` with `git push origin develop:main`, never a merge commit, so `main` keeps the same commits `nx release` reads.

### Releases

Each mod versions independently and is tagged `<mod>@<version>`.

- Push to `main`: `release.yml` runs `nx release --skip-publish`, which bumps each mod with releasable commits, updates its changelog, syncs the version into `.claude-plugin/plugin.json` (`tools/sync-plugin-version.mjs`), commits, tags and creates a GitHub Release. It then back-merges `main` into `develop`.
- One mod by hand: run the `Release` workflow with `project` and an optional `specifier` (`patch`, `minor`, `major` or an exact version). The first release of the repository must be run this way with specifier `0.1.0`: until a release tag exists, the automatic run on `main` skips, because nx would tag it `0.1.1`.
- Preview locally: `pnpm nx release --projects=session-activity --dry-run`.

## License

[MIT](LICENSE)
