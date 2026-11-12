#!/usr/bin/env node
// Builds the Craftory demo repo ("Invoicely") in demo/.workspace and optionally starts Claude Code in it.
//   node demo/setup.mjs          rebuild the workspace
//   node demo/setup.mjs --run    rebuild, then run `claude --plugin-dir <craftory>` inside it
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const demo = dirname(fileURLToPath(import.meta.url))
const mod = dirname(demo)
const workspace = join(demo, '.workspace')

rmSync(workspace, { recursive: true, force: true })
cpSync(join(demo, 'template'), workspace, { recursive: true })

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

git('init', '-q', '-b', 'develop')
git('add', '-A')
git('commit', '-q', '-m', 'chore: initial Invoicely')
git('switch', '-q', '-c', 'feat/csv-export')

const ago = minutes => new Date(Date.now() - minutes * 60_000).toISOString()
const agent = (n, slug, props) => ({
  ticket: `csv-export/${n}`,
  name: `craftory-csv-export-${n}-${slug}`,
  branch: `craftory/csv-export-${n}-${slug}`,
  worktree: `.claude/worktrees/csv-export-${n}-${slug}`,
  budget: 120000,
  ...props,
})
const agents = [
  agent('01', 'csv-writer', {
    tokens: 38210,
    outcome: 'done',
    startedAt: ago(190),
    endedAt: ago(160),
  }),
  agent('02', 'column-selection', {
    tokens: 44870,
    outcome: 'done',
    startedAt: ago(150),
    endedAt: ago(118),
  }),
  agent('03', 'money-format', { tokens: 71400, outcome: 'running', startedAt: ago(40) }),
  agent('04', 'bad-invoice-errors', { tokens: 23100, outcome: 'running', startedAt: ago(22) }),
]
for (const a of agents.filter(a => a.outcome === 'running')) {
  git('worktree', 'add', '-q', '-b', a.branch, a.worktree, 'feat/csv-export')
}

const feature = {
  version: 1,
  spec: 'csv-export',
  origin: 'spec',
  title: 'Export invoices as CSV',
  entry: 'align',
  enteredFrom: null,
  skips: {},
  integrationBranch: 'feat/csv-export',
  pr: null,
  marks: {
    align: { ranAt: ago(1500), endedAt: ago(1440) },
    spec: { ranAt: ago(1430), endedAt: ago(1400) },
    tickets: { ranAt: ago(1390), endedAt: ago(1370) },
    build: { ranAt: ago(200) },
  },
  agents: Object.fromEntries(agents.map(a => [a.ticket, a])),
}
mkdirSync(join(workspace, '.craftory/features'), { recursive: true })
writeFileSync(
  join(workspace, '.craftory/features/csv-export.json'),
  `${JSON.stringify(feature, null, 2)}\n`,
)

console.log(`Demo workspace ready: ${workspace}`)
if (process.argv.includes('--run')) {
  const result = spawnSync('claude', ['--plugin-dir', mod], { cwd: workspace, stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
console.log(`Run: cd ${workspace} && claude --plugin-dir ${mod}`)
