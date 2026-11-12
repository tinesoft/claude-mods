# Gotchas

Each of these cost a failed recording once.

- **Trust prompt.** A new folder asks "trust this folder" before anything draws. `record.py` answers it in a throwaway session first, then starts a second, fresh session to record, so the cast begins from an empty terminal and never shows the prompt. Without the second session the cast opens blank, because only the changes since the prompt are recorded.
- **Inherited environment.** Started from inside Claude Code, a child session inherits `CLAUDE_*` variables and warns "Transcript saving is off". The script removes every variable starting with `CLAUDE` before it starts `claude`.
- **Renderer.** A user's own `tui` setting changes the whole layout (a fullscreen side panel instead of the inline pane). The script passes `--settings '{"tui":"default"}'` so recordings look the same on every machine. Do not remove it.
- **Keys sent as one write.** An escape sequence such as `PageDown` is `\x1b[6~`. Sent a character at a time, the bare `\x1b` closes the pane. The script sends `{Name}` keys whole; keep it that way if you edit it.
- **Mouse clicks do nothing.** SGR mouse reports through the pty are ignored by the classic renderer. Anything that is only reachable by clicking cannot be in the tour. Look for a hotkey, or leave it for a human recording.
- **Stale running agents.** A feature file that says an agent is running is not backed by a live process. Check on the probe that the mod still shows it that way; if it reconciles it away, change the state in `setup.mjs`.
- **Too tall.** Rows beyond what the mod draws are blank space in the GIF. The pane in craftory needs 30; the first attempt at 48 left a third of the GIF empty.
- **Which code is shown.** The mod is loaded from `--plugin-dir` at the time of the run. A recording made from another worktree shows that worktree's code.
- **Checking.** `agg` outputs a GIF only, and reading one shows its first frame. To inspect a moment, replay the cast through `pyte` up to a timestamp and print the screen, or make a one-frame cast whose events all land at `0.001s` and render that.
