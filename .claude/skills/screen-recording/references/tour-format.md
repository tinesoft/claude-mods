# Tour format

A tour is a JSON file next to the demo repo, `mods/<mod>/demo/tour.json`.

```json
{
  "cols": 110,
  "rows": 30,
  "steps": [
    { "wait": 2.5 },
    { "keys": "/craftory", "wait": 1.0 },
    { "keys": "{Enter}", "wait": 3.0 },
    { "keys": "{PageDown}", "wait": 3.0 },
    { "keys": "{Esc}", "wait": 3.0 }
  ]
}
```

- `cols`, `rows`: terminal size. Default 110×30. Size the rows to the tallest thing the mod draws plus the prompt; extra rows are blank space in the GIF.
- `steps[].keys`: what to send, optional. Plain characters are typed one at a time, 70 ms apart, so a slash command reads as typing. `{Name}` sends one whole key sequence: `Enter`, `Esc`, `Tab`, `Space`, `Backspace`, `Up`, `Down`, `Left`, `Right`, `PageUp`, `PageDown`, `Home`, `End`, `Ctrl-C`, `Ctrl-D`. Other keys are plain text.
- Mouse, in the fullscreen renderer (which `record.py` pins):
  - `{Click:some text}` clicks the middle of the first place that text appears on the screen, looked up when the step runs. `{Click:some text#2}` takes the second match. Use it for chips, buttons and tabs: it survives layout changes that would move fixed coordinates.
  - `{Click:col,row}` clicks a 1-based cell.
  - `{Wheel:up}` and `{Wheel:down}` scroll one notch. If nothing is found for a `Click` text, the run stops and prints the screen it searched.
  - Never click a button that submits a command (a `[ /implement ... ]` button): it starts a real prompt in the session.
- `steps[].wait`: seconds to keep recording after the keys, default 2. This is how long the viewer sees the result. 2 to 3 seconds per view reads well. Allow more for anything the mod loads slowly.

The first step usually has no keys: it holds the idle band for a moment while Claude Code starts. The recording starts from a fresh, empty terminal and stops before the exit, so the GIF ends on the last step.

## Choosing steps

Show the idle state, then the one command that opens the mod's main surface, then each tab or view in turn, then close it. Keep the whole tour near 30 seconds: a GIF in a README is skimmed, and agg's output grows with every second of change.

Key bindings are mod-specific. Find them by probing (`--probe` prints the screen after each step) or in the mod's source, not by guessing.
