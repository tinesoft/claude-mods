---
name: screen-recording
description: Record a mod in action in the Claude Code terminal as a GIF (or raw asciicast) for its README, from a demo repo and a scripted tour. Use when a mod needs a screenshot or demo GIF, when a mod's UI changed and its GIF is stale, or when asked to "record", "screenshot" or "demo" a mod.
argument-hint: <mod> [output-format=gif]
---

# Screen recording

Records a real Claude Code session with a mod loaded, driven by scripted keystrokes, and renders it. Nothing is faked: the mod draws in a real pty. No prompt is ever sent to Claude, so a recording costs nothing.

## Arguments

- `mod`: the mod's name, a directory under `mods/`. Required.
- `output-format`: `gif` (default) or `cast`. `gif` writes `assets/screenshots/<mod>.gif`. `cast` writes `assets/screenshots/<mod>.cast`, the raw asciicast, for re-rendering later.

Parse them from the arguments: the first word is the mod, and `output-format=<value>` or a bare `gif`/`cast` sets the format.

## Needs

`python3-pyte` and `agg`, both installed by `.devcontainer/post-create.sh`. If either is missing, tell the user to rebuild the devcontainer rather than installing them ad hoc.

## Steps

1. **Find the demo repo** at `mods/<mod>/demo/`. It holds a `setup.mjs` that builds `demo/.workspace/` (git-ignored) and a `tour.json`. If it does not exist, build it first: read [references/demo-repo.md](references/demo-repo.md). The demo repo is the real work. A tour is only as good as the state it shows.
2. **Reset the workspace**: `node mods/<mod>/demo/setup.mjs`.
3. **Probe the tour** and read the printed screens, so you know the keys do what you expect before recording:
   ```sh
   python3 .claude/skills/screen-recording/scripts/record.py \
     --cwd mods/<mod>/demo/.workspace --plugin-dir mods/<mod> \
     --tour mods/<mod>/demo/tour.json --probe
   ```
   Fix the tour, not the mod, until each step shows what the GIF should. Tour format: [references/tour-format.md](references/tour-format.md).
4. **Record**, then **render**:
   ```sh
   python3 .claude/skills/screen-recording/scripts/record.py \
     --cwd mods/<mod>/demo/.workspace --plugin-dir mods/<mod> \
     --tour mods/<mod>/demo/tour.json --out "$TMPDIR/<mod>.cast"
   .claude/skills/screen-recording/scripts/render.sh "$TMPDIR/<mod>.cast" assets/screenshots/<mod>.gif
   ```
   For `cast`, render to `assets/screenshots/<mod>.cast`.
5. **Check the result.** Replay the cast through `pyte` at a few timestamps and read the screens, or read frames of the GIF. Do not report a recording you have not looked at. See [references/gotchas.md](references/gotchas.md) for what goes wrong.
6. **Commit** the demo repo, tour and recording. Use `docs(<mod>)` for the GIF.

## Side effects to say out loud

- The first run in a new `demo/.workspace` path answers "trust this folder" for that path, which Claude Code remembers in the user's config. Say so in your report.
- The mod under `--plugin-dir` is read from disk, so record from the checkout whose code you want shown.

## Limits

Only the terminal is covered. The Desktop app, VS Code and mobile need a human with a screen recorder. Records in the fullscreen renderer, where a tour can use keys, `{Click:text}` and `{Wheel:...}`. Set `AGG_FONT_SIZE` (default 16) to shrink a wide recording.
