import { atom, type EngineInterface, read, update } from 'claude-code'
import { cleanupPlan, samePath } from '../../src/build'
import {
  assembleGit,
  basesOf,
  gitStep2,
  parseRemote,
  parseWorktreeList,
  worktreeListArgv,
} from '../../src/git'
import { parentOf } from '../../src/tracker'
import type { GitSnapshot } from '../../types'
import { featuresOf } from './features'
import { ledgerOf } from './ledger'
import { remoteUrl, repoFacts, sh } from './repo'
import { trackerOf } from './tracker'

const gitState = atom({ plugin: 'craftory', key: 'git' } as const, null)

export function gitOf($: EngineInterface) {
  return read($, gitState)
}

/** Reads the worktrees and branches into the snapshot; null when git is not there to ask. */
export async function loadGit($: EngineInterface): Promise<GitSnapshot | null> {
  const [{ config }, features, tracker, ledger] = await Promise.all([
    repoFacts($),
    featuresOf($),
    trackerOf($),
    ledgerOf($),
  ])
  const listed = await sh($, worktreeListArgv)
  if (listed === null || listed.exitCode !== 0) return null
  const entries = parseWorktreeList(listed.stdout)
  const main = entries[0]
  if (main === undefined) return null
  const records = Object.values(features)
  const integrationBranches = [...new Set(records.map(r => r.integrationBranch).filter(Boolean))]
  const runs = new Map<string, string>()
  for (const run of Object.values(ledger.runs)) {
    const parent = parentOf(tracker, run.ticket)
    const integration = parent ? features[parent]?.integrationBranch : undefined
    if (integration) runs.set(run.branch, integration)
  }
  const bases = basesOf({
    entries,
    main: main.branch,
    records,
    runs,
    ticketBranch: config.worktrees.ticketBranch,
  })
  const asked = gitStep2({ entries, bases, integrationBranches })
  const answers = await Promise.all(asked.map(argv => sh($, argv)))
  const results = new Map<string, string>()
  asked.forEach((argv, i) => {
    const answer = answers[i]
    if (answer?.exitCode === 0) results.set(argv.join(' '), answer.stdout)
  })
  const live = Object.values(ledger.runs).filter(r => r.status === 'running')
  const snapshot = assembleGit({
    root: main.path,
    branch: main.branch,
    remote: parseRemote(await remoteUrl($)),
    entries,
    bases,
    results,
    config,
    integrationBranches,
    runningPaths: new Set(
      entries.filter(e => live.some(r => samePath(e.path, r.worktree))).map(e => e.path),
    ),
    now: await $.clock.now(),
  })
  await update($, gitState, () => snapshot)
  return snapshot
}

export async function cleanupInputs($: EngineInterface) {
  const [{ config }, features, tracker, ledger, git] = await Promise.all([
    repoFacts($),
    featuresOf($),
    trackerOf($),
    ledgerOf($),
    gitOf($),
  ])
  const merged = new Set(
    tracker?.rich
      ? tracker.issues
          .filter(i => i.status === 'done' || i.status === 'closed')
          .map(i => i.ref as string)
      : [],
  )
  const plan = cleanupPlan({
    records: Object.values(features).flatMap(f => Object.values(f.agents)),
    merged,
    config,
    running: new Set(
      Object.values(ledger.runs)
        .filter(r => r.status === 'running')
        .map(r => r.worktree),
    ),
  })
  return { plan, git }
}
