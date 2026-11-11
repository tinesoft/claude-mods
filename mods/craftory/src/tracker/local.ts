import type { Issue, IssueRef, IssueStatus, TriageLabels, TriageRole } from '../../types'
import type { ReadResult, TrackerSpec } from './index'
import { mapOf, type MapPlan } from './local-map'
import { blockersOf, byNumber, storiesIn, upstreamLine } from './refs'

const ROLE_BY_NAME = (labels: TriageLabels, text: string): TriageRole | null => {
  const roles = Object.keys(labels) as TriageRole[]
  return roles.find(r => labels[r] === text) ?? roles.find(r => r === text) ?? null
}

function statusOf(
  raw: string,
  labels: TriageLabels,
): { status: IssueStatus; role: TriageRole | null } {
  const text = raw.trim().toLowerCase()
  if (text === 'in-progress' || text === 'in progress') return { status: 'in-progress', role: null }
  // `resolved` is how wayfinder and this repo's tickets mark one finished (local-map.ts reads it so too).
  if (text === 'done' || text === 'resolved') return { status: 'done', role: null }
  if (text === 'closed') return { status: 'closed', role: null }
  const role = ROLE_BY_NAME(labels, text)
  return { status: role === 'wontfix' ? 'closed' : 'open', role }
}

const SCRATCH = '.scratch/'

type Planned = {
  feature: string
  path: string
  kind: 'spec' | 'ticket'
  n?: string
  hasSpec: boolean
  mtimeMs: number
}

const dirsOf = (result: ReadResult | undefined) =>
  result?.kind === 'list'
    ? (result.entries ?? [])
        .filter(e => e.kind === 'dir')
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

const filesOf = (result: ReadResult | undefined) =>
  result?.kind === 'list' ? (result.entries ?? []).filter(e => e.kind === 'file') : []

const numbered = (tickets: ReturnType<typeof filesOf>) =>
  tickets
    .flatMap(e => {
      const n = /^(\d+)-.*\.md$/.exec(e.name)?.[1]
      return n === undefined ? [] : [{ e, n }]
    })
    .sort((a, b) => Number(a.n) - Number(b.n))

/**
 * The map folders, once every folder has been listed: those with a `map.md`, a `spec.md` beside
 * it or not. Whether one is a map is up to the text of its `map.md`.
 */
function plannedMaps(results: readonly ReadResult[]): MapPlan[] {
  return dirsOf(results[0]).flatMap((dir, i): MapPlan[] => {
    const own = filesOf(results[1 + 2 * i])
    const map = own.find(e => e.name === 'map.md')
    if (map === undefined) return []
    return [
      {
        effort: dir.name,
        map: { path: `${SCRATCH}${dir.name}/map.md`, mtimeMs: map.mtimeMs },
        tickets: numbered(filesOf(results[2 + 2 * i])).map(({ e, n }) => ({
          path: `${SCRATCH}${dir.name}/issues/${e.name}`,
          n,
          mtimeMs: e.mtimeMs,
        })),
      },
    ]
  })
}

/** The files to read once every feature folder has been listed. */
function plannedReads(results: readonly ReadResult[]): Planned[] {
  return dirsOf(results[0]).flatMap((dir, i): Planned[] => {
    const own = filesOf(results[1 + 2 * i])
    const tickets = filesOf(results[2 + 2 * i])
    const spec = own.find(e => e.name === 'spec.md')
    if (spec === undefined && own.some(e => e.name === 'map.md')) return []
    return [
      ...(spec
        ? [
            {
              feature: dir.name,
              path: `${SCRATCH}${dir.name}/spec.md`,
              kind: 'spec' as const,
              hasSpec: true,
              mtimeMs: spec.mtimeMs,
            },
          ]
        : []),
      ...numbered(tickets).map(({ e, n }) => ({
        feature: dir.name,
        path: `${SCRATCH}${dir.name}/issues/${e.name}`,
        kind: 'ticket' as const,
        hasSpec: spec !== undefined,
        n,
        mtimeMs: e.mtimeMs,
      })),
    ]
  })
}

function scratchIssue(file: Planned, text: string, labels: TriageLabels): Issue {
  const body = text
  const head = body.split('\n').slice(0, 60).join('\n')
  const heading = /^# (.+?)\s*$/m.exec(body)?.[1]?.replace(/^\d+:\s*/, '')
  const { status, role } = statusOf(upstreamLine('Status').exec(head)?.[1] ?? '', labels)
  const isSpec = file.kind === 'spec'
  return {
    ref: (isSpec ? file.feature : `${file.feature}/${file.n}`) as IssueRef,
    title: heading ?? file.feature.replace(/-/g, ' '),
    kind: isSpec ? 'spec' : file.hasSpec ? 'ticket' : 'issue',
    status,
    role,
    parent: isSpec || !file.hasSpec ? null : (file.feature as IssueRef),
    blockedBy: isSpec
      ? []
      : blockersOf(upstreamLine('Blocked by').exec(head)?.[1] ?? '', file.feature),
    isBug: upstreamLine('Type').exec(head)?.[1]?.toLowerCase() === 'bug',
    ...(isSpec && { stories: storiesIn(body) }),
    createdAt: file.mtimeMs,
    location: file.path,
  }
}

/** The Local tracker as Matt's skills write it: `.scratch/<feature>/spec.md` and `issues/NN-*.md`. */
export const spec: TrackerSpec = {
  label: 'Local Markdown',
  rich: true,
  steps: 3,
  plan: (_ctx, previous) => {
    if (previous.length === 0) return [{ kind: 'list', dir: SCRATCH }]
    if (previous.length === 1)
      return dirsOf(previous[0]).flatMap(d => [
        { kind: 'list' as const, dir: `${SCRATCH}${d.name}/` },
        { kind: 'list' as const, dir: `${SCRATCH}${d.name}/issues/` },
      ])
    return [
      ...plannedReads(previous).map(f => f.path),
      ...plannedMaps(previous).flatMap(m => [m.map.path, ...m.tickets.map(t => t.path)]),
    ].map(path => ({ kind: 'read' as const, path }))
  },
  parse: (ctx, results) => {
    const offset = 1 + 2 * dirsOf(results[0]).length
    const problems: string[] = []
    const issues = plannedReads(results).flatMap((file, i) => {
      const read = results[offset + i]
      if (read?.kind !== 'read' || read.text === null) {
        problems.push(`${file.path}: unreadable`)
        return []
      }
      return [scratchIssue(file, read.text, ctx.labels)]
    })
    let next = offset + plannedReads(results).length
    const textAt = (): string | null => {
      const read = results[next++]
      return read?.kind === 'read' ? read.text : null
    }
    const maps = plannedMaps(results).flatMap(plan => {
      const map = mapOf(plan, { map: textAt(), tickets: plan.tickets.map(textAt) })
      return map === null ? [] : [map]
    })
    return {
      kind: 'local',
      rich: true,
      issues: issues.sort(byNumber),
      maps,
      pr: null,
      at: ctx.now,
      problem: problems.length > 0 ? problems.join('; ') : null,
    }
  },
  touches: (_ctx, tool) => {
    if (tool.name === 'Write' || tool.name === 'Edit') return tool.path?.includes(SCRATCH) === true
    return tool.name === 'Bash' && tool.command?.includes(SCRATCH) === true
  },
  header: () => `Local Markdown · ${SCRATCH}`,
}
