#!/usr/bin/env node
// Runs `claude <args>` on the Claude Code version CI pins (`CLAUDE_CODE_VERSION` in
// .github/workflows/ci.yml): the local `claude` when it is that version, else that version
// through npx. A local `claude` auto-updates, so tests run this way agree with CI.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ci = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
const pinned = /CLAUDE_CODE_VERSION:\s*(\S+)/.exec(ci)?.[1]
if (!pinned) throw new Error('no CLAUDE_CODE_VERSION in .github/workflows/ci.yml')

let local = null
try {
  local = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim().split(/\s+/)[0]
} catch {
  // No local claude: npx fetches the pinned one.
}

const args = process.argv.slice(2)
const [cmd, argv] =
  local === pinned
    ? ['claude', args]
    : ['npx', ['-y', `@anthropic-ai/claude-code@${pinned}`, ...args]]
if (local !== pinned)
  console.error(
    `claude ${local ?? '(none)'} is not the pinned ${pinned}: running ${pinned} through npx`,
  )
const { status } = spawnSync(cmd, argv, { stdio: 'inherit' })
process.exit(status ?? 1)
