import { type EngineInterface, type Timer } from 'claude-code'
import { samePath, moveNotices } from '../../src/build'
import { configOf } from '../../src/config'
import { featureOf } from '../../src/features'
import { type ReadContext, TRACKERS } from '../../src/tracker'
import { DEFAULT_LABELS } from '../../src/agents-md'
import { worktreeRemoveArgv } from '../../src/git'
import type { GitSnapshot, RepoSnapshot } from '../../types'
import { activeKey, draftsOf, featureOfTicket, featuresOf } from './features'
import { bindDrafts, settle } from './flow'
import { cleanupInputs, gitOf, loadGit } from './git'
import { ledgerOf, stopForConflict } from './ledger'
import { addNotice } from './notices'
import { repoSnapshot, sh } from './repo'
import { loadTracker, trackerKindOf } from './tracker'

const REFRESH_DEBOUNCE_MS = 800

const GIT_DEBOUNCE_MS = 1_500

let refreshTimer: Timer | undefined

let gitTimer: Timer | undefined

/** The tip each agent was last told its integration branch moved to, so a tip is told once. */
const told = new Map<string, string>()

export async function readContext($: EngineInterface, repo: RepoSnapshot): Promise<ReadContext> {
  const [features, drafts, active] = await Promise.all([featuresOf($), draftsOf($), activeKey($)])
  const feature = featureOf(active, features, drafts)
  const record = feature?.kind === 'specced' ? feature.record : null
  return {
    config: configOf(repo.config),
    labels: (repo.setup.state === 'ok' ? repo.setup.value.triage : null) ?? DEFAULT_LABELS,
    now: await $.clock.now(),
    focus: {
      specs: Object.values(features).map(f => f.spec),
      branch: record?.integrationBranch || null,
    },
    remoteWeb: (await gitOf($))?.remote?.webUrl ?? null,
    ...(repo.setup.state === 'ok' &&
      repo.setup.value.tracker.kind === 'other' && {
        otherDescription: repo.setup.value.tracker.description,
      }),
  }
}

export async function refreshTracker($: EngineInterface) {
  const repo = await repoSnapshot($)
  if (repo === null) return
  if (!(await loadTracker($, repo, await readContext($, repo)))) return
  await bindDrafts($)
  await cleanupMerged($)
  await settle($)
}

export function scheduleRefresh($: EngineInterface) {
  refreshTimer?.cancel()
  refreshTimer = $.clock.after(REFRESH_DEBOUNCE_MS, () => void refreshTracker($))
}

export async function touchesTracker(
  $: EngineInterface,
  tool: { name: string; command?: string; path?: string },
) {
  const repo = await repoSnapshot($)
  if (repo === null) return false
  return TRACKERS[trackerKindOf(repo)]?.touches(await readContext($, repo), tool) === true
}

export async function refreshGit($: EngineInterface) {
  const snapshot = await loadGit($)
  if (snapshot === null) return
  const repo = await repoSnapshot($)
  await afterGit($, snapshot, configOf(repo?.config).worktrees.rebaseOnMove)
  $.ui.invalidate('ui.render')
}

export function scheduleGit($: EngineInterface) {
  gitTimer?.cancel()
  gitTimer = $.clock.after(GIT_DEBOUNCE_MS, () => void refreshGit($))
}

async function afterGit($: EngineInterface, snapshot: GitSnapshot, rebaseOnMove: boolean) {
  const ledger = await ledgerOf($)
  for (const run of Object.values(ledger.runs)) {
    if (run.status !== 'running' || run.stop !== null) continue
    const w = snapshot.worktrees.find(x => samePath(x.path, run.worktree))
    if (w?.isRebasing) {
      await stopForConflict($, run.agentId)
      await addNotice($, {
        kind: 'rebase-conflict',
        id: `conflict-${run.ticket}`,
        ticket: run.ticket,
        worktree: run.worktree,
      })
      await settle($)
      continue
    }
    if (!rebaseOnMove) continue
    const integration = (await featureOfTicket($, run.ticket))?.integrationBranch
    const tip = integration === undefined ? undefined : snapshot.tips[integration]
    if (integration === undefined || !tip || told.get(run.agentId) === tip) continue
    const [note] = moveNotices(
      { ...ledger, runs: { [run.agentId]: run } },
      snapshot.worktrees,
      integration,
    )
    if (note === undefined) continue
    told.set(run.agentId, tip)
    await $.session.send({ to: { agentId: note.agentId }, text: note.text })
  }
}

async function cleanupMerged($: EngineInterface) {
  const { plan, git } = await cleanupInputs($)
  if (git === null) return
  const gone = plan.remove.filter(p => git.worktrees.some(w => samePath(w.path, p)))
  for (const path of gone) await sh($, worktreeRemoveArgv(path))
  if (gone.length > 0) await refreshGit($)
}
