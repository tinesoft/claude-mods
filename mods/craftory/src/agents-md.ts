import type {
  AgentSetup,
  ConfigPatch,
  CraftoryConfig,
  DocsLayout,
  Loaded,
  SteeringFile,
  TrackerSetup,
  TriageLabels,
  TriageRole,
} from '../types'
import { CONFIG_PATH, configOf, parseConfig, patchConfig } from './config'
import { AGENT_DOCS, GITIGNORE, type FileWrite } from './files'
import { TEMPLATES } from './templates'

export { AGENT_DOCS, GITIGNORE }

export const DEFAULT_LABELS: TriageLabels = {
  'needs-triage': 'needs-triage',
  'needs-info': 'needs-info',
  'ready-for-agent': 'ready-for-agent',
  'ready-for-human': 'ready-for-human',
  wontfix: 'wontfix',
}

export const DEFAULT_DOCS: DocsLayout = { glossary: 'GLOSSARY.md', adr: 'docs/adr/' }

const ROLES = Object.keys(DEFAULT_LABELS) as TriageRole[]

export type SetupFiles = {
  tracker: string | null
  triage: string | null
  domain: string | null
  claudeMd: string | null
  agentsMd: string | null
  gitignore: string | null
}

/** Upstream rule: CLAUDE.md if it exists, else AGENTS.md if it exists, else null (ask). */
export function steeringOf(files: Pick<SetupFiles, 'claudeMd' | 'agentsMd'>): SteeringFile | null {
  if (files.claudeMd !== null) return 'CLAUDE.md'
  return files.agentsMd !== null ? 'AGENTS.md' : null
}

export function parseTrackerDoc(text: string): TrackerSetup {
  const h1 = /^# Issue tracker:\s*(.*?)\s*$/m.exec(text)?.[1]?.toLowerCase()
  const prsAsRequests = /\*\*(?:PRs|MRs) as a request surface: yes\.\*\*/.test(text)
  if (h1 === 'github') return { kind: 'github', prsAsRequests }
  if (h1 === 'gitlab') return { kind: 'gitlab', prsAsRequests }
  if (h1 === 'local markdown') return { kind: 'local' }
  return { kind: 'other', description: text }
}

export function parseTriageLabels(text: string): TriageLabels {
  const labels = { ...DEFAULT_LABELS }
  for (const row of text.split(/\r?\n/)) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(row)
    const role = ROLES.find(r => r === match?.[1])
    if (role && match?.[2]) labels[role] = match[2]
  }
  return labels
}

export function parseDomainDoc(text: string): DocsLayout {
  return {
    glossary: /^- \*\*`([^`]+)`\*\* at the repo root/m.exec(text)?.[1] ?? DEFAULT_DOCS.glossary,
    adr: /^- \*\*`([^`]+)`\*\*: read ADRs/m.exec(text)?.[1] ?? DEFAULT_DOCS.adr,
  }
}

const HAS_BLOCK = /^## Agent skills[ \t]*\r?$/m

export function steeringWithBlock(
  files: Pick<SetupFiles, 'claudeMd' | 'agentsMd'>,
): SteeringFile | null {
  if (files.claudeMd !== null && HAS_BLOCK.test(files.claudeMd)) return 'CLAUDE.md'
  return files.agentsMd !== null && HAS_BLOCK.test(files.agentsMd) ? 'AGENTS.md' : null
}

export function readSetup(files: SetupFiles): Loaded<AgentSetup> {
  if (files.tracker === null) return { state: 'absent' }
  const value: AgentSetup = {
    tracker: parseTrackerDoc(files.tracker),
    triage: files.triage === null ? null : parseTriageLabels(files.triage),
    docs: files.domain === null ? DEFAULT_DOCS : parseDomainDoc(files.domain),
    steering: steeringWithBlock(files) ?? steeringOf(files) ?? 'AGENTS.md',
  }
  return { state: 'ok', value, raw: files.tracker }
}

export function renderTrackerDoc(tracker: TrackerSetup, localFolder: string): string {
  switch (tracker.kind) {
    case 'github':
    case 'gitlab': {
      const text =
        TEMPLATES[tracker.kind === 'github' ? 'issue-tracker-github' : 'issue-tracker-gitlab']
      return tracker.prsAsRequests
        ? text
            .replace('**PRs as a request surface: no.**', '**PRs as a request surface: yes.**')
            .replace('**MRs as a request surface: no.**', '**MRs as a request surface: yes.**')
        : text
    }
    case 'local':
      return TEMPLATES['issue-tracker-local-craftory'].replaceAll('{folder}', localFolder)
    case 'other': {
      const body = tracker.description.trim()
      return body.startsWith('# ') ? `${body}\n` : `# Issue tracker: Other\n\n${body}\n`
    }
    default: {
      const _exhaustive: never = tracker
      return _exhaustive
    }
  }
}

export function renderTriageLabels(labels: TriageLabels, previous: string | null): string {
  const base = previous ?? TEMPLATES['triage-labels']
  const current = parseTriageLabels(base)
  return base
    .split('\n')
    .map(row => {
      const role = ROLES.find(r => row.startsWith(`| \`${r}\``))
      if (!role || current[role] === labels[role]) return row
      const cells = row.split('|')
      const width = cells[2]!.length
      cells[2] = ` \`${labels[role]}\``.padEnd(width)
      return cells.join('|')
    })
    .join('\n')
}

export function renderDomainDoc(docs: DocsLayout): string {
  return TEMPLATES.domain
    .replaceAll(DEFAULT_DOCS.glossary, docs.glossary)
    .replaceAll(DEFAULT_DOCS.adr, docs.adr)
}

const trackerSummary = (tracker: TrackerSetup, localFolder: string) => {
  switch (tracker.kind) {
    case 'github':
      return 'Issues and specs are GitHub issues (use the `gh` CLI)'
    case 'gitlab':
      return 'Issues and specs are GitLab issues (use the `glab` CLI)'
    case 'local':
      return `Issues and specs are markdown files in \`${localFolder}\``
    case 'other':
      return 'Issues and specs live in an external tracker, described in the file'
    default: {
      const _exhaustive: never = tracker
      return _exhaustive
    }
  }
}

const labelsSummary = (labels: TriageLabels) =>
  ROLES.every(r => labels[r] === DEFAULT_LABELS[r])
    ? 'Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`'
    : 'Custom label vocabulary mapped onto the five triage roles'

export function renderAgentSkillsBlock(setup: AgentSetup, localFolder: string): string {
  const parts = [
    '## Agent skills',
    '### Issue tracker',
    `${trackerSummary(setup.tracker, localFolder)}. See \`${AGENT_DOCS.tracker}\`.`,
    ...(setup.triage
      ? ['### Triage labels', `${labelsSummary(setup.triage)}. See \`${AGENT_DOCS.triage}\`.`]
      : []),
    '### Domain docs',
    `Single-context: one \`${setup.docs.glossary}\` and \`${setup.docs.adr}\` at the repo root. See \`${AGENT_DOCS.domain}\`.`,
  ]
  return `${parts.join('\n\n')}\n`
}

const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n')

export function upsertBlock(steering: string | null, block: string): string {
  if (steering === null || steering === '') return block
  const eol = eolOf(steering)
  const text = block.replace(/\n/g, eol)
  const heading = /^## Agent skills[ \t]*(?:\r?\n|$)/m.exec(steering)
  if (heading) {
    const from = heading.index
    const next = /^## /m.exec(steering.slice(from + heading[0].length))
    const to = next ? from + heading[0].length + next.index : steering.length
    return steering.slice(0, from) + text + (to < steering.length ? eol : '') + steering.slice(to)
  }
  const gap = steering.endsWith(`${eol}${eol}`) ? '' : steering.endsWith(eol) ? eol : eol + eol
  return steering + gap + text
}

const blockCovers = (steering: string | null, setup: AgentSetup) => {
  const heading = steering === null ? null : /^## Agent skills[ \t]*\r?$/m.exec(steering)
  if (steering === null || heading === null) return false
  const rest = steering.slice(heading.index + heading[0].length)
  const body = rest.split(/^## /m)[0]!
  const needed = [
    AGENT_DOCS.tracker,
    AGENT_DOCS.domain,
    ...(setup.triage ? [AGENT_DOCS.triage] : []),
  ]
  return needed.every(doc => body.includes(doc))
}

export function ensureGitignore(text: string | null, entry: string): string {
  if (text === null || text === '') return `${entry}\n`
  const bare = entry.replace(/\/$/, '')
  const has = text.split(/\r?\n/).some(line => {
    const t = line.trim().replace(/^\//, '').replace(/\/$/, '')
    return t === bare
  })
  if (has) return text
  const eol = eolOf(text)
  return `${text}${text.endsWith('\n') ? '' : eol}${entry}${eol}`
}

const prsOf = (t: TrackerSetup) => 'prsAsRequests' in t && t.prsAsRequests

const sameTracker = (a: TrackerSetup, b: TrackerSetup) => a.kind === b.kind && prsOf(a) === prsOf(b)

const sameLabels = (a: TriageLabels, b: TriageLabels) => ROLES.every(r => a[r] === b[r])

export function planSetup(
  setup: AgentSetup,
  files: SetupFiles,
  options: {
    worktreeFolder: string
    localFolder: string
    chooseSteering?: boolean
    refreshBlock?: boolean
  },
): FileWrite[] {
  const writes: FileWrite[] = []
  const put = (path: string, before: string | null, after: string) => {
    if (before !== after) writes.push({ path, before, after })
  }

  const trackerSays =
    files.tracker !== null &&
    (setup.tracker.kind === 'other'
      ? files.tracker.trim() === renderTrackerDoc(setup.tracker, options.localFolder).trim()
      : sameTracker(parseTrackerDoc(files.tracker), setup.tracker))
  put(
    AGENT_DOCS.tracker,
    files.tracker,
    trackerSays ? files.tracker! : renderTrackerDoc(setup.tracker, options.localFolder),
  )

  if (setup.triage) {
    const says = files.triage !== null && sameLabels(parseTriageLabels(files.triage), setup.triage)
    put(
      AGENT_DOCS.triage,
      files.triage,
      says ? files.triage! : renderTriageLabels(setup.triage, files.triage),
    )
  }

  const domainSays =
    files.domain !== null &&
    parseDomainDoc(files.domain).glossary === setup.docs.glossary &&
    parseDomainDoc(files.domain).adr === setup.docs.adr
  put(AGENT_DOCS.domain, files.domain, domainSays ? files.domain! : renderDomainDoc(setup.docs))

  const target = options.chooseSteering ? setup.steering : (steeringOf(files) ?? setup.steering)
  const steering = target === 'CLAUDE.md' ? files.claudeMd : files.agentsMd
  put(
    target,
    steering,
    blockCovers(steering, setup) && options.refreshBlock !== true
      ? steering!
      : upsertBlock(steering, renderAgentSkillsBlock(setup, options.localFolder)),
  )

  put(GITIGNORE, files.gitignore, ensureGitignore(files.gitignore, options.worktreeFolder))
  return writes
}

export type SetupSignals = {
  remoteHost: 'github' | 'gitlab' | 'other' | null
  hasScratch: boolean
  hasContextMd: boolean
  steering: SteeringFile | null
  hasTriageSkill: boolean
}

export function remoteHostOf(url: string | null): SetupSignals['remoteHost'] {
  const text = url?.trim()
  if (!text) return null
  if (/github\.com/i.test(text)) return 'github'
  return /gitlab/i.test(text) ? 'gitlab' : 'other'
}

export function draftSetup(signals: SetupSignals): AgentSetup {
  const tracker: TrackerSetup =
    signals.remoteHost === 'github' || signals.remoteHost === 'gitlab'
      ? { kind: signals.remoteHost, prsAsRequests: false }
      : { kind: 'local' }
  return {
    tracker,
    triage: signals.hasTriageSkill ? { ...DEFAULT_LABELS } : null,
    docs: DEFAULT_DOCS,
    steering: signals.steering ?? 'AGENTS.md',
  }
}

export function firstRunText(signals: SetupSignals): string {
  const found = [
    signals.remoteHost === 'github' ? 'a GitHub remote' : null,
    signals.remoteHost === 'gitlab' ? 'a GitLab remote' : null,
    signals.hasContextMd ? 'CONTEXT.md' : null,
    signals.hasScratch ? 'a .scratch/ folder' : null,
  ].filter((x): x is string => x !== null)
  const list = found.length > 1 ? `${found.slice(0, -1).join(', ')} and ${found.at(-1)}` : found[0]
  return `No docs/agents/ yet.${list ? ` Found ${list}.` : ''}`
}

export function retargetTracker(doc: string, oldFolder: string, newFolder: string): string {
  return oldFolder === newFolder ? doc : doc.replaceAll(`\`${oldFolder}`, `\`${newFolder}`)
}

/**
 * What one Settings change writes, and the config and setup the repo holds once it is written.
 * The setup files follow only a saved setup; an unsaved draft keeps its change in memory.
 */
export function planSettingsWrites(args: {
  change: { config?: ConfigPatch; setup?: (current: AgentSetup) => AgentSetup }
  current: { setup: AgentSetup; isDraft: boolean }
  files: SetupFiles
  configText: string | null
  oldConfig: CraftoryConfig
}): { writes: FileWrite[]; nextConfig: CraftoryConfig; nextSetup: AgentSetup } {
  const { change, current, files, configText, oldConfig } = args
  const writes: FileWrite[] = []
  const { config: patch } = change
  let nextConfig = oldConfig
  if (patch !== undefined) {
    const after = patchConfig(configText, patch)
    writes.push({
      path: CONFIG_PATH,
      before: configText,
      after,
      replan: raw => patchConfig(raw, patch),
    })
    nextConfig = configOf(parseConfig(after))
  }
  const nextSetup = change.setup ? change.setup(current.setup) : current.setup
  if (current.isDraft) return { writes, nextConfig, nextSetup }
  if (change.setup)
    writes.push(
      ...planSetup(nextSetup, files, {
        worktreeFolder: nextConfig.worktrees.folder,
        localFolder: nextConfig.tracker.local.folder,
        chooseSteering: true,
        refreshBlock: true,
      }),
    )
  const at = writes.findIndex(w => w.path === AGENT_DOCS.tracker)
  const doc = at === -1 ? files.tracker : writes[at]!.after
  if (doc !== null && nextSetup.tracker.kind === 'local') {
    const moved = retargetTracker(
      doc,
      oldConfig.tracker.local.folder,
      nextConfig.tracker.local.folder,
    )
    const write = { path: AGENT_DOCS.tracker, before: files.tracker, after: moved }
    if (moved !== doc) {
      if (at === -1) writes.push(write)
      else writes[at] = write
    }
  }
  if (
    nextConfig.worktrees.folder !== oldConfig.worktrees.folder &&
    !writes.some(w => w.path === GITIGNORE)
  )
    writes.push({
      path: GITIGNORE,
      before: files.gitignore,
      after: ensureGitignore(files.gitignore, nextConfig.worktrees.folder),
    })
  return { writes, nextConfig, nextSetup }
}
