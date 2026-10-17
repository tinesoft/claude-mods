import type { Activation, Kind, Layout, Overrides, Status } from '../types'
import { isUrgent, KIND_ORDER, KINDS } from './theme'

export type Observed = Omit<Activation, 'count' | 'firstAt' | 'lastAt' | 'running'> & {
  /** A subagent id that starts running under this chip. */
  startedAgent?: string
}

const MAX_ACTIVATIONS = 500

export const chipId = (a: Pick<Activation, 'kind' | 'key'>) => `${a.kind}:${a.key}`

const mergeMeta = (old: string | undefined, next: string | undefined) => {
  if (next === undefined || old === next) return old ?? next
  if (old === undefined) return next
  const parts = old.split(' · ')
  return parts.includes(next) ? old : [...parts, next].join(' · ')
}

export const record = (list: readonly Activation[], seen: Observed, at: number): Activation[] => {
  const { startedAgent, ...fields } = seen
  const index = list.findIndex(a => a.kind === seen.kind && a.key === seen.key)
  if (index === -1) {
    const fresh: Activation = { ...fields, count: 1, firstAt: at, lastAt: at }
    if (startedAgent !== undefined) fresh.running = [startedAgent]
    return [...list, fresh].slice(-MAX_ACTIVATIONS)
  }
  const old = list[index]!
  const running = startedAgent === undefined ? old.running : [...(old.running ?? []), startedAgent]
  // A stop is the signal the person most needs, so a later clean run does not hide it.
  const keepsStop = isUrgent(old.status) && !isUrgent(seen.status)
  const merged: Activation = {
    ...old,
    ...fields,
    detail: keepsStop ? old.detail : fields.detail,
    meta: seen.kind === 'mcp' ? mergeMeta(old.meta, seen.meta) : (seen.meta ?? old.meta),
    count: old.count + 1,
    lastAt: at,
    status: keepsStop ? old.status : running?.length ? 'running' : seen.status,
  }
  if (running !== undefined) merged.running = running
  return list.map((a, i) => (i === index ? merged : a))
}

export const settle = (
  list: readonly Activation[],
  kind: Kind,
  key: string,
  status: Status,
  at: number,
  detail?: string,
): Activation[] =>
  list.map(a =>
    a.kind === kind && a.key === key ? { ...a, status, lastAt: at, detail: detail ?? a.detail } : a,
  )

/** Ends one subagent; its chip leaves `running` once no other subagent of that type runs. */
export const finishAgent = (
  list: readonly Activation[],
  agentId: string,
  status: Status,
  at: number,
): Activation[] =>
  list.map(a => {
    if (!a.running?.includes(agentId)) return a
    const running = a.running.filter(id => id !== agentId)
    const keepsRunning = running.length > 0
    return {
      ...a,
      running,
      lastAt: at,
      status: keepsRunning ? 'running' : a.status === 'error' ? 'error' : status,
    }
  })

const rank = (status: Status) => (isUrgent(status) ? 0 : status === 'running' ? 1 : 2)

export const bandOrder = (list: readonly Activation[]): Activation[] =>
  [...list].sort((a, b) => rank(a.status) - rank(b.status) || b.lastAt - a.lastAt)

export type Settings = {
  enabled: boolean
  layout: Layout
  maxChips: number
  shown: Record<Kind, boolean>
}

const showOption: Record<Kind, string> = {
  skill: 'show_skills',
  agent: 'show_agents',
  mcp: 'show_mcp',
  perm: 'show_permissions',
  hook: 'show_hooks',
  rule: 'show_rules',
  command: 'show_commands',
  context: 'show_context',
  model: 'show_model',
  background: 'show_background',
}

export const resolveSettings = (
  options: Readonly<Record<string, unknown>>,
  overrides: Overrides | undefined,
): Settings => {
  const shown = {} as Record<Kind, boolean>
  for (const kind of KIND_ORDER) {
    const configured = options[showOption[kind]]
    const fallback = typeof configured === 'boolean' ? configured : !KINDS[kind].isOptional
    shown[kind] = overrides?.shown?.[kind] ?? fallback
  }
  const max = Number(options.max_chips)
  return {
    enabled: overrides?.enabled ?? options.enabled !== false,
    layout: overrides?.layout ?? (options.layout === 'summary' ? 'summary' : 'row'),
    maxChips: Number.isFinite(max) ? Math.min(20, Math.max(1, Math.round(max))) : 6,
    shown,
  }
}

export const bandCandidates = (
  list: readonly Activation[],
  settings: Settings,
  muted: readonly string[],
): Activation[] =>
  bandOrder(list).filter(
    a => isUrgent(a.status) || (settings.shown[a.kind] && !muted.includes(chipId(a))),
  )

export const paneGroups = (
  list: readonly Activation[],
  settings: Settings,
  filter: Kind | 'all',
): { kind: Kind; rows: Activation[] }[] =>
  KIND_ORDER.filter(kind => (filter === 'all' ? settings.shown[kind] : kind === filter))
    .map(kind => ({ kind, rows: bandOrder(list.filter(a => a.kind === kind)) }))
    .filter(group => group.rows.length > 0)
