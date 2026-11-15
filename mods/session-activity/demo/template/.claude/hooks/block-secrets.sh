#!/bin/sh
# Blocks any Bash command that reads .env.
if grep -q '\.env'; then
  echo "Reading .env is not allowed" >&2
  exit 2
fi
exit 0
