/**
 * git argv builders and parsers for what Craftory needs to know: worktrees and how they sit
 * against their base, the size of each diff, the branches merged into an integration branch and
 * whether a worktree stopped on conflicts. `$.process.run` runs git with repo hooks off, so none
 * of these trigger the repo's own hooks. The shell runs the argv; everything here is data.
 */
import type {
  CraftoryConfig,
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

/** `git worktree add -b <branch> <path> <base>`; an existing branch is checked out as it is. */
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

// ─── Parsers ────────────────────────────────────────────────────────────────────────────

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

/** `https://github.com/acme/billing.git`, `git@gitlab.com:acme/billing.git` to a Remote. */
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

/** ` 4 files changed, 142 insertions(+), 18 deletions(-)`; an empty diff is all zeros. */
export function parseShortstat(stdout: string): { files: number; added: number; deleted: number } {
  const count = (pattern: RegExp) => Number(pattern.exec(stdout)?.[1] ?? 0)
  return {
    files: count(/(\d+) files? changed/),
    added: count(/(\d+) insertions?\(\+\)/),
    deleted: count(/(\d+) deletions?\(-\)/),
  }
}

/** The line the Diff button shows: `4 files changed · +142 −18`. */
export function diffLine(stat: { files: number; added: number; deleted: number }): string {
  if (stat.files === 0) return 'no changes against the base'
  return `${stat.files} file${stat.files === 1 ? '' : 's'} changed · +${stat.added} −${stat.deleted}`
}

const UNMERGED = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

/** Whether `git status --porcelain` shows a merge or rebase stopped on conflicts. */
export const hasConflict = (porcelain: string): boolean =>
  porcelain.split('\n').some(line => UNMERGED.has(line.slice(0, 2)))

/** Parsed `git branch --merged` output. */
export const parseBranches = (stdout: string): string[] =>
  stdout
    .split('\n')
    .map(line => line.trim().replace(/^\*\s*/, ''))
    .filter(Boolean)

// ─── Roles ──────────────────────────────────────────────────────────────────────────────

export const STALE_MS = 5 * 24 * 60 * 60 * 1000

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The ticket a branch made from `worktrees.ticketBranch` belongs to, or null. */
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

/**
 * Role per worktree: the main checkout; the integration branch of any feature; an agent's
 * (its branch fits the ticket template); stale (under the folder, no commit for five days, no
 * running agent); anything else.
 */
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

// ─── Refresh: two rounds of git, then one assembly ──────────────────────────────────────

const key = (argv: readonly string[]) => argv.join(' ')

/**
 * The argv a full refresh needs after the worktree list: the last commit of every branch, the
 * merged set and tip of each integration branch, and for each worktree with a base its
 * ahead/behind and shortstat, plus the status of every linked worktree for conflicts.
 */
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
  /** Stdout by `argv.join(' ')`; a command that failed is absent. */
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

/** `4 ahead of main · 1 behind`, `clean`, or `no commits in 6 days` for a stale one. */
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

/** Worktrees a Prune removes: stale ones, never one Craftory keeps for a failed or over-budget agent. */
export const prunable = (git: GitSnapshot, kept: readonly string[]): Worktree[] =>
  git.worktrees.filter(w => w.role === 'stale' && !kept.some(k => samePath(w.path, k)))

// ─── Reading a command ──────────────────────────────────────────────────────────────────

const unquote = (word: string) => word.replace(/^["']|["']$/g, '')

/** The paths a `git worktree remove` in a shell command line names, one per segment. */
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
