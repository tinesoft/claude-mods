#!/usr/bin/env node
// WorktreeCreate hook (see .claude/settings.json). Claude Code runs it instead of its own
// `git worktree add`, passes `{ cwd, name }` on stdin, and reads the worktree's path from stdout.
//
// Two things the default does not do, and every implementer subagent met by hand:
//   - base the worktree on the checkout's current HEAD, so an integration branch is the base;
//   - run `pnpm install` in it, since git ignores `node_modules`.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { text } from 'node:stream/consumers'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

function pnpmInstall(dir) {
  execFileSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {
    cwd: dir,
    stdio: ['ignore', 2, 2],
  })
}

/**
 * Creates `<repo>/.claude/worktrees/<name>` on `worktree-<name>` from the checkout's HEAD and
 * installs its dependencies. A failed install leaves the worktree in place: it is still usable,
 * and the agent can run `pnpm install` itself.
 */
export function createWorktree(cwd, name, install = pnpmInstall) {
  const root = git(cwd, 'rev-parse', '--show-toplevel')
  const dir = path.join(root, '.claude', 'worktrees', name)
  git(root, 'worktree', 'add', '-q', '-b', `worktree-${name}`, dir, 'HEAD')
  try {
    install(dir)
  } catch (error) {
    console.error(`pnpm install failed in ${dir}: ${error.message}`)
  }
  return dir
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(await text(process.stdin))
  process.stdout.write(`${createWorktree(input.cwd, input.name)}\n`)
}
