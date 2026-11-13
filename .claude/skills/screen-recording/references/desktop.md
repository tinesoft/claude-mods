# Recording the Claude Desktop app

The Desktop app is a macOS GUI, so this runs on the Mac host, never in the devcontainer: `scripts/desktop.mjs` refuses anywhere else. Run the skill from Claude Code in a host terminal, not from the Desktop app itself. A scripted tour clicks and types into the front Claude window, and that must not be the session doing the recording.

None of this was tried on a Mac when it was written. The first run is a test: check each part and fix the script where it is wrong.

## One-off setup on the Mac

- `brew install ffmpeg cliclick`. ffmpeg (and its ffprobe) converts the recording, and cliclick clicks and types for a scripted tour.
- System Settings › Privacy & Security: give the terminal app that runs Claude Code **Screen Recording** (for `screencapture`) and **Accessibility** (for the window bounds through System Events, and for cliclick). Restart the terminal after granting.
- Node on the host, for `desktop.mjs` and the demo's `setup.mjs`.

## Before each recording

1. Run `node mods/<mod>/demo/setup.mjs` **on the host**. A workspace built in the devcontainer stores `/workspaces/...` paths in its git worktrees, and those do not exist on the Mac.
2. Load the mod in the Desktop app from this checkout, the way you do for a live check, and open a session on `mods/<mod>/demo/.workspace`.
3. Start from a fresh session: every probe or recording adds a `/craftory` message to the transcript, and a leftover card, pane, survey prompt or typed text shows in the next one. Keep the terminal that runs the script off the main display, or it covers the Claude window.
4. Maximize the Claude window on the main display. For `scripted`, `--maximize` sets the window to the screen's visible area, and the run stops if the window does not fill it.
5. Close other notifications and hide the Dock if it overlaps the window.

## captureMode=scripted

The tour is `mods/<mod>/demo/tour.desktop.json`:

```json
{
  "steps": [
    { "wait": 2.5, "note": "the band above the prompt" },
    { "click": ["38%", "86%"], "wait": 3, "note": "the Build phase step" },
    { "click": [412, 655], "wait": 1, "note": "the card's × close" },
    { "keys": "/craftory{Enter}", "wait": 3 }
  ]
}
```

- `click` is window-relative: points from the window's top-left corner, or percentages of its size. Percentages survive a different screen size better, which is why the window must be maximized when the tour runs as it was when the tour was probed.
- `"click": null` marks a target not found yet. `probe` skips it, and `scripted` refuses to run until every one is set.
- `keys` uses the same `{Enter}`, `{Esc}`, `{Tab}`, arrow and page names as the terminal tour. Typed characters are 70 ms apart. The Desktop app ignores a synthetic Enter (and Cmd+Enter), so submit a prompt by clicking its send button, and pick a slash command by clicking its entry in the command list.
- `scroll` turns the mouse wheel at a window-relative point: `{ "scroll": { "at": ["85%", "60%"], "lines": 25 } }`. A positive `lines` scrolls down and a negative one scrolls back up. Scroll down and then up by the same amount to show a long card or tab in full. Content that already fits does not move.
- `note` names the target, for the checklist and for whoever calibrates the tour next.

Calibrate by probing. `desktop.mjs probe --tour <tour> --probe-dir <dir>` plays the tour without recording and saves one window-sized PNG per step (`00-start.png`, `01.png`, …). Read them, find each target's position in points (the PNG is in pixels: divide by the display's scale, 2 on a Retina screen), set the `click`, and probe again until every PNG shows what the GIF should.

Then record:

```sh
node .claude/skills/screen-recording/scripts/desktop.mjs scripted \
  --tour mods/<mod>/demo/tour.desktop.json --out assets/screenshots/<mod>-desktop.gif \
  --appearance light
```

It records the main display with `screencapture -v`, crops to the window and converts with ffmpeg. `screencapture` cannot be stopped early (a signal kills it before it saves the movie), so it records for a generous fixed length and the movie is trimmed to the time the tour really took. Expect to wait a minute after the tour ends, and leave the mouse and keyboard alone until `wrote ...` prints. `--appearance light|dark` switches the macOS appearance for the run and restores it afterwards; this only changes the app if the app follows the system appearance.

## captureMode=handmade

A person records and the script only converts.

1. `desktop.mjs checklist --tour <tour>` prints the tour as numbered steps to follow by hand.
2. Record with Cmd+Shift+5 › **Record Entire Screen**, follow the checklist, and stop from the menu bar. A **Record Selected Portion** recording also works, but cannot be cropped to the window afterwards.
3. Convert, with the Claude window still where it was during the recording:
   ```sh
   node .claude/skills/screen-recording/scripts/desktop.mjs handmade \
     --input ~/Desktop/Screen\ Recording.mov --out assets/screenshots/<mod>-desktop.gif \
     --trim-start 1.5 --trim-end 2
   ```
   A full-screen recording is cropped to the window. Pass `--crop none` to keep the whole frame. `--trim-start` and `--trim-end` cut seconds off either end, to drop the moments spent starting and stopping the recording.

## Output

`assets/screenshots/<mod>-desktop.gif` by default, or `.mp4` (H.264, no audio) for `output-format=mp4`. `--width` (default 1440) and `--fps` (default 12) set the size; a Desktop GIF is much larger than a terminal one, so keep the tour short. session-activity's is 6.3 MB.
