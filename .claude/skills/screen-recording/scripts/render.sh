#!/usr/bin/env bash
# Render an asciicast into the requested output format.
#   render.sh <input.cast> <output.gif|output.cast> [agg options...]
# gif  : agg, GitHub-dark theme, 16px font, last frame held for 2s.
# cast : the asciicast itself, copied.
set -euo pipefail

input=${1:?usage: render.sh <input.cast> <output.gif|output.cast> [agg options...]}
output=${2:?usage: render.sh <input.cast> <output.gif|output.cast> [agg options...]}
shift 2

case "$output" in
  *.gif)
    command -v agg >/dev/null || { echo "agg not found; the devcontainer installs it (.devcontainer/post-create.sh)" >&2; exit 1; }
    agg --font-size 16 --theme github-dark --last-frame-duration 2 "$@" "$input" "$output" >/dev/null
    ;;
  *.cast)
    cp "$input" "$output"
    ;;
  *)
    echo "unsupported output extension: $output (use .gif or .cast)" >&2
    exit 1
    ;;
esac
echo "wrote $output ($(du -h "$output" | cut -f1))" >&2
