import type { Issue, IssueKind, IssueRef, IssueStatus, TriageLabels, TriageRole } from '../../types'
import type { FsListing, ReadResult, TrackerSpec } from './index'
import { isSpecBody, parseIssueRef, storiesIn } from './refs'

export type FrontMatter = Record<string, string | string[]>

const KEY = /^([A-Za-z][\w-]*):[ \t]*(.*?)[ \t]*$/

export function parseFrontMatter(text: string): { data: FrontMatter; body: string } | null {
  const lines = (text.startsWith('\uFEFF') ? text.slice(1) : text).split('\n')
  if (lines[0]?.trim() !== '---') return null
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  if (end === -1) return null
  const data: FrontMatter = {}
  for (const line of lines.slice(1, end)) {
    const match = KEY.exec(line.replace(/\r$/, ''))
    if (!match) continue
    const [, key, value] = match
    const bracket = /^\[(.*)\]$/.exec(value!)
    const list = bracket ? bracket[1]! : value!.includes(',') ? value! : null
    data[key!.replace(/_/g, '-')] =
      list === null
        ? value!.replace(/^["']|["']$/g, '')
        : list
            .split(',')
            .map(s => s.trim().replace(/^["']|["']$/g, ''))
            .filter(Boolean)
  }
  return { data, body: lines.slice(end + 1).join('\n') }
}

const asList = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : value === '' ? [] : [value]
const asText = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.join(', ') : (value ?? '')

export const numberOf = (name: string): number | undefined => {
  const match = /^(\d+)-.*\.md$/.exec(name)
  return match ? Number(match[1]) : undefined
}

const UPSTREAM_LINE = (label: string) =>
  new RegExp(`^(?:\\*\\*)?${label}:(?:\\*\\*)?[ \\t]*(.*?)[ \\t]*$`, 'im')

const refsOf = (value: string): IssueRef[] =>
  /none/i.test(value)
    ? []
    : [...value.matchAll(/#?\b(\d+)\b/g)].flatMap(m => parseIssueRef(m[1]!) ?? [])

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
  if (text === 'done') return { status: 'done', role: null }
  if (text === 'closed') return { status: 'closed', role: null }
  const role = ROLE_BY_NAME(labels, text)
  return { status: role === 'wontfix' ? 'closed' : 'open', role }
}

/**
 * When a spec counts as created, for `bindSpec` to compare with when `to-spec` ran. A date-only
 * `created` has no time of day, so it counts as the end of that day, which keeps a spec written
 * today after a draft started earlier today.
 */
function createdAtForBinding(created: string, mtimeMs: number | null): number | null {
  const parsed = Date.parse(created)
  if (!Number.isNaN(parsed))
    return /^\d{4}-\d{2}-\d{2}$/.test(created) ? parsed + 86_400_000 - 1 : parsed
  return mtimeMs
}

export function parseIssueFile(args: {
  folder: string
  name: string
  text: string
  labels: TriageLabels
  mtimeMs?: number
}): Issue | { problem: string } {
  const { folder, name, text, labels } = args
  const n = numberOf(name)
  if (n === undefined) return { problem: `${name}: not named <n>-<slug>.md` }
  const parsed = parseFrontMatter(text)
  const data = parsed?.data ?? {}
  const body = parsed?.body ?? text
  const head = body.split('\n').slice(0, 60).join('\n')

  const slug = name.replace(/^\d+-/, '').replace(/\.md$/, '')
  const heading = /^# (.+?)\s*$/m.exec(body)?.[1]?.replace(/^\d+:\s*/, '')
  const upstreamBlocked = UPSTREAM_LINE('Blocked by').exec(head)?.[1]
  const parent = parseIssueRef(asText(data.parent))
  const type = asText(data.type).toLowerCase()
  const isSpec = type === 'spec' || (type === '' && isSpecBody(body))
  const kind: IssueKind = isSpec
    ? 'spec'
    : type === 'ticket' || parent !== undefined || upstreamBlocked !== undefined
      ? 'ticket'
      : 'issue'

  const { status, role } = statusOf(
    asText(data.status) || UPSTREAM_LINE('Status').exec(head)?.[1] || '',
    labels,
  )
  const blockedRaw = data['blocked-by']
  const blockedBy =
    blockedRaw !== undefined
      ? asList(blockedRaw).flatMap(r => parseIssueRef(r) ?? [])
      : refsOf(upstreamBlocked ?? '')
  const tags = asList(data.labels).map(l => l.toLowerCase())

  return {
    ref: parseIssueRef(String(n))!,
    title: heading ?? slug.replace(/-/g, ' '),
    kind,
    status,
    role,
    parent: parent ?? null,
    blockedBy,
    isBug: tags.includes('bug') || type === 'bug',
    ...(isSpec && { stories: storiesIn(body) }),
    createdAt: createdAtForBinding(asText(data.created), args.mtimeMs ?? null),
    location: `${folder}${name}`,
  }
}

const folderOf = (folder: string) => (folder.endsWith('/') ? folder : `${folder}/`)

const NEWEST_FIRST = 500

const issueFiles = (entries: readonly FsListing[] | null) =>
  (entries ?? [])
    .filter(e => e.kind === 'file' && numberOf(e.name) !== undefined)
    .sort((a, b) => numberOf(b.name)! - numberOf(a.name)!)
    .slice(0, NEWEST_FIRST)

export const spec: TrackerSpec = {
  label: 'Local Markdown',
  rich: true,
  plan: (ctx, previous) => {
    const folder = folderOf(ctx.config.tracker.local.folder)
    const listing = previous[0]
    if (listing?.kind !== 'list') return [{ kind: 'list', dir: folder }]
    return issueFiles(listing.entries).map(e => ({
      kind: 'read' as const,
      path: `${folder}${e.name}`,
    }))
  },
  parse: (ctx, results: readonly ReadResult[]) => {
    const folder = folderOf(ctx.config.tracker.local.folder)
    const listing = results[0]
    const files = listing?.kind === 'list' ? issueFiles(listing.entries) : []
    const problems: string[] = []
    const issues = files.flatMap((file, i) => {
      const read = results[i + 1]
      if (read?.kind !== 'read' || read.text === null) {
        problems.push(`${file.name}: unreadable`)
        return []
      }
      const issue = parseIssueFile({
        folder,
        name: file.name,
        text: read.text,
        labels: ctx.labels,
        mtimeMs: file.mtimeMs,
      })
      if ('problem' in issue) {
        problems.push(issue.problem)
        return []
      }
      return [issue]
    })
    return {
      kind: 'local',
      rich: true,
      issues: issues.sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1))),
      pr: null,
      at: ctx.now,
      problem: problems.length > 0 ? problems.join('; ') : null,
    }
  },
  touches: (ctx, tool) => {
    const folder = folderOf(ctx.config.tracker.local.folder)
    if (tool.name === 'Write' || tool.name === 'Edit') return tool.path?.includes(folder) === true
    return tool.name === 'Bash' && tool.command?.includes(folder) === true
  },
  header: ctx => `Local Markdown · ${folderOf(ctx.config.tracker.local.folder)}`,
}
