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
import { driftDiffArgv } from '../../src/drift'
import { activeRecord, featuresOf } from './features'
import { ledgerOf } from './ledger'
import { remoteUrl, repoFacts, sh } from './repo'
import { trackerOf } from './tracker'

const gitState = atom({ plugin: 'craftory', key: 'git' } as const, null)

/** The last integration diff read, and what it was read for. */
const featureDiffState = atom({ plugin: 'craftory', key: 'featureDiff' } as const, null)

export function gitOf($: EngineInterface) {
  return read($, gitState)
}

/** The branches the active Feature's integration diff runs between, and what a read of it is held by. */
async function featureDiffRange($: EngineInterface) {
  const [record, git] = await Promise.all([activeRecord($), gitOf($)])
  const integration = record?.integrationBranch
  const base = git?.branch
  if (!integration || !base || integration === base) return null
  // `base...integration` moves with the integration tip; without one, with each git refresh
  return { base, integration, key: `${base}...${integration}@${git.tips[integration] ?? git.at}` }
}

async function readFeatureDiff($: EngineInterface, base: string, integration: string) {
  const ran = await sh($, driftDiffArgv(base, integration))
  return ran?.exitCode === 0 ? ran.stdout : null
}

/**
 * The active Feature's integration diff against the checked-out branch, as the drift scan and
 * the Add-term default read it; null when there is no Feature branch apart from it, or git fails.
 * Read once per branch tip and held, so only call it where state may be written (not a render).
 */
export async function featureDiff($: EngineInterface): Promise<string | null> {
  const range = await featureDiffRange($)
  if (range === null) return null
  const held = await read($, featureDiffState)
  if (held?.key === range.key) return held.diff
  const diff = await readFeatureDiff($, range.base, range.integration)
  await update($, featureDiffState, () => ({ key: range.key, diff }))
  return diff
}

/** `featureDiff` for a render: the held read when it is current, else a fresh one it cannot keep. */
export async function heldFeatureDiff($: EngineInterface): Promise<string | null> {
  const range = await featureDiffRange($)
  if (range === null) return null
  const held = await read($, featureDiffState)
  return held?.key === range.key ? held.diff : readFeatureDiff($, range.base, range.integration)
}

/** After git moves, reads the diff again if one was held, so the next render finds it current. */
export async function refreshFeatureDiff($: EngineInterface) {
  if ((await read($, featureDiffState)) !== null) await featureDiff($)
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
