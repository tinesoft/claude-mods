---
name: screen-recording
description: Record a mod in action as a GIF for its README, in the Claude Code terminal (from the devcontainer) or the Claude Desktop app (on the Mac host), from a demo repo and a scripted or hand-made tour. Use when a mod needs a screenshot or demo GIF, when a mod's UI changed and its GIF is stale, or when asked to "record", "screenshot" or "demo" a mod.
argument-hint: <mod> [surface=terminal|desktop] [output-format=gif] [captureMode=scripted|handmade]
---

# Screen recording

Records a real Claude session with a mod loaded and renders it. Nothing is faked: the mod draws itself. No prompt is ever sent to Claude, so a recording costs nothing.

## Arguments

- `mod`: the mod's name, a directory under `mods/`. Required.
- `surface`: `terminal` (default) or `desktop`.
- `output-format`: `gif` (default). Also `cast` (the raw asciicast) for `terminal`, or `mp4` for `desktop`.
- `captureMode`: `scripted` (default) or `handmade`, for `desktop` only. `scripted` clicks and types through a tour in the maximized Desktop window while recording. `handmade` converts a recording a person made by hand.

Parse them from the arguments: the first word is the mod, and the rest are `name=value` pairs.

Output paths: `assets/screenshots/<mod>.<format>` for the terminal, `assets/screenshots/<mod>-desktop.<format>` for the Desktop app.

## Where it runs

- `terminal` runs in the devcontainer. It needs `python3-pyte` and `agg`, both installed by `.devcontainer/post-create.sh`. If either is missing, tell the user to rebuild the devcontainer rather than installing them ad hoc.
- `desktop` runs only on the Mac host, from Claude Code in a host terminal. It needs ffmpeg and cliclick (`brew install ffmpeg cliclick`) and the Screen Recording and Accessibility permissions. If you are in the devcontainer, stop and tell the user to run the skill on the host. Read [references/desktop.md](references/desktop.md) before anything else.

## Steps: terminal

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
5. **Check the result**, then commit (see below).

## Steps: desktop

1. **Reset the workspace on the host**: `node mods/<mod>/demo/setup.mjs`. Then ask the user to open a Desktop session on `mods/<mod>/demo/.workspace` with the mod loaded, and to maximize the window.
2. **scripted**:
   1. Probe `mods/<mod>/demo/tour.desktop.json` with `desktop.mjs probe` and read the PNGs.
   2. Set every `"click": null` from them, and re-probe until each step shows what the GIF should.
   3. Run `desktop.mjs scripted`. Do it once with `--appearance light` and once with `--appearance dark` if the README wants both.
3. **handmade**:
   1. Print `desktop.mjs checklist` for the user to follow while they record with Cmd+Shift+5.
   2. Ask for the movie's path, then run `desktop.mjs handmade --input <movie>`.
4. **Check the result**, then commit (see below).

The full commands, tour format and flags are in [references/desktop.md](references/desktop.md).

## Check and commit

Do not report a recording you have not looked at.

- **Terminal**: replay the cast through `pyte` at a few timestamps, or read frames of the GIF.
- **Desktop**: read the probe PNGs, or extract frames with `ffmpeg -ss <t> -i <gif> -frames:v 1 <png>`.

See [references/gotchas.md](references/gotchas.md) for what goes wrong.

Commit the demo repo, tours and recording. Use `docs(<mod>)` for the GIF.

## Side effects to say out loud

- The first terminal run in a new `demo/.workspace` path answers "trust this folder" for that path, which Claude Code remembers in the user's config.
- `desktop` with `--appearance` switches the Mac's system appearance for the length of the run.
- `desktop` scripted takes over the mouse and keyboard while it runs. Tell the user not to touch them.
- The mod is read from disk, so record from the checkout whose code you want shown.

## Limits

- **Terminal**: records in the fullscreen renderer, where a tour can use keys, `{Click:text}` and `{Wheel:...}`. Set `AGG_FONT_SIZE` (default 16) to shrink a wide recording.
- **Desktop**:
  - Clicks are window-relative coordinates found by probing, so a tour only replays on a maximized window of the same size.
  - The Desktop script was written without access to a Mac, so its first run doubles as its test.
- **VS Code and mobile** are not covered.
