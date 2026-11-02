# claude-mods

Claude Code mods by [tinesoft](https://github.com/tinesoft), published as one plugin marketplace, `tinesoft-mods`. Each mod is an Nx project under `mods/`.

## Install

Install a mod from the `main` branch, which holds released code only. Without `@main` you track `develop`, which is unreleased.

```sh
claude plugin install <mod-name> --marketplace tinesoft/claude-mods@main
```

> `<mod-name>` = Name of the Mod to install (see below)

Mods need Claude Code 2.1.287 or later. CI tests against 2.1.302.

## Mods

|                                                                                                                                                                                                                                                                      | Mod                                         | What it does                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <picture><source media="(prefers-color-scheme: dark)" srcset="assets/images/session-activity-logo-dark.svg"> <img alt="session-activity — see what took part in your Claude Code session" src="assets/images/session-activity-logo-light.svg" width="128"></picture> | [`session-activity`](mods/session-activity) | A live row of chips above the prompt naming each skill, subagent, MCP server, permission call, hook and rule file that activated, with a card explaining each and a full `/session-activity` pane. Blocked and denied actions come first. |
| <picture><source media="(prefers-color-scheme: dark)" srcset="assets/images/craftory-dark.svg"> <img alt="craftory — an SDLC framework, built on top of Matt Pocock's skills, as a Claude Code mod" src="assets/images/craftory-light.svg" width="128"></picture>    | [`craftory`](mods/craftory)                 | An SDLC framework, built on top of Matt Pocock's skills, as a mod. A phase rail above the prompt walks a feature from idea to merged PR through Align, Spec, Tickets, Build, Review, Ship and Retro, with a full `/craftory` pane.        |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
