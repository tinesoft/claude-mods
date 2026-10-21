import type { Activation, ChipTheme, Kind, Overrides, Settings, Status, Toggle } from '../types'
import { isUrgent, KIND_ORDER, TOGGLE_ORDER, TOGGLES } from './theme'

export type Observed = Omit<Activation, 'count' | 'firstAt' | 'lastAt' | 'runningAgentIds'> & {
  startedAgentId?: string
}

const MAX_ACTIVATIONS = 500

const trim = (list: Activation[]) => {
  if (list.length <= MAX_ACTIVATIONS) return list
  const oldest = list.findIndex(a => !isUrgent(a.status))
  return list.filter((_, i) => i !== (oldest === -1 ? 0 : oldest))
}

export const chipId = (a: Pick<Activation, 'kind' | 'key'>) => `${a.kind}:${a.key}`

const mergeMeta = (old: string | undefined, next: string | undefined) => {
  if (next === undefined || old === next) return old ?? next
  if (old === undefined) return next
  const parts = old.split(' · ')
  return parts.includes(next) ? old : [...parts, next].join(' · ')
}

/** `counted` 0 settles a chip already counted at its start, as a hook's outcome follows its run. */
export const record = (
  list: readonly Activation[],
  seen: Observed,
  at: number,
  counted = 1,
): Activation[] => {
  const { startedAgentId, ...fields } = seen
  const index = list.findIndex(a => a.kind === seen.kind && a.key === seen.key)
  if (index === -1) {
    const fresh: Activation = { ...fields, count: 1, firstAt: at, lastAt: at }
    if (startedAgentId !== undefined) fresh.runningAgentIds = [startedAgentId]
    return trim([...list, fresh])
  }
  const old = list[index]!
  const running =
    startedAgentId === undefined
      ? old.runningAgentIds
      : [...(old.runningAgentIds ?? []), startedAgentId]
  const hasRecovered = seen.kind === 'mcp' && old.status === 'error' && seen.status === 'ok'
  const keepsUrgent = isUrgent(old.status) && !isUrgent(seen.status) && !hasRecovered
  const merged: Activation = {
    ...old,
    ...fields,
    detail: keepsUrgent ? old.detail : fields.detail,
    meta: seen.kind === 'mcp' ? mergeMeta(old.meta, seen.meta) : (seen.meta ?? old.meta),
    count: old.count + counted,
    lastAt: at,
    status: keepsUrgent ? old.status : running?.length ? 'running' : seen.status,
  }
  if (running !== undefined) merged.runningAgentIds = running
  return list.map((a, i) => (i === index ? merged : a))
}

export const settleAsked = (
  list: readonly Activation[],
  callId: string,
  hasRun: boolean,
  at: number,
): Activation[] =>
  list.map(({ askedCallId, ...a }) => {
    if (askedCallId !== callId) return askedCallId === undefined ? a : { ...a, askedCallId }
    return {
      ...a,
      label: hasRun ? `Allowed: ${a.label}` : a.label,
      status: hasRun ? 'ok' : 'denied',
      lastAt: at,
      detail: hasRun
        ? 'Asked for permission, and it ran.'
        : 'Asked for permission, and it did not run.',
    }
  })

export const finishAgent = (
  list: readonly Activation[],
  agentId: string,
  status: Status,
  at: number,
): Activation[] =>
  list.map(a => {
    if (!a.runningAgentIds?.includes(agentId)) return a
    const running = a.runningAgentIds.filter(id => id !== agentId)
    const keepsRunning = running.length > 0
    return {
      ...a,
      runningAgentIds: running,
      lastAt: at,
      status: keepsRunning ? 'running' : a.status === 'error' ? 'error' : status,
    }
  })

const rank = (status: Status) => (isUrgent(status) ? 0 : status === 'running' ? 1 : 2)

export const bandOrder = (list: readonly Activation[]): Activation[] =>
  [...list].sort((a, b) => rank(a.status) - rank(b.status) || b.lastAt - a.lastAt)

const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

const chipTheme = (value: unknown): ChipTheme =>
  value === 'light' || value === 'dark' ? value : 'auto'

export const resolveSettings = (
  options: Readonly<Record<string, unknown>>,
  overrides: Overrides | undefined,
): Settings => {
  const shown = {} as Record<Toggle, boolean>
  for (const toggle of TOGGLE_ORDER) {
    const { option, optional } = TOGGLES[toggle]
    shown[toggle] = overrides?.shown?.[toggle] ?? flag(options[option], !optional)
  }
  const max = Number(options.max_chips)
  return {
    enabled: overrides?.enabled ?? options.enabled !== false,
    layout: overrides?.layout ?? (options.layout === 'summary' ? 'summary' : 'row'),
    maxChips: Number.isFinite(max) ? Math.min(20, Math.max(1, Math.round(max))) : 6,
    chipStyle: overrides?.chipStyle ?? (options.chip_style === 'text' ? 'text' : 'tinted'),
    chipTheme: overrides?.chipTheme ?? chipTheme(options.chip_theme),
    hotkeys: overrides?.hotkeys ?? flag(options.chip_hotkeys, false),
    toastOnBlock: overrides?.toastOnBlock ?? flag(options.toast_on_block, true),
    textSummary: overrides?.textSummary ?? flag(options.text_summary, false),
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

/** Hidden types still list their stopped and errored chips, which the band always shows. */
export const inPane = (a: Activation, settings: Settings) =>
  settings.shown[a.kind] || isUrgent(a.status)

export const paneGroups = (
  list: readonly Activation[],
  settings: Settings,
  filter: Kind | 'all',
): { kind: Kind; rows: Activation[] }[] =>
  KIND_ORDER.filter(kind => filter === 'all' || kind === filter)
    .map(kind => ({
      kind,
      rows: bandOrder(list.filter(a => a.kind === kind && inPane(a, settings))),
    }))
    .filter(group => group.rows.length > 0)

export const startedAgo = (list: readonly Activation[], now: number) =>
  list.length === 0 ? 0 : now - Math.min(...list.map(a => a.firstAt))

export const sampleActivations = (settings: Settings, at: number): Activation[] =>
  KIND_ORDER.filter(kind => settings.shown[kind]).map((kind, index) => ({
    kind,
    key: TOGGLES[kind].example,
    label: TOGGLES[kind].example,
    detail: TOGGLES[kind].description,
    ...(index === 0 && settings.shown.plugin && { plugin: 'acme-devtools' }),
    status: 'ok',
    count: 1,
    firstAt: at,
    lastAt: at - 60_000,
  }))
