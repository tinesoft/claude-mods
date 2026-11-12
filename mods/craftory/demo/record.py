#!/usr/bin/env python3
"""Drive Claude Code in the demo workspace through a pty and record an asciicast.

  python3 demo/record.py out.cast          record the tour
  python3 demo/record.py --probe           print the screen after each step, record nothing
Render with: agg --font-size 16 out.cast assets/screenshots/craftory.gif
"""
import json, os, pty, select, struct, sys, time, fcntl, termios
import pyte

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.dirname(HERE)
WORKSPACE = os.path.join(HERE, ".workspace")
COLS, ROWS = 110, 30

# Answer the one-off trust prompt for the demo folder; not part of the recording.
PRE = [(3.0, ""), (1.0, "\x1b[B"), (4.0, "\r")]

# (seconds to wait after sending, bytes to send). Text is typed key by key.
TOUR = [
    (2.5, ""),
    (1.0, "/craftory"),
    (0.6, "\r"),
    (3.0, ""),
    (3.0, "2"),
    (3.0, "\x1b[6~"),
    (3.0, "3"),
    (2.0, "4"),
    (3.0, "5"),
    (2.0, "\x1b"),
    (3.0, ""),
]


def main():
    probe = "--probe" in sys.argv
    out = None if probe else sys.argv[1]
    fd = spawn()
    screen = pyte.Screen(COLS, ROWS)
    stream = pyte.ByteStream(screen)
    t0 = time.time()
    events = []
    return run(fd, screen, stream, t0, events, probe, out)


def spawn():
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(WORKSPACE)
        for k in [k for k in os.environ if k.startswith("CLAUDE")]:
            del os.environ[k]
        os.environ.update(TERM="xterm-256color", COLORTERM="truecolor")
        os.execvp("claude", ["claude", "--plugin-dir", MOD])
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
    return fd


def run(fd, screen, stream, t0, events, probe, out):

    def pump(seconds):
        end = time.time() + seconds
        while time.time() < end:
            r, _, _ = select.select([fd], [], [], 0.05)
            if r:
                try:
                    data = os.read(fd, 65536)
                except OSError:
                    return
                events.append((time.time() - t0, data.decode("utf-8", "replace")))
                stream.feed(data)

    def dump(label):
        print(f"--- {label}")
        print("\n".join(line.rstrip() for line in screen.display))

    for wait, keys in PRE:
        os.write(fd, keys.encode())
        pump(wait)
    if probe:
        dump("after trust")
    os.write(fd, b"\x03\x03")
    pump(1.5)
    os.close(fd)
    # Trust is remembered now: start a fresh session so the cast begins from an empty terminal.
    fd = spawn()
    screen.reset()
    events.clear()
    t0 = time.time()
    for wait, keys in TOUR:
        for ch in ([keys] if keys.startswith("\x1b") else keys):
            os.write(fd, ch.encode())
            pump(0.07 if len(keys) > 1 and not keys.startswith("\x1b") else 0)
        pump(wait)
        if probe:
            dump(repr(keys))
    recorded = list(events)
    os.write(fd, b"\x03\x03")
    pump(1)
    events[:] = recorded
    if out:
        with open(out, "w") as f:
            f.write(json.dumps({"version": 2, "width": COLS, "height": ROWS, "env": {"TERM": "xterm-256color"}}) + "\n")
            for t, d in events:
                f.write(json.dumps([round(t, 3), "o", d]) + "\n")


main()
