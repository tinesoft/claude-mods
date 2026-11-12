#!/usr/bin/env python3
"""Drive Claude Code through a pty, play a scripted tour, and write an asciicast (v2).

  record.py --cwd DIR --plugin-dir DIR --tour tour.json --out out.cast
  record.py --cwd DIR --plugin-dir DIR --tour tour.json --probe     # print the screen after each step

Needs python3-pyte. Render the cast with render.sh. See ../references/tour-format.md.
"""
import argparse
import fcntl
import json
import os
import pty
import select
import struct
import sys
import termios
import time

import pyte

KEYS = {
    "Enter": "\r", "Esc": "\x1b", "Tab": "\t", "Space": " ", "Backspace": "\x7f",
    "Up": "\x1b[A", "Down": "\x1b[B", "Right": "\x1b[C", "Left": "\x1b[D",
    "PageUp": "\x1b[5~", "PageDown": "\x1b[6~", "Home": "\x1b[H", "End": "\x1b[F",
    "Ctrl-C": "\x03", "Ctrl-D": "\x04",
}
TYPE_DELAY = 0.07  # seconds between typed characters, so the cast reads as typing


def pieces(keys):
    """Split 'text{Enter}' into typed characters and whole key sequences."""
    out, i = [], 0
    while i < len(keys):
        end = keys.find("}", i) if keys[i] == "{" else -1
        if end != -1 and keys[i + 1 : end] in KEYS:
            out.append((KEYS[keys[i + 1 : end]], True))
            i = end + 1
        else:
            out.append((keys[i], False))
            i += 1
    return out


class Session:
    def __init__(self, cwd, plugin_dir, cols, rows, extra_args):
        self.screen = pyte.Screen(cols, rows)
        self.stream = pyte.ByteStream(self.screen)
        self.events, self.t0 = [], time.time()
        pid, self.fd = pty.fork()
        if pid == 0:
            os.chdir(cwd)
            # A session started from inside Claude Code inherits markers that change its behaviour.
            for k in [k for k in os.environ if k.startswith("CLAUDE")]:
                del os.environ[k]
            os.environ.update(TERM="xterm-256color", COLORTERM="truecolor")
            # Pin the renderer: a user's own "tui" setting would change the layout of every recording.
            settings = json.dumps({"tui": "default"})
            os.execvp("claude", ["claude", "--plugin-dir", plugin_dir, "--settings", settings, *extra_args])
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def pump(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            if select.select([self.fd], [], [], 0.05)[0]:
                try:
                    data = os.read(self.fd, 65536)
                except OSError:
                    return
                self.events.append((time.time() - self.t0, data.decode("utf-8", "replace")))
                self.stream.feed(data)

    def send(self, keys):
        for text, whole in pieces(keys):
            os.write(self.fd, text.encode())
            if not whole and len(keys) > 1:
                self.pump(TYPE_DELAY)

    def text(self):
        return "\n".join(line.rstrip() for line in self.screen.display)

    def quit(self):
        os.write(self.fd, b"\x03\x03")
        self.pump(1.5)
        os.close(self.fd)


def answer_trust_prompt(args):
    """Accept the one-off 'trust this folder' prompt in a throwaway session, outside the recording."""
    s = Session(args.cwd, args.plugin_dir, args.cols, args.rows, args.claude_arg)
    s.pump(4)
    if "trust this folder" in s.text():
        s.send("{Down}")
        s.pump(1)
        s.send("{Enter}")
        s.pump(4)
    s.quit()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--cwd", required=True, help="the demo workspace Claude Code starts in")
    p.add_argument("--plugin-dir", required=True, help="the mod to load, passed to --plugin-dir")
    p.add_argument("--tour", required=True, help="tour JSON, see references/tour-format.md")
    p.add_argument("--out", help="asciicast to write")
    p.add_argument("--probe", action="store_true", help="print the screen after each step, record nothing")
    p.add_argument("--claude-arg", action="append", default=[], help="extra argument for claude")
    args = p.parse_args()
    if not args.probe and not args.out:
        p.error("--out is required unless --probe")
    with open(args.tour) as f:
        tour = json.load(f)
    args.cols, args.rows = tour.get("cols", 110), tour.get("rows", 30)

    answer_trust_prompt(args)
    s = Session(args.cwd, args.plugin_dir, args.cols, args.rows, args.claude_arg)
    for step in tour["steps"]:
        s.send(step.get("keys", ""))
        s.pump(step.get("wait", 2.0))
        if args.probe:
            print(f"--- {step.get('keys', '')!r} (+{step.get('wait', 2.0)}s)\n{s.text()}")
    recorded = list(s.events)  # leave the exit out of the recording
    s.quit()
    if args.out:
        with open(args.out, "w") as f:
            header = {"version": 2, "width": args.cols, "height": args.rows, "env": {"TERM": "xterm-256color"}}
            f.write(json.dumps(header) + "\n")
            for t, data in recorded:
                f.write(json.dumps([round(t, 3), "o", data]) + "\n")
        print(f"wrote {args.out} ({recorded[-1][0]:.1f}s)", file=sys.stderr)


if __name__ == "__main__":
    main()
