/**
 * mattpocock-skills detection, version range and install (plan M1 findings). Inputs are plain
 * data the shell gathered: `$.command.list()` rows, `claude plugin list --json` stdout, a
 * `skill.prompt` path.
 */
import type { PluginStatus, SkillName } from '../types'
import { INSTALL_ID, PLUGIN, TESTED_RANGE } from './phases'

export type CommandRow = { name: string; source: string; plugin?: string }

/** The version probe (CLI only; a failure leaves the version unknown, not the plugin missing). */
export const LIST_ARGV = ['claude', 'plugin', 'list', '--json'] as const

/** Run only after the user presses Install or Update. */
export const INSTALL_ARGV = ['claude', 'plugin', 'install', INSTALL_ID] as const
export const UPDATE_ARGV = ['claude', 'plugin', 'update', INSTALL_ID] as const
export const INSTALL_TIMEOUT_MS = 300_000
export const PROBE_TIMEOUT_MS = 10_000

const shortName = (command: string) => command.slice(command.indexOf(':') + 1)

/**
 * Presence comes from `$.command.list()` (rows with `plugin === 'mattpocock-skills'`); the
 * version from the CLI listing, else from a skill path. Duplicates are the same short skill
 * also listed from a non-plugin source (an `npx skills` copy).
 */
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
  }
}

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

/** Negative when a sorts before b. A pre-release sorts before its release. */
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

/** `.../mattpocock-skills/1.3.1/skills/engineering/to-spec/SKILL.md` gives `1.3.1`. */
export function versionFromSkillPath(path: string | undefined): string | null {
  const match = path ? new RegExp(`/${PLUGIN}/(\\d+\\.\\d+\\.\\d+[^/]*)/`).exec(path) : null
  return match?.[1] ?? null
}

/** `>=1.3.0 <1.4.0`. A pre-release of 1.3.0 sorts below the range, and one of 1.4.0 is the untested next line. */
export const inTestedRange = (version: string) =>
  parseVersion(version) !== undefined &&
  compare(version, TESTED_RANGE.min) >= 0 &&
  compare(version, TESTED_RANGE.below) < 0 &&
  !(parseVersion(version)!.isPre && compare(version.replace(/-.*/, ''), TESTED_RANGE.below) === 0)

/** A skill present in the installed plugin (setup asks about triage labels only when `triage` is). */
export const hasSkill = (status: PluginStatus, skill: string) =>
  status.kind === 'present' && status.skills.some(s => s === skill)

/** `mattpocock-skills 1.3.1 installed · tested with 1.3.x` for the Settings header. */
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

/** Install result from `$.process.run`: the restart prompt, or a one-line failure message. */
export function installOutcome(result: {
  exitCode: number
  stdout: string
  stderr: string
}): { ok: true } | { ok: false; message: string } {
  if (result.exitCode === 0) return { ok: true }
  const line = [result.stderr, result.stdout].map(s => s.trim().split('\n')[0] ?? '').find(Boolean)
  return { ok: false, message: line ?? `exit code ${result.exitCode}` }
}
