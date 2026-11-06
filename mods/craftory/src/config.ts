import type {
  ConfigPatch,
  CraftoryConfig,
  IssueRef,
  Loaded,
  PhaseConfig,
  PhaseId,
  PrefOverrides,
  Prefs,
} from '../types'
import { type FileWrite, normalise } from './files'
import { isSafeRef } from './git'
import { PHASE_ORDER, PHASES } from './phases'
import { refSlug } from './tracker/refs'

export const CONFIG_PATH = '.craftory/config.json'
export const STORE_PREFS = 'prefs'

export const DEFAULT_CONFIG: CraftoryConfig = {
  version: 1,
  entry: {
    triage: { enabled: true, enterAt: 'bugs-build-else-align' },
    wayfinder: { suggest: 'long-grill' },
  },
  phases: Object.fromEntries(
    PHASE_ORDER.map((id): [PhaseId, PhaseConfig] => {
      const command = PHASES[id].commands[0]
      return [id, { enabled: true, gate: PHASES[id].defaultGate, ...(command && { command }) }]
    }),
  ) as Record<PhaseId, PhaseConfig>,
  tracker: {
    github: { specLabel: 'spec', ticketLabel: 'ticket' },
    gitlab: { instance: 'gitlab.com', project: '' },
  },
  docs: { research: 'docs/research/' },
  worktrees: {
    folder: '.claude/worktrees/',
    integrationBranch: 'feat/{spec-slug}',
    ticketBranch: 'craftory/{ticket}-{slug}',
    maxParallel: 3,
    tokenBudget: 80_000,
    setup: 'pnpm install --frozen-lockfile',
    copy: ['.env.local', '.tool-versions'],
    removeAfterMerge: true,
    rebaseOnMove: true,
    keepFailed: true,
    pruneStale: false,
  },
  automation: {
    suggestNext: true,
    liveAgents: true,
    underlineTerms: true,
    retroOnPr: false,
    handoffAt80: false,
    weeklyArchitecture: false,
  },
}

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

const ENUMS: Record<string, readonly string[]> = {
  'entry.triage.enterAt': ['align', 'bugs-build-else-align', 'tickets'],
  'entry.wayfinder.suggest': ['long-grill', 'on-ask'],
}
const RANGES: Record<string, readonly [number, number]> = {
  'worktrees.maxParallel': [1, 6],
  'worktrees.tokenBudget': [10_000, 1_000_000],
}

function overlay(defaults: unknown, raw: unknown, path: string, problems: string[]): unknown {
  if (isRecord(defaults)) {
    const source = isRecord(raw) ? raw : {}
    if (raw !== undefined && !isRecord(raw)) problems.push(`${path}: expected an object`)
    return Object.fromEntries(
      Object.entries(defaults).map(([k, d]) => [
        k,
        overlay(d, source[k], path ? `${path}.${k}` : k, problems),
      ]),
    )
  }
  if (raw === undefined) return defaults
  const range = RANGES[path]
  const allowed = ENUMS[path]
  const ok = Array.isArray(defaults)
    ? Array.isArray(raw) && raw.every(x => typeof x === 'string')
    : typeof raw === typeof defaults &&
      (range === undefined || (typeof raw === 'number' && Number.isFinite(raw))) &&
      (allowed === undefined || allowed.includes(raw as string))
  if (!ok) {
    problems.push(
      `${path}: expected ${Array.isArray(defaults) ? 'a list of strings' : typeof defaults}`,
    )
    return defaults
  }
  if (range !== undefined) return Math.min(range[1], Math.max(range[0], Math.round(raw as number)))
  return raw
}

export function parseConfig(raw: string | null): Loaded<CraftoryConfig> {
  if (raw === null) return { state: 'absent' }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    return { state: 'invalid', raw, problem: error instanceof Error ? error.message : 'not JSON' }
  }
  if (!isRecord(json)) return { state: 'invalid', raw, problem: 'expected a JSON object' }
  const problems: string[] = []
  const value = overlay(DEFAULT_CONFIG, json, '', problems) as CraftoryConfig
  for (const id of PHASE_ORDER) {
    const commands: readonly string[] = PHASES[id].commands
    const chosen =
      isRecord(json.phases) && isRecord(json.phases[id]) ? json.phases[id].command : undefined
    if (chosen !== undefined && !commands.includes(chosen as string)) {
      problems.push(`phases.${id}.command: not one of ${commands.join(', ') || 'none'}`)
    }
    const command = commands.includes(chosen as string) ? chosen : commands[0]
    value.phases[id] = {
      enabled: value.phases[id].enabled,
      gate: value.phases[id].gate,
      ...(command !== undefined && { command: command as PhaseConfig['command'] }),
    }
  }
  const templates = [
    ['integrationBranch', value.worktrees.integrationBranch, { '{spec-slug}': 'spec' }],
    ['ticketBranch', value.worktrees.ticketBranch, { '{ticket}': '1', '{slug}': 'slug' }],
  ] as const
  for (const [key, template, fill] of templates) {
    const sample = Object.entries(fill).reduce((t, [from, to]) => t.replace(from, to), template)
    if (isSafeRef(sample)) continue
    problems.push(`worktrees.${key}: not a safe branch name, using the default`)
    value.worktrees[key] = DEFAULT_CONFIG.worktrees[key]
  }
  if (normalise(value.worktrees.folder) === undefined) {
    problems.push('worktrees.folder: must be a relative folder inside the repo, using the default')
    value.worktrees.folder = DEFAULT_CONFIG.worktrees.folder
  }
  const text = problems.join('; ')
  return { state: 'ok', value, raw, ...(text && { problem: text }) }
}

function assign(base: Json, patch: Json): Json {
  for (const [k, v] of Object.entries(patch)) {
    const old = base[k]
    base[k] = isRecord(v) && isRecord(old) ? assign(old, v) : v
  }
  return base
}

export function patchConfig(raw: string | null, patch: ConfigPatch): string {
  const base: unknown = raw === null ? structuredClone(DEFAULT_CONFIG) : JSON.parse(raw)
  if (!isRecord(base)) throw new TypeError('config.json is not an object')
  return `${JSON.stringify(assign(base, patch as Json), null, 2)}\n`
}

export const configWrite = (raw: string | null): FileWrite[] =>
  raw === null ? [{ path: CONFIG_PATH, before: null, after: patchConfig(null, {}) }] : []

export const configOf = (loaded: Loaded<CraftoryConfig> | undefined): CraftoryConfig =>
  loaded?.state === 'ok' ? loaded.value : DEFAULT_CONFIG

export const isPhaseOn = (config: CraftoryConfig, skipped: readonly PhaseId[], phase: PhaseId) =>
  config.phases[phase].enabled && !skipped.includes(phase)

export function resolvePrefs(
  options: Readonly<Record<string, unknown>>,
  overrides: PrefOverrides | null,
): Prefs {
  const theme = options.theme === 'light' || options.theme === 'dark' ? options.theme : 'auto'
  return {
    rail: overrides?.rail ?? options.rail !== false,
    railLayout: overrides?.railLayout ?? (options.rail_layout === 'summary' ? 'summary' : 'row'),
    theme: overrides?.theme ?? theme,
    ascii: overrides?.ascii ?? options.ascii_glyphs === true,
  }
}

export function parsePrefOverrides(stored: unknown): PrefOverrides {
  if (!isRecord(stored)) return {}
  const { rail, railLayout, theme, ascii } = stored
  return {
    ...(typeof rail === 'boolean' && { rail }),
    ...(railLayout === 'row' || railLayout === 'summary' ? { railLayout } : {}),
    ...(theme === 'auto' || theme === 'light' || theme === 'dark' ? { theme } : {}),
    ...(typeof ascii === 'boolean' && { ascii }),
  }
}

export function slugify(title: string, maxWords = 6, maxChars = 48): string {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, maxWords)
  let slug = ''
  for (const word of words) {
    const next = slug === '' ? word : `${slug}-${word}`
    if (next.length > maxChars) break
    slug = next
  }
  return slug
}

export const integrationBranchFor = (config: CraftoryConfig, specTitle: string) =>
  config.worktrees.integrationBranch.replace('{spec-slug}', slugify(specTitle))

export const ticketBranchFor = (config: CraftoryConfig, ticket: string, title: string) =>
  config.worktrees.ticketBranch
    .replace('{ticket}', refSlug(ticket as IssueRef))
    .replace('{slug}', slugify(title, 4, 32))
