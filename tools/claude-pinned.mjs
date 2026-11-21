#!/usr/bin/env node
// Runs `claude <args>` on the Claude Code version CI pins (`CLAUDE_CODE_VERSION` in
// .github/workflows/ci.yml): the local `claude` when it is that version, else that version
// through npx. A local `claude` auto-updates, so tests run this way agree with CI.
//
// For `plugin test`, `(pass)` lines are dropped, so failures, warnings and the counts stand out;
// a file's header is kept only when something other than a pass follows it. VERBOSE=1 keeps all.
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cpus, loadavg } from 'node:os'
import { createInterface } from 'node:readline'
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

const quiet = args[0] === 'plugin' && args[1] === 'test' && process.env.VERBOSE !== '1'
const child = spawn(cmd, argv, {
  stdio: ['inherit', quiet ? 'pipe' : 'inherit', quiet ? 'pipe' : 'inherit'],
})

let timeouts = 0

function filter(input, output) {
  let header = null
  createInterface({ input }).on('line', line => {
    if (/timed out after \d+ ?ms/.test(line)) timeouts++
    if (/^\s*\(pass\)/.test(line) || line.trim() === '') return
    if (/^\S.*\.test\.tsx?:$/.test(line)) {
      header = line
      return
    }
    if (/^\s*\d+ (pass|fail)$|^Ran \d+ tests/.test(line)) header = null
    if (header !== null) output.write(`\n${header}\n`)
    header = null
    output.write(`${line}\n`)
  })
}

if (quiet) {
  filter(child.stdout, process.stdout)
  filter(child.stderr, process.stderr)
}
child.on('close', status => {
  // Tests share the machine with whatever else runs: under load a slow test times out, which
  // reads as a failure. Say so, with the load, so a rerun when it is quiet is the first move.
  const load = loadavg()[0]
  if (timeouts > 0 && load > cpus().length)
    console.error(
      `\n${timeouts} timeout(s) while the load average was ${load.toFixed(0)} on ${cpus().length} CPUs: likely load, not the code. Rerun when it is quiet.`,
    )
  process.exit(status ?? 1)
})
