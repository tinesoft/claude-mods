import type { Issue, TrackerSnapshot, TriageLabels, TriageRole } from '../../types'
import type { ReadContext, ReadResult, TrackerSpec } from './index'
import * as links from './links'
import {
  bodyEdges,
  isSpecBody,
  isUnsupported,
  parseIssueRef,
  SPEC_LABEL,
  TICKET_LABEL,
} from './refs'
import {
  childrenIn,
  isRecord,
  type Json,
  type Links,
  mapsIn,
  namesOf,
  type Row,
  rowFrom,
  str,
} from './rows'

const MAX_LOOKUPS = 40

/** Every issue of the project, closed ones too, as the GitLab REST issue objects. */
export const listIssuesArgv = () =>
  ['glab', 'issue', 'list', '--all', '--per-page', '100', '--output', 'json'] as const

/** The links of one issue; `:id` is filled in by `glab` from the clone. */
export const linksArgv = (iid: number) =>
  ['glab', 'api', `projects/:id/issues/${iid}/links`, '--paginate'] as const

function arrayOf(stdout: string): unknown[] | null {
  try {
    const json: unknown = JSON.parse(stdout.trim() === '' ? '[]' : stdout)
    return Array.isArray(json) ? json : null
  } catch {
    return null
  }
}

function rowOf(raw: unknown): Row | null {
  if (!isRecord(raw) || typeof raw.iid !== 'number') return null
  return rowFrom({
    number: raw.iid,
    title: raw.title,
    body: raw.description,
    labels: Array.isArray(raw.labels)
      ? raw.labels.filter((l): l is string => typeof l === 'string')
      : [],
    closed: str(raw.state) === 'closed',
    assignee: namesOf(raw.assignees, 'username')[0],
    updated: raw.updated_at,
    created: raw.created_at,
    url: raw.web_url,
  })
}

const runs = (results: readonly ReadResult[]) => results.flatMap(r => (r.kind === 'run' ? [r] : []))

const listed = (results: readonly ReadResult[]): { rows: Row[]; raw: Json[] } | null => {
  const list = runs(results).find(r => r.argv[1] === 'issue' && r.exitCode === 0)
  const parsed = list && arrayOf(list.stdout)
  if (!parsed) return null
  const records = parsed.filter(isRecord)
  return { rows: records.flatMap(r => rowOf(r) ?? []), raw: records }
}

/**
 * What each `glab api .../links` answered, by issue: the issues blocking it, none when the plan
 * has no such links, or null when the lookup failed and so said nothing.
 */
function blockersOf(results: readonly ReadResult[]): Links {
  return new Map(
    runs(results).flatMap((r): [number, number[] | null][] => {
      const n = /^projects\/[^/]+\/issues\/(\d+)\/links$/.exec(r.argv[2] ?? '')?.[1]
      if (n === undefined) return []
      const rows = r.exitCode === 0 ? arrayOf(r.stdout) : null
      return [
        [
          Number(n),
          rows === null
            ? r.exitCode !== 0 && isUnsupported(r.stderr)
              ? []
              : null
            : rows.flatMap(l =>
                isRecord(l) && l.link_type === 'is_blocked_by' && typeof l.iid === 'number'
                  ? [l.iid]
                  : [],
              ),
        ],
      ]
    }),
  )
}

const roleOf = (names: readonly string[], labels: TriageLabels): TriageRole | null =>
  (Object.keys(labels) as TriageRole[]).find(r => names.includes(labels[r])) ?? null

function issuesOf(ctx: ReadContext, rows: readonly Row[], blocked: Links): Issue[] {
  return rows
    .flatMap((row): Issue[] => {
      const ref = parseIssueRef(String(row.number))
      if (!ref) return []
      const edges = bodyEdges(row.body)
      const native = blocked.get(row.number) ?? []
      const isSpec = row.labels.includes(SPEC_LABEL) || isSpecBody(row.body)
      return [
        {
          ref,
          title: row.title,
          kind: isSpec
            ? 'spec'
            : edges.parent !== null || row.labels.includes(TICKET_LABEL)
              ? 'ticket'
              : 'issue',
          status: row.closed ? 'done' : 'open',
          role: roleOf(row.labels, ctx.labels),
          parent: edges.parent,
          blockedBy:
            native.length > 0
              ? native.flatMap(n => parseIssueRef(String(n)) ?? [])
              : edges.blockedBy,
          isBug: row.labels.some(n => n.toLowerCase() === 'bug'),
          createdAt: null,
          location: row.url,
        },
      ]
    })
    .sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)))
}

/**
 * GitLab reads like GitHub: the `wayfinder:map` label, `Part of #<map>` lines and native blocking
 * links, with a `Blocked by:` line as the fallback. When `glab` cannot list the issues the tracker
 * stays links-only.
 */
export const spec: TrackerSpec = {
  ...links.gitlab,
  rich: true,
  steps: 2,
  plan: (_ctx, previous) => {
    if (previous.length === 0) return [{ kind: 'run', argv: listIssuesArgv() }]
    if (runs(previous).some(r => r.argv[1] === 'api')) return []
    const all = listed(previous)
    if (all === null) return []
    return [...new Set([...childrenIn(all.rows, new Map()).values()].flat())]
      .slice(0, MAX_LOOKUPS)
      .map(n => ({ kind: 'run' as const, argv: linksArgv(n) }))
  },
  parse: (ctx, results): TrackerSnapshot => {
    const all = listed(results)
    if (all === null) return links.gitlab.parse(ctx, results)
    const blocked = blockersOf(results)
    return {
      kind: 'gitlab',
      rich: true,
      issues: issuesOf(ctx, all.rows, blocked),
      maps: mapsIn(all.rows, new Map(), blocked, 'gitlab'),
      pr: null,
      at: ctx.now,
      problem: null,
    }
  },
  touches: (_ctx, tool) =>
    tool.name === 'Bash' && /\b(?:glab\s+(?:issue|mr|api)|git\s+push)\b/.test(tool.command ?? ''),
}
