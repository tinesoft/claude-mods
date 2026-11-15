#!/usr/bin/env node
// Builds the session-activity demo repo ("Invoicely") in demo/.workspace and optionally starts Claude Code in it.
//   node demo/setup.mjs          rebuild the workspace
//   node demo/setup.mjs --run    rebuild, then run `claude --plugin-dir <session-activity>` inside it
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const demo = dirname(fileURLToPath(import.meta.url))
const mod = dirname(demo)
const workspace = join(demo, '.workspace')

rmSync(workspace, { recursive: true, force: true })
cpSync(join(demo, 'template'), workspace, { recursive: true })
chmodSync(join(workspace, '.claude/hooks/block-secrets.sh'), 0o755)
// Written here, not kept in template/, so no file that looks like a secret is committed.
writeFileSync(join(workspace, '.env'), 'RELEASE_KEY=demo-not-a-real-key\n')

// Claude Code also loads the instruction files of every folder above the workspace, this
// repo's own CLAUDE.md among them, and each would show as a rule chip.
const above = []
for (let dir = dirname(workspace); !above.includes(dir); dir = dirname(dir)) above.push(dir)
const settingsPath = join(workspace, '.claude/settings.json')
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
settings.claudeMdExcludes = above.flatMap(dir =>
  ['CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md', '.claude/rules/**'].map(name =>
    join(dir, name),
  ),
)
writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)

const git = (...args) =>
  execFileSync('git', args, {
    cwd: workspace,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Demo',
      GIT_AUTHOR_EMAIL: 'demo@example.com',
      GIT_COMMITTER_NAME: 'Demo',
      GIT_COMMITTER_EMAIL: 'demo@example.com',
    },
  })

git('init', '-q', '-b', 'main')
git('add', '-A')
git('commit', '-q', '-m', 'chore: initial Invoicely')

console.log(`Demo workspace ready: ${workspace}`)
if (process.argv.includes('--run')) {
  const result = spawnSync('claude', ['--plugin-dir', mod], { cwd: workspace, stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
console.log(`Run: cd ${workspace} && claude --plugin-dir ${mod}`)
