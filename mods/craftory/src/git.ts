import type {
  CraftoryConfig,
  FeatureRecord,
  GitSnapshot,
  IssueRef,
  Millis,
  Remote,
  Worktree,
  WorktreeConfig,
} from '../types'
import { remoteHostOf } from './agents-md'
import { samePath } from './build'

export const worktreeListArgv = ['git', 'worktree', 'list', '--porcelain'] as const
export const currentBranchArgv = ['git', 'branch', '--show-current'] as const
export const remoteArgv = ['git', 'remote', 'get-url', 'origin'] as const
export const mergedArgv = (into: string) =>
  ['git', 'branch', '--merged', into, '--format=%(refname:short)'] as const
export const tipArgv = (branch: string) =>
  ['git', 'rev-parse', '--verify', '--quiet', branch] as const
export const aheadBehindArgv = (base: string, branch: string) =>
  ['git', 'rev-list', '--left-right', '--count', `${base}...${branch}`] as const
export const shortstatArgv = (base: string, branch: string) =>
  ['git', 'diff', '--shortstat', `${base}...${branch}`] as const
export const lastCommitArgv = (branch: string) =>
  ['git', 'log', '-1', '--format=%ct', branch] as const
export const statusArgv = (path: string) => ['git', '-C', path, 'status', '--porcelain'] as const

export const worktreeAddArgv = (
  branch: string,
  path: string,
  base: string,
  branchExists: boolean,
) =>
  branchExists
    ? (['git', 'worktree', 'add', path, branch] as const)
    : (['git', 'worktree', 'add', '-b', branch, path, base] as const)

export const worktreeRemoveArgv = (path: string, force = false) =>
  ['git', 'worktree', 'remove', ...(force ? ['--force'] : []), path] as const

export const worktreePruneArgv = ['git', 'worktree', 'prune'] as const

export type WorktreeEntry = { path: string; branch: string | null; head: string; isMain: boolean }

/** `git worktree list --porcelain`: blank-line separated blocks, the main checkout first. */
export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  for (const block of porcelain.split(/\n\s*\n/)) {
    let path: string | undefined
    let branch: string | null = null
    let head = ''
    let isBare = false
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length).trim()
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length).trim()
      else if (line.startsWith('branch '))
        branch = line
          .slice('branch '.length)
          .trim()
          .replace(/^refs\/heads\//, '')
      else if (line.trim() === 'bare') isBare = true
    }
    if (path !== undefined && path !== '' && !isBare)
      entries.push({ path, branch, head, isMain: entries.length === 0 })
  }
  return entries
}

export function parseRemote(url: string | null): Remote | null {
  const text = url?.trim()
  const host = remoteHostOf(text ?? null)
  if (!text || host === null) return null
  const ssh = /^(?:ssh:\/\/)?[^@/]+@([^:/]+)[:/](.+?)(?:\.git)?\/?$/.exec(text)
  const http = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(text)
  const found = http ?? ssh
  if (!found) return { host, webUrl: text, slug: null }
  return { host, webUrl: `https://${found[1]}/${found[2]}`, slug: found[2]! }
}

/** `rev-list --left-right --count base...branch`: `<only in base>\t<only in branch>`. */
export function parseAheadBehind(stdout: string): { behind: number; ahead: number } {
  const [behind, ahead] = stdout.trim().split(/\s+/).map(Number)
  return {
    behind: Number.isFinite(behind) ? behind! : 0,
    ahead: Number.isFinite(ahead) ? ahead! : 0,
  }
}

export function parseShortstat(stdout: string): { files: number; added: number; deleted: number } {
  const count = (pattern: RegExp) => Number(pattern.exec(stdout)?.[1] ?? 0)
  return {
    files: count(/(\d+) files? changed/),
    added: count(/(\d+) insertions?\(\+\)/),
    deleted: count(/(\d+) deletions?\(-\)/),
  }
}

export function diffLine(stat: { files: number; added: number; deleted: number }): string {
  if (stat.files === 0) return 'no changes against the base'
  return `${stat.files} file${stat.files === 1 ? '' : 's'} changed · +${stat.added} −${stat.deleted}`
}

const UNMERGED = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

export const hasConflict = (porcelain: string): boolean =>
  porcelain.split('\n').some(line => UNMERGED.has(line.slice(0, 2)))

export const parseBranches = (stdout: string): string[] =>
  stdout
    .split('\n')
    .map(line => line.trim().replace(/^\*\s*/, ''))
    .filter(Boolean)

export const STALE_MS = 5 * 24 * 60 * 60 * 1000

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function ticketOfBranch(branch: string | null, template: string): IssueRef | null {
  if (branch === null) return null
  const pattern = escape(template)
    .replace(escape('{ticket}'), '(\\d+)')
    .replace(escape('{slug}'), '.+')
  const match = new RegExp(`^${pattern}$`).exec(branch)
  return match?.[1] ? (`#${match[1]}` as IssueRef) : null
}

const underFolder = (path: string, folder: string) => {
  const dir = folder.replace(/^\.\//, '').replace(/\/+$/, '')
  return path.includes(`/${dir}/`)
}

export function classifyWorktree(args: {
  path: string
  branch: string | null
  isMain: boolean
  integrationBranches: ReadonlySet<string>
  config: WorktreeConfig
  lastCommitAt: Millis | null
  runningPaths: ReadonlySet<string>
  now: Millis
}): { role: Worktree['role']; ticket: IssueRef | null } {
  const { path, branch, isMain, integrationBranches, config, lastCommitAt, runningPaths, now } =
    args
  const ticket = ticketOfBranch(branch, config.ticketBranch)
  if (isMain) return { role: 'checkout', ticket: null }
  if (runningPaths.has(path)) return { role: 'agent', ticket }
  if (branch !== null && integrationBranches.has(branch))
    return { role: 'integration', ticket: null }
  const isOld = lastCommitAt !== null && now - lastCommitAt > STALE_MS
  if (underFolder(path, config.folder) && isOld) return { role: 'stale', ticket }
  return { role: ticket === null ? 'other' : 'agent', ticket }
}

const key = (argv: readonly string[]) => argv.join(' ')

export function gitStep2(args: {
  entries: readonly WorktreeEntry[]
  bases: Readonly<Record<string, string>>
  integrationBranches: readonly string[]
}): (readonly string[])[] {
  const { entries, bases, integrationBranches } = args
  return [
    ...integrationBranches.flatMap(b => [mergedArgv(b), tipArgv(b)]),
    ...entries.flatMap(e => {
      const base = bases[e.path]
      return [
        ...(e.branch === null ? [] : [lastCommitArgv(e.branch)]),
        ...(e.branch !== null && base !== undefined
          ? [aheadBehindArgv(base, e.branch), shortstatArgv(base, e.branch)]
          : []),
        ...(e.isMain ? [] : [statusArgv(e.path)]),
      ]
    }),
  ]
}

export function assembleGit(args: {
  root: string
  branch: string | null
  remote: Remote | null
  entries: readonly WorktreeEntry[]
  bases: Readonly<Record<string, string>>
  results: ReadonlyMap<string, string>
  config: CraftoryConfig
  integrationBranches: readonly string[]
  runningPaths: ReadonlySet<string>
  now: Millis
}): GitSnapshot {
  const { root, branch, remote, entries, bases, results, config, integrationBranches, now } = args
  const out = (argv: readonly string[]) => results.get(key(argv)) ?? ''
  const integration = new Set(integrationBranches)
  const worktrees = entries.map((e): Worktree => {
    const base = bases[e.path]
    const sync =
      e.branch !== null && base !== undefined
        ? parseAheadBehind(out(aheadBehindArgv(base, e.branch)))
        : { ahead: 0, behind: 0 }
    const stat =
      e.branch !== null && base !== undefined
        ? parseShortstat(out(shortstatArgv(base, e.branch)))
        : { files: 0, added: 0, deleted: 0 }
    const seconds = Number(e.branch === null ? '' : out(lastCommitArgv(e.branch)).trim())
    const lastCommitAt = seconds > 0 ? seconds * 1000 : null
    const { role, ticket } = classifyWorktree({
      path: e.path,
      branch: e.branch,
      isMain: e.isMain,
      integrationBranches: integration,
      config: config.worktrees,
      lastCommitAt,
      runningPaths: args.runningPaths,
      now,
    })
    return {
      path: e.path,
      branch: e.branch,
      role,
      ticket,
      ahead: sync.ahead,
      behind: sync.behind,
      added: stat.added,
      deleted: stat.deleted,
      commits: sync.ahead,
      lastCommitAt,
      isRebasing: !e.isMain && hasConflict(out(statusArgv(e.path))),
    }
  })
  return {
    root,
    branch,
    remote,
    worktrees,
    merged: Object.fromEntries(
      integrationBranches.map(b => [b, parseBranches(out(mergedArgv(b)))]),
    ),
    tips: Object.fromEntries(integrationBranches.map(b => [b, out(tipArgv(b)).trim()])),
    at: now,
  }
}

export function syncText(w: Worktree, base: string | null, now: Millis): string {
  if (w.role === 'stale' && w.lastCommitAt !== null) {
    const days = Math.floor((now - w.lastCommitAt) / 86_400_000)
    return `no commits in ${days} days`
  }
  if (w.isRebasing) return 'stopped on merge conflicts'
  const parts = [
    ...(w.ahead > 0 ? [`${w.ahead} ahead${base ? ` of ${base}` : ''}`] : []),
    ...(w.behind > 0 ? [`${w.behind} behind`] : []),
  ]
  return parts.length > 0 ? parts.join(' · ') : base === null ? 'your checkout' : 'in sync'
}

export const prunable = (git: GitSnapshot, kept: readonly string[]): Worktree[] =>
  git.worktrees.filter(w => w.role === 'stale' && !kept.some(k => samePath(w.path, k)))

const unquote = (word: string) => word.replace(/^["']|["']$/g, '')

export function removalTargets(command: string): string[] {
  const targets: string[] = []
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const words = segment.trim().split(/\s+/)
    const at = words.findIndex((w, i) => w === 'worktree' && words[i + 1] === 'remove')
    if (at === -1 || !words.slice(0, at).includes('git')) continue
    targets.push(
      ...words
        .slice(at + 2)
        .filter(w => !w.startsWith('-'))
        .map(unquote),
    )
  }
  return targets
}

export function basesOf(args: {
  entries: readonly { path: string; branch: string | null; isMain: boolean }[]
  main: string | null
  records: readonly FeatureRecord[]
  runs: ReadonlyMap<string, string>
  ticketBranch: string
}): Record<string, string> {
  const { entries, main, records, runs, ticketBranch } = args
  const integrations = records.map(r => r.integrationBranch).filter(Boolean)
  const byAgentBranch = new Map(runs)
  for (const record of records)
    for (const agent of Object.values(record.agents))
      byAgentBranch.set(agent.branch, record.integrationBranch)
  const bases: Record<string, string> = {}
  for (const e of entries) {
    if (e.isMain || e.branch === null) continue
    const base = integrations.includes(e.branch)
      ? main
      : (byAgentBranch.get(e.branch) ??
        (ticketOfBranch(e.branch, ticketBranch) ? integrations[0] : undefined))
    if (base) bases[e.path] = base
  }
  return bases
}

export type WorktreeKind = 'checkout' | 'integration' | 'agent' | 'kept' | 'stale' | 'other'

export const WORKTREE_LABELS: Record<WorktreeKind, string> = {
  checkout: 'Your checkout',
  integration: 'Integration',
  agent: 'Agent running',
  kept: 'Kept',
  stale: 'Stale',
  other: 'Other',
}

export type WorktreeRowView = {
  path: string
  shown: string
  branch: string | null
  kind: WorktreeKind
  sync: string
  link: string | null
  added: number | null
  deleted: number | null
  diff: string | null
  isProtected: boolean
  canDiff: boolean
  canRemove: boolean
}

export type WorktreesView = {
  summary: string
  prunable: number
  rows: WorktreeRowView[]
}

export function worktreesView(args: {
  git: GitSnapshot
  records: readonly FeatureRecord[]
  bases: Readonly<Record<string, string>>
  kept: readonly { path: string; why: string }[]
  diffs: Readonly<Record<string, string>>
  folder: string
  now: Millis
}): WorktreesView {
  const { git, records, bases, kept, diffs, folder, now } = args
  const rows = git.worktrees.map((w): WorktreeRowView => {
    const hold = kept.find(k => samePath(w.path, k.path))
    const kind: WorktreeKind =
      hold === undefined
        ? w.role
        : hold.why === 'running'
          ? 'agent'
          : w.role === 'stale' || w.role === 'agent'
            ? 'kept'
            : w.role
    const spec = records.find(r => r.integrationBranch === w.branch)?.spec
    const link =
      w.ticket !== null
        ? `ticket ${w.ticket}`
        : kind === 'integration' && spec
          ? `spec ${spec}`
          : null
    const shown = w.path.startsWith(`${git.root}/`) ? w.path.slice(git.root.length + 1) : w.path
    return {
      path: w.path,
      shown,
      branch: w.branch,
      kind,
      sync: syncText(w, bases[w.path] ?? null, now),
      link,
      added: w.role === 'agent' || kind === 'kept' ? w.added : null,
      deleted: w.role === 'agent' || kind === 'kept' ? w.deleted : null,
      diff: diffs[w.path] ?? null,
      isProtected: hold !== undefined,
      canDiff: bases[w.path] !== undefined && w.branch !== null,
      canRemove: kind !== 'checkout' && kind !== 'integration',
    }
  })
  const stale = prunable(
    git,
    kept.map(k => k.path),
  )
  const linked = rows.filter(r => underFolder(r.path, folder)).length
  return {
    summary: `${rows.length} worktree${rows.length === 1 ? '' : 's'} · ${linked} under ${folder}`,
    prunable: stale.length,
    rows,
  }
}
