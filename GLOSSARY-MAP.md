# Glossary Map

## Contexts

- [Craftory](./mods/craftory/GLOSSARY.md): the SDLC framework mod that guides a feature from idea to merged PR
- [Session activity](./mods/session-activity/GLOSSARY.md): the mod that shows chips for what activated in a session
- [Mod kit](./libs/mod-kit/GLOSSARY.md): the shared source copied into each mod that needs it

## Relationships

- **Craftory ↔ Session activity**: both are mods on the same Claude Code surfaces and share the terms Mod, Band, Pane and Status line. Each defines them for its own use, so check both before changing a shared one.
- **Mod kit → Craftory, Session activity**: each mod holds a vendored copy of the kit modules it lists; see docs/adr/0001-vendored-mod-kit.md
