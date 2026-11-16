import type { DenyConfig, PhaseId } from '../types'
import type { Flow } from './evidence'
import { PHASES } from './phases'

/** How a denial ends: the rule's name and the switch that turns it off. */
const switchText = (rule: keyof DenyConfig) =>
  `This is the deny.${rule} rule; turn it off in Settings › Automation, or set "deny": { "${rule}": false } in .craftory/config.json.`

/**
 * The switch that makes `rule` refuse, or null when it does not. `hardGates` turns on both rules,
 * so a refusal that follows from it names `hardGates`: turning the sub-rule off would not help.
 */
export function ruleVia(
  deny: DenyConfig,
  rule: 'skipGate' | 'editOnIntegrationBranch',
): keyof DenyConfig | null {
  if (deny.hardGates) return 'hardGates'
  return deny[rule] ? rule : null
}

/** The deny.skipGate reason for running `skill` of `phase`, or null when the phase is not gated. */
export function skipGateDenial(
  skill: string,
  phase: PhaseId,
  flow: Flow | null,
  via: keyof DenyConfig = 'skipGate',
): string | null {
  const state = flow?.phases.find(s => s.phase === phase)?.state
  if (state?.kind !== 'gated') return null
  const why = state.blockers.join(', ') || `${PHASES[state.by].label} is not done`
  return `Craftory denied ${skill}: ${PHASES[phase].label} is gated until ${PHASES[state.by].label} is done (${why}). ${switchText(via)}`
}

/** Resolves `path` against `cwd` and folds `.` and `..`, so a prefix check can be trusted. */
function resolved(path: string, cwd: string): string {
  const parts: string[] = []
  for (const part of (path.startsWith('/') ? path : `${cwd}/${path}`).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

const isUnder = (path: string, dir: string) => {
  const d = dir.replace(/\/+$/, '')
  return path === d || path.startsWith(`${d}/`)
}

/** Whether `branch` fits the integration branch template, `feat/{spec-slug}` by default. */
export function isIntegrationBranch(branch: string, template: string): boolean {
  const [before, after] = template.split('{spec-slug}')
  if (after === undefined) return branch === template
  return (
    branch.length > before!.length + after.length &&
    branch.startsWith(before!) &&
    branch.endsWith(after)
  )
}

export type EditCheck = {
  tool: string
  path: string
  cwd: string
  /** The main checkout's folder and branch, and every other worktree's folder. */
  checkout: { root: string; branch: string | null; others: readonly string[] }
  integrationBranch: string
  /** The switch that made this rule refuse; `editOnIntegrationBranch` unless `hardGates` is on. */
  via?: keyof DenyConfig
}

/** The deny.editOnIntegrationBranch reason for this edit, or null when it lands elsewhere. */
export function editDenial({
  tool,
  path,
  cwd,
  checkout,
  integrationBranch,
  via = 'editOnIntegrationBranch',
}: EditCheck): string | null {
  const { root, branch, others } = checkout
  if (branch === null || !isIntegrationBranch(branch, integrationBranch)) return null
  const target = resolved(path, cwd)
  if (!isUnder(target, root) || others.some(o => isUnder(target, o))) return null
  return `Craftory denied this ${tool}: the main checkout is on ${branch}, an integration branch, so changes belong in a ticket worktree. ${switchText(via)}`
}

/** What a refused `Bash` call would have sent out for review: a ready pull request or merge request. */
export type ReviewOutflow =
  'gh pr create' | 'gh pr ready' | 'glab mr create' | 'glab mr update --ready'

/** `env`-style words that sit before the real command and change nothing about it. */
const WRAPPERS = new Set(['rtk', 'command', 'sudo', 'env', 'time', 'nohup', 'exec'])

const quoted = (word: string) => /^['"]/.test(word)

/**
 * The pull request or merge request this shell command would put up for review, or null.
 *
 * Best-effort and deliberately narrow, like `removalTargets`: it reads each `&&`, `||`, `;`, `|`
 * and newline segment, skips `VAR=value` words and wrappers such as `rtk` and `sudo`, and matches
 * `gh pr create`, `gh pr ready`, `glab mr create` (also `new`) and `glab mr update --ready`.
 * A draft is let through, since Build opens one. Text inside quotes, `echo` arguments and
 * `gh api` or `glab api` calls are not followed.
 */
export function reviewOutflow(command: string): ReviewOutflow | null {
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const words = segment.trim().split(/\s+/)
    let at = 0
    while (
      at < words.length &&
      (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[at]!) || WRAPPERS.has(words[at]!))
    )
      at++
    const [tool, group, action, ...rest] = words.slice(at)
    if (tool === undefined || quoted(tool)) continue
    const flags = rest.filter(w => w.startsWith('-') && !quoted(w))
    const isDraft = flags.some(f => /^(?:--draft|-d|--wip)(?:=true)?$/.test(f))
    if (tool === 'gh' && group === 'pr') {
      if (action === 'create' && !isDraft) return 'gh pr create'
      if (action === 'ready' && !flags.includes('--undo')) return 'gh pr ready'
    }
    if (tool === 'glab' && group === 'mr') {
      if ((action === 'create' || action === 'new') && !isDraft) return 'glab mr create'
      if (action === 'update' && flags.some(f => /^(?:--ready|--draft=false)$/.test(f)))
        return 'glab mr update --ready'
    }
  }
  return null
}

/**
 * The deny.hardGates reason for putting a pull request or merge request up before Review is done,
 * or null. It refuses only on a flow that is known: no flow, Review turned off for the feature, or
 * Review done all let the call through.
 */
export function reviewDenial(outflow: ReviewOutflow, flow: Flow | null): string | null {
  const state = flow?.phases.find(s => s.phase === 'review')?.state
  if (state === undefined || state.kind === 'done' || state.kind === 'skipped') return null
  const why =
    state.kind === 'gated' && state.blockers.length > 0 ? ` (${state.blockers.join(', ')})` : ''
  return `Craftory denied ${outflow}: ${PHASES.review.label} is not done${why}, so the work is not ready for review. ${switchText('hardGates')}`
}
