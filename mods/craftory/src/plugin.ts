import type { PluginStatus, SkillName } from '../types'
import { INSTALL_ID, KNOWN_SKILLS, PLUGIN, TESTED_RANGE } from './phases'

export type CommandRow = { name: string; source: string; plugin?: string }

export const LIST_ARGV = ['claude', 'plugin', 'list', '--json'] as const

export const INSTALL_ARGV = ['claude', 'plugin', 'install', INSTALL_ID] as const
export const UPDATE_ARGV = ['claude', 'plugin', 'update', INSTALL_ID] as const
export const INSTALL_TIMEOUT_MS = 300_000
export const PROBE_TIMEOUT_MS = 10_000

const shortName = (command: string) => command.slice(command.indexOf(':') + 1)

const lastSegment = (command: string) => command.slice(command.lastIndexOf(':') + 1)

export function pluginStatus(args: {
  commands: readonly CommandRow[]
  listJson: string | null
  skillPath?: string
}): PluginStatus {
  const own = args.commands.filter(c => c.plugin === PLUGIN)
  if (own.length === 0) return { kind: 'missing' }
  const skills = own.map(c => shortName(c.name) as SkillName)
  const version = parsePluginList(args.listJson) ?? versionFromSkillPath(args.skillPath)
  return {
    kind: 'present',
    version,
    inRange: version === null ? null : inTestedRange(version),
    hasDuplicates: args.commands.some(c => c.plugin !== PLUGIN && skills.some(s => s === c.name)),
    skills,
    shadowed: KNOWN_SKILLS.filter(skill =>
      args.commands.some(c => c.plugin !== PLUGIN && lastSegment(c.name) === skill),
    ),
  }
}

/**
 * Whether a bare `/name` is Matt's skill: the plugin is installed and no other source owns the
 * name. With the plugin missing, a bare `/code-review` can only be someone else's.
 */
export const bareIsOurs =
  (status: PluginStatus) =>
  (skill: string): boolean =>
    status.kind === 'present' && !status.shadowed.some(s => s === skill)

type Numbers = [number, number, number]
const parseVersion = (text: string): { nums: Numbers; isPre: boolean } | undefined => {
  const match = /^(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?(?:\+.*)?$/.exec(text.trim())
  return match
    ? {
        nums: [Number(match[1]), Number(match[2]), Number(match[3])],
        isPre: match[4] !== undefined,
      }
    : undefined
}

function compare(a: string, b: string): number {
  const [x, y] = [parseVersion(a), parseVersion(b)]
  if (!x || !y) return 0
  for (const i of [0, 1, 2] as const) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i]
  return Number(!x.isPre) - Number(!y.isPre)
}

/**
 * `claude plugin list --json` is an array with one row per install scope. Rows for any
 * `mattpocock-skills@<marketplace>` count (both `claude-plugins-official` and `mattpocock`
 * exist); enabled rows win, then the highest version. Unknown shapes give null.
 */
export function parsePluginList(stdout: string | null): string | null {
  if (stdout === null) return null
  let rows: unknown
  try {
    rows = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(rows)) return null
  const found = rows.flatMap((row: unknown) => {
    if (typeof row !== 'object' || row === null) return []
    const { id, version, enabled } = row as Record<string, unknown>
    return typeof id === 'string' &&
      id.split('@')[0] === PLUGIN &&
      typeof version === 'string' &&
      parseVersion(version)
      ? [{ version, enabled: enabled === true }]
      : []
  })
  const pool = found.some(f => f.enabled) ? found.filter(f => f.enabled) : found
  return (
    pool
      .map(f => f.version)
      .sort(compare)
      .at(-1) ?? null
  )
}

export function versionFromSkillPath(path: string | undefined): string | null {
  const match = path ? new RegExp(`/${PLUGIN}/(\\d+\\.\\d+\\.\\d+[^/]*)/`).exec(path) : null
  return match?.[1] ?? null
}

export const inTestedRange = (version: string) =>
  parseVersion(version) !== undefined &&
  compare(version, TESTED_RANGE.min) >= 0 &&
  compare(version, TESTED_RANGE.below) < 0 &&
  !(parseVersion(version)!.isPre && compare(version.replace(/-.*/, ''), TESTED_RANGE.below) === 0)

export const hasSkill = (status: PluginStatus, skill: string) =>
  status.kind === 'present' && status.skills.some(s => s === skill)

export function pluginLine(status: PluginStatus): string {
  switch (status.kind) {
    case 'checking':
      return `${PLUGIN}: checking`
    case 'missing':
      return `${PLUGIN} is not installed · tested with ${TESTED_RANGE.label}`
    case 'present':
      return `${PLUGIN} ${status.version ?? '(version unknown)'} installed · tested with ${TESTED_RANGE.label}`
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export function installOutcome(result: {
  exitCode: number
  stdout: string
  stderr: string
}): { ok: true } | { ok: false; message: string } {
  if (result.exitCode === 0) return { ok: true }
  const line = [result.stderr, result.stdout].map(s => s.trim().split('\n')[0] ?? '').find(Boolean)
  return { ok: false, message: line ?? `exit code ${result.exitCode}` }
}
