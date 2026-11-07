import type {
  Issue,
  IssueRef,
  IssueStatus,
  PullRequest,
  TrackerSnapshot,
  TriageLabels,
  TriageRole,
} from '../../types'
import { isSafeRef } from '../git'
import { githubMaps, type Links, mapChildren } from './github-map'
import type { ReadContext, ReadResult, TrackerSpec } from './index'
import { isSpecBody, isUnsupported, parseIssueRef, refsIn, storiesIn } from './refs'

const ISSUE_FIELDS = 'number,title,body,labels,state,stateReason,createdAt,updatedAt,assignees,url'
const MAX_ISSUES = 200
const MAX_LOOKUPS = 20

export const listIssuesArgv = (limit = MAX_ISSUES) =>
  [
    'gh',
    'issue',
    'list',
    '--state',
    'all',
    '--limit',
    String(limit),
    '--json',
    ISSUE_FIELDS,
  ] as const

/** `{owner}/{repo}` is filled in by `gh` from the clone. */
export const subIssuesArgv = (spec: number) =>
  ['gh', 'api', `repos/{owner}/{repo}/issues/${spec}/sub_issues`, '--paginate'] as const

export const dependenciesArgv = (issue: number) =>
  [
    'gh',
    'api',
    `repos/{owner}/{repo}/issues/${issue}/dependencies/blocked_by`,
    '--paginate',
  ] as const

export const prViewArgv = (branch: string) =>
  [
    'gh',
    'pr',
    'view',
    branch,
    '--json',
    'number,url,headRefName,baseRefName,isDraft,state',
  ] as const

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown) => (typeof v === 'string' ? v : undefined)

/** `--paginate` prints one array per page, back to back. */
function parseArrays(stdout: string): unknown[] | undefined {
  const trimmed = stdout.trim()
  if (trimmed === '') return []
  try {
    const whole: unknown = JSON.parse(trimmed)
    return Array.isArray(whole) ? whole : undefined
  } catch {
    try {
      const pages: unknown = JSON.parse(`[${trimmed.replace(/\]\s*\[/g, '],[')}]`)
      return Array.isArray(pages) ? pages.flat() : undefined
    } catch {
      return undefined
    }
  }
}

export function bodyEdges(body: string): { blockedBy: IssueRef[]; parent: IssueRef | null } {
  const head = body.split('\n').slice(0, 40).join('\n')
  const blocked = /^(?:\*\*)?Blocked by:(?:\*\*)?[ \t]*(.*)$/im.exec(head)?.[1] ?? ''
  const parent = /^(?:\*\*)?(?:Part of|Parent):?(?:\*\*)?[ \t]*(#\d+)/im.exec(head)?.[1]
  return {
    blockedBy: /none/i.test(blocked) ? [] : refsIn(blocked),
    parent: parent ? (parseIssueRef(parent) ?? null) : null,
  }
}

const roleOf = (names: readonly string[], labels: TriageLabels): TriageRole | null => {
  const roles = Object.keys(labels) as TriageRole[]
  return roles.find(r => names.includes(labels[r])) ?? null
}

function statusOf(state: string | undefined, reason: string | undefined): IssueStatus {
  if (state?.toUpperCase() !== 'CLOSED') return 'open'
  return reason?.toUpperCase() === 'NOT_PLANNED' ? 'closed' : 'done'
}

export function parseIssueList(
  stdout: string,
  labels: TriageLabels,
  specLabel: string,
  ticketLabel: string,
): Issue[] | { problem: string } {
  const rows = parseArrays(stdout)
  if (rows === undefined) return { problem: 'gh issue list: not JSON' }
  return rows.flatMap((row): Issue[] => {
    if (!isRecord(row) || typeof row.number !== 'number') return []
    const ref = parseIssueRef(String(row.number))
    if (!ref) return []
    const body = text(row.body) ?? ''
    const names = Array.isArray(row.labels)
      ? row.labels.flatMap(l => (isRecord(l) && text(l.name) ? [text(l.name)!] : []))
      : []
    const { blockedBy, parent } = bodyEdges(body)
    const isSpec =
      names.includes(specLabel) || isSpecBody(body) || /^---\s*\ntype:\s*spec\b/.test(body)
    const created = Date.parse(text(row.createdAt) ?? '')
    return [
      {
        ref,
        title: text(row.title) ?? '',
        kind: isSpec ? 'spec' : parent !== null || names.includes(ticketLabel) ? 'ticket' : 'issue',
        status: statusOf(text(row.state), text(row.stateReason)),
        role: roleOf(names, labels),
        parent,
        blockedBy,
        isBug: names.some(n => n.toLowerCase() === 'bug'),
        ...(isSpec && { stories: storiesIn(body) }),
        createdAt: Number.isNaN(created) ? null : created,
        location: text(row.url) ?? '',
      },
    ]
  })
}

const numbersIn = (stdout: string): number[] =>
  (parseArrays(stdout) ?? []).flatMap(row =>
    isRecord(row) && typeof row.number === 'number' ? [row.number] : [],
  )

export function applySubIssues(issues: Issue[], spec: IssueRef, stdout: string): Issue[] {
  const children = new Set(numbersIn(stdout).map(n => `#${n}`))
  return issues.map(i =>
    children.has(i.ref) ? { ...i, parent: spec, kind: i.kind === 'spec' ? i.kind : 'ticket' } : i,
  )
}

export function applyDependencies(issues: Issue[], issue: IssueRef, stdout: string): Issue[] {
  const blockers = numbersIn(stdout).flatMap(n => parseIssueRef(String(n)) ?? [])
  return issues.map(i => (i.ref === issue ? { ...i, blockedBy: blockers } : i))
}

export function parsePr(stdout: string): PullRequest | null {
  let json: unknown
  try {
    json = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!isRecord(json) || typeof json.number !== 'number') return null
  const ref = parseIssueRef(String(json.number))
  const state = text(json.state)?.toLowerCase()
  if (!ref || (state !== 'open' && state !== 'merged' && state !== 'closed')) return null
  return {
    ref,
    url: text(json.url) ?? '',
    branch: text(json.headRefName) ?? '',
    base: text(json.baseRefName) ?? '',
    isDraft: json.isDraft === true,
    state,
  }
}

const runs = (results: readonly ReadResult[]) => results.flatMap(r => (r.kind === 'run' ? [r] : []))

const issueNumber = (argv: readonly string[]) =>
  /\/issues\/(\d+)\/(?:sub_issues|dependencies)/.exec(argv[2] ?? '')?.[1]

/**
 * What each `gh api` call answered, by issue number: the numbers it listed, none when the host has
 * no such endpoint, or null when the lookup failed and so said nothing.
 */
function linksOf(results: readonly ReadResult[], suffix: string): Links {
  return new Map(
    runs(results).flatMap((r): [number, number[] | null][] => {
      const n = issueNumber(r.argv)
      if (n === undefined || !r.argv[2]?.endsWith(suffix)) return []
      const answer = r.exitCode === 0 ? numbersIn(r.stdout) : isUnsupported(r.stderr) ? [] : null
      return [[Number(n), answer]]
    }),
  )
}

function rawRows(results: readonly ReadResult[]): unknown[] {
  const list = runs(results).find(r => r.argv[1] === 'issue' && r.exitCode === 0)
  return (list && parseArrays(list.stdout)) || []
}

function childrenOf(issues: readonly Issue[], results: readonly ReadResult[]): IssueRef[] {
  const found = new Set<IssueRef>()
  for (const r of runs(results)) {
    if (!r.argv[2]?.endsWith('/sub_issues')) continue
    for (const n of numbersIn(r.stdout)) found.add(`#${n}` as IssueRef)
  }
  for (const i of issues) if (i.parent !== null) found.add(i.ref)
  return [...found]
}

export const spec: TrackerSpec = {
  label: 'GitHub Issues',
  rich: true,
  steps: 3,
  plan: (ctx, previous) => {
    const focused = ctx.focus?.branch
    const branch = focused && isSafeRef(focused) ? focused : null
    const specs = ctx.focus?.specs ?? []
    if (previous.length === 0) {
      return [
        { kind: 'run', argv: listIssuesArgv() },
        ...(branch ? [{ kind: 'run' as const, argv: prViewArgv(branch) }] : []),
      ]
    }
    const done = runs(previous)
    const has = (suffix: string) => done.some(r => r.argv[2]?.endsWith(suffix))
    if (has('/blocked_by')) return []
    const targets = [
      ...new Set([
        ...specs.map(ref => Number(ref.slice(1))),
        ...mapChildren(rawRows(previous), new Map()).keys(),
      ]),
    ]
    if (!has('/sub_issues') && targets.length > 0) {
      return targets
        .slice(0, MAX_LOOKUPS)
        .map(n => ({ kind: 'run' as const, argv: subIssuesArgv(n) }))
    }
    const issues = listed(ctx, previous)
    // a map's children always ask for native links; a body's Blocked by line is only the fallback
    const mapKids = new Set(
      [...mapChildren(rawRows(previous), linksOf(previous, '/sub_issues')).values()]
        .flat()
        .map(n => `#${n}` as IssueRef),
    )
    return [...new Set([...childrenOf(issues, previous), ...mapKids])]
      .filter(ref => mapKids.has(ref) || issues.find(i => i.ref === ref)?.blockedBy.length === 0)
      .slice(0, MAX_LOOKUPS)
      .map(ref => ({ kind: 'run' as const, argv: dependenciesArgv(Number(ref.slice(1))) }))
  },
  parse: (ctx, results): TrackerSnapshot => {
    const list = listed(ctx, results)
    const problem = listProblem(ctx, results)
    let issues = list
    for (const r of runs(results)) {
      if (r.exitCode !== 0) continue
      const n = issueNumber(r.argv)
      if (n === undefined) continue
      issues = r.argv[2]?.endsWith('/sub_issues')
        ? applySubIssues(issues, `#${n}` as IssueRef, r.stdout)
        : applyDependencies(issues, `#${n}` as IssueRef, r.stdout)
    }
    const pr = runs(results).find(r => r.argv[1] === 'pr' && r.exitCode === 0)
    return {
      kind: 'github',
      rich: true,
      issues: issues.sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1))),
      maps: githubMaps(
        rawRows(results),
        linksOf(results, '/sub_issues'),
        linksOf(results, '/blocked_by'),
      ),
      pr: pr ? parsePr(pr.stdout) : null,
      at: ctx.now,
      problem,
    }
  },
  touches: (_ctx, tool) =>
    tool.name === 'Bash' && /\b(?:gh\s+(?:issue|pr|api)|git\s+push)\b/.test(tool.command ?? ''),
  header: () => 'GitHub Issues',
}

function listed(ctx: ReadContext, results: readonly ReadResult[]): Issue[] {
  const list = runs(results).find(r => r.argv[1] === 'issue' && r.exitCode === 0)
  if (!list) return []
  const { specLabel, ticketLabel } = ctx.config.tracker.github
  const parsed = parseIssueList(list.stdout, ctx.labels, specLabel, ticketLabel)
  return Array.isArray(parsed) ? parsed : []
}

function listProblem(ctx: ReadContext, results: readonly ReadResult[]): string | null {
  const list = runs(results).find(r => r.argv[1] === 'issue')
  if (!list) return 'gh issue list did not run'
  if (list.exitCode !== 0) return 'gh issue list failed'
  const { specLabel, ticketLabel } = ctx.config.tracker.github
  const parsed = parseIssueList(list.stdout, ctx.labels, specLabel, ticketLabel)
  return Array.isArray(parsed) ? null : parsed.problem
}
