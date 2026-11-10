import type { DenyConfig, PhaseId } from '../types'
import type { Flow } from './evidence'
import { PHASES } from './phases'

/** How a denial ends: the rule's name and the switch that turns it off. */
const switchText = (rule: keyof DenyConfig) =>
  `This is the deny.${rule} rule; turn it off in Settings › Automation, or set "deny": { "${rule}": false } in .craftory/config.json.`

/** The deny.skipGate reason for running `skill` of `phase`, or null when the phase is not gated. */
export function skipGateDenial(skill: string, phase: PhaseId, flow: Flow | null): string | null {
  const state = flow?.phases.find(s => s.phase === phase)?.state
  if (state?.kind !== 'gated') return null
  const why = state.blockers.join(', ') || `${PHASES[state.by].label} is not done`
  return `Craftory denied ${skill}: ${PHASES[phase].label} is gated until ${PHASES[state.by].label} is done (${why}). ${switchText('skipGate')}`
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
}

/** The deny.editOnIntegrationBranch reason for this edit, or null when it lands elsewhere. */
export function editDenial({
  tool,
  path,
  cwd,
  checkout,
  integrationBranch,
}: EditCheck): string | null {
  const { root, branch, others } = checkout
  if (branch === null || !isIntegrationBranch(branch, integrationBranch)) return null
  const target = resolved(path, cwd)
  if (!isUnder(target, root) || others.some(o => isUnder(target, o))) return null
  return `Craftory denied this ${tool}: the main checkout is on ${branch}, an integration branch, so changes belong in a ticket worktree. ${switchText('editOnIntegrationBranch')}`
}
