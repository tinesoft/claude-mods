import { atom, type EngineInterface, read, type RenderSurface, update } from 'claude-code'
import {
  agentRows,
  type AgentsView,
  agentsView,
  type KeepWhy,
  samePath,
  splitArgv,
} from '../../src/build'
import { configOf, DEFAULT_CONFIG } from '../../src/config'
import type { Flow } from '../../src/evidence'
import {
  basesOf,
  diffLine,
  parseShortstat,
  parseWorktreeList,
  prunable,
  shortstatArgv,
  tipArgv,
  branchCreateArgv,
  cdCommand,
  isSafeRef,
  worktreeAddArgv,
  worktreeListArgv,
  worktreeRemoveArgv,
  type WorktreesView,
  worktreesView,
} from '../../src/git'
import type { GitSnapshot, SeatPlan } from '../../types'
import { cleanupInputs, featuresOf, gitOf, ledgerOf, refreshGit } from './flow'
import { exists, repoSnapshot, sh } from './repo'

const REMOVE_ANYWAY = 'Remove anyway'

const KEEP_IT = 'Keep it'

const diffsState = atom({ plugin: 'craftory', key: 'diffs' } as const, {})

const steeringNoteState = atom({ plugin: 'craftory', key: 'steeringNote' } as const, null)

const SETUP_MS = 600_000

type Seat =
  { ok: true; isFresh: boolean; path: string; notes: string[] } | { ok: false; reason: string }

const RUN_SETUP = 'Run'

const SKIP_SETUP = 'Skip'

const DEFAULT_SETUP = splitArgv(DEFAULT_CONFIG.worktrees.setup)?.join(' ')

const approvedKey = (command: string) => `setupApproved:${command}`

async function approveSetup($: EngineInterface, command: string): Promise<boolean> {
  if (command === DEFAULT_SETUP || (await $.store.get(approvedKey(command))) === true) return true
  const answer = await $.ui
    .ask(`Run the setup command from .craftory/config.json in new worktrees? \`${command}\``, [
      RUN_SETUP,
      SKIP_SETUP,
    ])
    .catch(() => SKIP_SETUP)
  if (answer !== RUN_SETUP) return false
  await $.store.set(approvedKey(command), true)
  return true
}

export async function seatWorktree($: EngineInterface, plan: SeatPlan): Promise<Seat> {
  const root = await $.session.cwd()
  const path = `${root}/${plan.path}`
  const listed = await sh($, worktreeListArgv)
  if (listed === null || listed.exitCode !== 0) return { ok: false, reason: 'git is not available' }
  if (parseWorktreeList(listed.stdout).some(w => samePath(w.path, plan.path)))
    return { ok: true, isFresh: false, path, notes: [] }
  if (!isSafeRef(plan.branch) || !isSafeRef(plan.base))
    return {
      ok: false,
      reason: `${plan.base || 'the integration branch'} is not a safe branch name`,
    }
  const hasBranch = (await sh($, tipArgv(plan.branch)))?.exitCode === 0
  if (!hasBranch && (await sh($, tipArgv(plan.base)))?.exitCode !== 0) {
    const made = await sh($, branchCreateArgv(plan.base, 'HEAD'))
    if (made === null || made.exitCode !== 0)
      return {
        ok: false,
        reason: `could not make the integration branch ${plan.base}: ${made?.stderr.trim() || 'git branch failed'}`,
      }
  }
  const added = await sh($, worktreeAddArgv(plan.branch, plan.path, plan.base, hasBranch))
  if (added === null || added.exitCode !== 0)
    return { ok: false, reason: added?.stderr.trim() || 'git worktree add failed' }
  const notes: string[] = []
  if (plan.rejectedCopy.length > 0)
    notes.push(`Craftory did not copy ${plan.rejectedCopy.join(', ')}: not a file inside the repo`)
  for (const file of plan.copy) {
    if (await exists($, file)) await sh($, ['cp', '--', file, `${plan.path}/${file}`])
  }
  if (plan.setup !== null) {
    const command = plan.setup.join(' ')
    if (!(await approveSetup($, command))) {
      notes.push(`Craftory skipped the setup command \`${command}\`: you did not approve it`)
    } else {
      const setup = await sh($, plan.setup, { cwd: path, timeoutMs: SETUP_MS })
      if (setup === null || setup.exitCode !== 0)
        $.ui.toast(`Setup failed in ${plan.path} · the agent starts anyway`)
    }
  }
  return { ok: true, isFresh: true, path, notes }
}

export async function keptWorktrees($: EngineInterface): Promise<{ path: string; why: KeepWhy }[]> {
  const { plan } = await cleanupInputs($)
  return plan.keep.filter(k => k.why !== 'unmerged')
}

export async function worktreesViewOf($: EngineInterface): Promise<WorktreesView | null> {
  const [git, features, repo, diffs] = await Promise.all([
    gitOf($),
    featuresOf($),
    repoSnapshot($),
    read($, diffsState),
  ])
  if (git === null) return null
  const config = configOf(repo?.config)
  const records = Object.values(features)
  return worktreesView({
    git,
    records,
    bases: basesOf({
      entries: git.worktrees.map(w => ({
        path: w.path,
        branch: w.branch,
        isMain: w.role === 'checkout',
      })),
      main: git.branch,
      records,
      runs: new Map(),
      ticketBranch: config.worktrees.ticketBranch,
    }),
    kept: await keptWorktrees($),
    diffs,
    folder: config.worktrees.folder,
    now: await $.clock.now(),
  })
}

export async function toggleDiff($: EngineInterface, path: string) {
  const view = await worktreesViewOf($)
  const row = view?.rows.find(r => r.path === path)
  if (row === undefined) return
  if (row.diff !== null) {
    await update($, diffsState, held =>
      Object.fromEntries(Object.entries(held).filter(([p]) => p !== path)),
    )
    return $.ui.invalidate('ui.render')
  }
  const git = await gitOf($)
  const base = git === null ? undefined : (await currentBases($, git))[path]
  const result =
    base === undefined || row.branch === null ? null : await sh($, shortstatArgv(base, row.branch))
  const line =
    result?.exitCode === 0 ? diffLine(parseShortstat(result.stdout)) : 'could not read the diff'
  await update($, diffsState, held => ({ ...held, [path]: line }))
  $.ui.invalidate('ui.render')
}

async function currentBases($: EngineInterface, git: GitSnapshot) {
  const [features, repo] = await Promise.all([featuresOf($), repoSnapshot($)])
  return basesOf({
    entries: git.worktrees.map(w => ({
      path: w.path,
      branch: w.branch,
      isMain: w.role === 'checkout',
    })),
    main: git.branch,
    records: Object.values(features),
    runs: new Map(),
    ticketBranch: configOf(repo?.config).worktrees.ticketBranch,
  })
}

/** A mod cannot open a terminal, so the row copies `cd <path>` for the user to paste. */ export async function copyTerminal(
  $: EngineInterface,
  path: string,
  surface: RenderSurface,
) {
  const line = cdCommand(path)
  const copied = await $.ui.copy({ text: line, surface }).catch(() => ({ isCopied: false }))
  $.ui.toast(
    copied.isCopied
      ? `Copied ${line} · paste it in a terminal`
      : `Could not copy · run ${line} in a terminal`,
  )
}

export async function removeWorktree($: EngineInterface, path: string) {
  const row = (await worktreesViewOf($))?.rows.find(r => r.path === path)
  if (row === undefined || !row.canRemove) return
  if (row.isProtected) {
    const answer = await $.ui
      .ask(`Remove ${row.shown}? Its agent is running or its work is kept. Remove anyway?`, [
        REMOVE_ANYWAY,
        KEEP_IT,
      ])
      .catch(() => KEEP_IT)
    if (answer !== REMOVE_ANYWAY) return
  }
  const result = await sh($, worktreeRemoveArgv(path, row.isProtected))
  $.ui.toast(
    result?.exitCode === 0
      ? `Removed ${row.shown}`
      : `Could not remove ${row.shown}: ${result?.stderr.trim() || 'git did not run'}`,
  )
  await refreshGit($)
}

export async function pruneStale($: EngineInterface) {
  const git = await gitOf($)
  if (git === null) return
  const stale = prunable(
    git,
    (await keptWorktrees($)).map(k => k.path),
  )
  let removed = 0
  for (const w of stale) if ((await sh($, worktreeRemoveArgv(w.path)))?.exitCode === 0) removed++
  if (stale.length > 0) $.ui.toast(`Pruned ${removed} of ${stale.length} stale worktrees`)
  await refreshGit($)
}

export function setSteeringNote($: EngineInterface, note: string | null) {
  return update($, steeringNoteState, () => note)
}

export async function agentsViewOf(
  $: EngineInterface,
  flow: Flow | null,
): Promise<AgentsView | null> {
  const [repo, ledger, git, note] = await Promise.all([
    repoSnapshot($),
    ledgerOf($),
    gitOf($),
    read($, steeringNoteState),
  ])
  const config = configOf(repo?.config)
  if (flow === null || !config.automation.liveAgents || flow.tickets.length === 0) return null
  const build = flow.steps.find(s => s.phase === 'build')?.state.kind
  if (build === 'todo' || build === 'next' || build === 'gated' || build === 'skipped') return null
  const record = flow.feature.kind === 'specced' ? flow.feature.record : null
  const rows = agentRows({
    tickets: flow.tickets,
    ledger,
    records: record?.agents ?? {},
    worktrees: git?.worktrees ?? [],
    config,
    integrationBranch: record?.integrationBranch ?? '',
    now: await $.clock.now(),
  })
  return agentsView({ rows, config, isPaused: ledger.isPaused, note })
}
