import type {
  AgentSetup,
  ConfigPatch,
  CraftoryConfig,
  EnterAt,
  PhaseConfig,
  PhaseId,
  PrefOverrides,
  Prefs,
  SettingsSection,
  TrackerKind,
  TrackerSetup,
  TriageRole,
} from '../types'
import { DEFAULT_LABELS } from './agents-md'
import { budgetK } from './build'
import { AGENT_DOCS, CONFIG_FILE, normalise, withSlash } from './files'
import { PHASE_ORDER, PHASES } from './phases'
import { otherNote } from './tracker/links'

export type SettingsFile = 'config' | 'tracker' | 'triage' | 'domain' | 'steering' | 'prefs'

export type SettingsFacts = {
  config: CraftoryConfig
  setup: AgentSetup
  prefs: Prefs
}

export type SettingsChange = {
  config?: ConfigPatch
  setup?: (current: AgentSetup) => AgentSetup
  prefs?: PrefOverrides
}

export type Choice = readonly [value: string, label: string]

type RowBase = {
  id: string
  label: string
  hint?: string
  file: SettingsFile
  visible?: (facts: SettingsFacts) => boolean
  header?: true
  inactive?: string
}

export type SettingsRow = RowBase &
  (
    | {
        control: 'switch'
        read: (facts: SettingsFacts) => boolean
        write: (on: boolean) => SettingsChange
      }
    | {
        control: 'choice'
        options: (facts: SettingsFacts) => readonly Choice[]
        read: (facts: SettingsFacts) => string
        write: (value: string) => SettingsChange
      }
    | {
        control: 'text'
        read: (facts: SettingsFacts) => string
        write: (text: string) => SettingsChange
        placeholder?: string
        rows?: number
        allowEmpty?: true
        check?: (text: string) => string | null
      }
  )

export type SectionDef = {
  id: SettingsSection
  title: string
  blurb: (facts: SettingsFacts) => string
  rows: readonly SettingsRow[]
  custom?: 'glossary'
}

const toggle = (
  id: string,
  label: string,
  hint: string,
  read: (c: CraftoryConfig) => boolean,
  patch: (on: boolean) => ConfigPatch,
  extra: Partial<RowBase> = {},
): SettingsRow => ({
  id,
  label,
  hint,
  file: 'config',
  ...extra,
  control: 'switch',
  read: f => read(f.config),
  write: on => ({ config: patch(on) }),
})

const line = (
  id: string,
  label: string,
  hint: string,
  read: (c: CraftoryConfig) => string,
  patch: (text: string) => ConfigPatch,
  extra: Partial<RowBase> & { check?: (text: string) => string | null; allowEmpty?: true } = {},
): SettingsRow => ({
  id,
  label,
  hint,
  file: 'config',
  ...extra,
  control: 'text',
  read: f => read(f.config),
  write: text => ({ config: patch(text.trim()) }),
})

export const pathCheck = (text: string) =>
  normalise(text) === undefined ? 'Use a path inside the repo, such as docs/issues/' : null

const listOf = (text: string) =>
  text
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

const numbers = (steps: readonly number[], show: (n: number) => string, current: number) =>
  [...new Set([...steps, current])].sort((a, b) => a - b).map((n): Choice => [String(n), show(n)])

const TRACKER_KINDS: readonly Choice[] = [
  ['local', 'Local Markdown'],
  ['github', 'GitHub Issues'],
  ['gitlab', 'GitLab Issues'],
  ['other', 'Something else'],
]

const kindOf = (f: SettingsFacts) => f.setup.tracker.kind

export function trackerOfKind(kind: TrackerKind, old: TrackerSetup): TrackerSetup {
  const prs = 'prsAsRequests' in old && old.prsAsRequests
  switch (kind) {
    case 'local':
      return { kind }
    case 'github':
    case 'gitlab':
      return { kind, prsAsRequests: prs }
    case 'other':
      return { kind, description: old.kind === 'other' ? old.description : '' }
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

const isKind = (value: string): value is TrackerKind => TRACKER_KINDS.some(([k]) => k === value)

const ROLES: readonly [TriageRole, string][] = [
  ['needs-triage', 'Needs triage'],
  ['needs-info', 'Needs info'],
  ['ready-for-agent', 'Ready for agent'],
  ['ready-for-human', 'Ready for human'],
  ['wontfix', 'Won’t fix'],
]

const hasTriage = (f: SettingsFacts) => f.setup.triage !== null

const labelRows = ROLES.map(([role, title]): SettingsRow => ({
  id: `label-${role}`,
  label: title,
  file: 'triage',
  visible: hasTriage,
  control: 'text',
  read: f => f.setup.triage?.[role] ?? DEFAULT_LABELS[role],
  write: text => ({
    setup: s => ({ ...s, triage: { ...(s.triage ?? DEFAULT_LABELS), [role]: text.trim() } }),
  }),
}))

const prsRow = (kind: 'github' | 'gitlab'): SettingsRow => ({
  id: `prs-${kind}`,
  label: kind === 'github' ? 'Pull requests as requests' : 'Merge requests as requests',
  hint: 'Triage reads outside PRs the way it reads issues.',
  file: 'tracker',
  visible: f => kindOf(f) === kind,
  control: 'switch',
  read: f => f.setup.tracker.kind === kind && f.setup.tracker.prsAsRequests,
  write: on => ({ setup: s => ({ ...s, tracker: { kind, prsAsRequests: on } }) }),
})

const TRACKER_ROWS: readonly SettingsRow[] = [
  {
    id: 'tracker-kind',
    label: 'Issue tracker',
    hint: 'Written to docs/agents/issue-tracker.md, which Matt’s skills read.',
    file: 'tracker',
    control: 'choice',
    options: () => TRACKER_KINDS,
    read: kindOf,
    write: value => ({
      setup: s => (isKind(value) ? { ...s, tracker: trackerOfKind(value, s.tracker) } : s),
    }),
  },
  line(
    'github-spec-label',
    'Label for specs',
    'Craftory tells a spec by its headings too, so this is only a hint.',
    c => c.tracker.github.specLabel,
    text => ({ tracker: { github: { specLabel: text } } }),
    { visible: f => kindOf(f) === 'github' },
  ),
  line(
    'github-ticket-label',
    'Label for tickets',
    'Blocking edges stay in each ticket body.',
    c => c.tracker.github.ticketLabel,
    text => ({ tracker: { github: { ticketLabel: text } } }),
    { visible: f => kindOf(f) === 'github' },
  ),
  prsRow('github'),
  line(
    'gitlab-instance',
    'Instance',
    'Uses the glab CLI. The Tickets tab links to the project.',
    c => c.tracker.gitlab.instance,
    text => ({ tracker: { gitlab: { instance: text } } }),
    { visible: f => kindOf(f) === 'gitlab' },
  ),
  line(
    'gitlab-project',
    'Project path',
    'Such as group/project. Left empty, the git remote is used.',
    c => c.tracker.gitlab.project,
    text => ({ tracker: { gitlab: { project: text } } }),
    { visible: f => kindOf(f) === 'gitlab', allowEmpty: true },
  ),
  prsRow('gitlab'),
  {
    id: 'other-description',
    label: 'Tell Claude how to create, read and update issues',
    hint: 'Written under the heading of docs/agents/issue-tracker.md. Links in it appear in the Tickets tab.',
    file: 'tracker',
    visible: f => kindOf(f) === 'other',
    control: 'text',
    rows: 4,
    placeholder: 'We use Linear, team ENG. Create issues with the Linear connector…',
    read: f =>
      f.setup.tracker.kind === 'other' ? (otherNote(f.setup.tracker.description) ?? '') : '',
    write: text => ({
      setup: s => ({ ...s, tracker: { kind: 'other', description: text.trim() } }),
    }),
  },
  ...labelRows,
]

const DOCS_ROWS: readonly SettingsRow[] = [
  {
    id: 'docs-glossary',
    label: 'Glossary file',
    hint: 'Written to docs/agents/domain.md. An existing file is not moved.',
    file: 'domain',
    control: 'text',
    check: pathCheck,
    read: f => f.setup.docs.glossary,
    write: text => ({ setup: s => ({ ...s, docs: { ...s.docs, glossary: text.trim() } }) }),
  },
  {
    id: 'docs-adr',
    label: 'ADR folder',
    hint: 'Written to docs/agents/domain.md.',
    file: 'domain',
    control: 'text',
    check: pathCheck,
    read: f => f.setup.docs.adr,
    write: text => ({ setup: s => ({ ...s, docs: { ...s.docs, adr: withSlash(text.trim()) } }) }),
  },
  line(
    'docs-research',
    'Research notes',
    'Where the research skill saves its notes.',
    c => c.docs.research,
    text => ({ docs: { research: withSlash(text) } }),
    { check: pathCheck },
  ),
  {
    id: 'docs-steering',
    label: 'Agent steering file',
    hint: 'Holds the ## Agent skills block. The other file is left as it is.',
    file: 'steering',
    control: 'choice',
    options: () => [
      ['CLAUDE.md', 'CLAUDE.md'],
      ['AGENTS.md', 'AGENTS.md'],
    ],
    read: f => f.setup.steering,
    write: value => ({
      setup: s => ({
        ...s,
        steering: value === 'AGENTS.md' ? 'AGENTS.md' : 'CLAUDE.md',
      }),
    }),
  },
]

const ENTER_AT: readonly (readonly [EnterAt, string])[] = [
  ['align', 'Enter at Align'],
  ['bugs-build-else-align', 'Bugs enter at Build, the rest at Align'],
  ['tickets', 'Enter at Tickets'],
]

const ENTRY_ROWS: readonly SettingsRow[] = [
  toggle(
    'triage-enabled',
    'Triage intake (/triage)',
    'Bug reports, requests and outside PRs land in the Inbox, not in a phase.',
    c => c.entry.triage.enabled,
    on => ({ entry: { triage: { enabled: on } } }),
  ),
  {
    id: 'triage-enter-at',
    label: 'Ready-for-agent items enter at',
    file: 'config',
    control: 'choice',
    options: () => ENTER_AT,
    read: f => f.config.entry.triage.enterAt,
    write: value => ({
      config: {
        entry: { triage: { enterAt: ENTER_AT.find(([v]) => v === value)?.[0] ?? 'align' } },
      },
    }),
  },
  {
    id: 'wayfinder-suggest',
    label: 'Suggest wayfinder',
    file: 'config',
    control: 'choice',
    options: () => [
      ['long-grill', 'When a grill runs long'],
      ['off', 'Never'],
    ],
    read: f => f.config.entry.wayfinder.suggest,
    write: value => ({
      config: { entry: { wayfinder: { suggest: value === 'off' ? 'off' : 'long-grill' } } },
    }),
  },
]

const commandHint = (phase: PhaseId) => {
  const spec = PHASES[phase]
  return spec.commands.length > 0
    ? `${spec.pipelineDesc} Command: ${spec.commands.map(c => `/${c}`).join(' or ')}.`
    : `${spec.pipelineDesc} ${'startedBy' in spec ? spec.startedBy : ''}`.trim()
}

const phasePatch = (phase: PhaseId, change: Partial<PhaseConfig>): ConfigPatch => {
  const phases: NonNullable<ConfigPatch['phases']> = {}
  phases[phase] = change
  return { phases }
}

const phaseRows = (phase: PhaseId): SettingsRow[] => {
  const spec = PHASES[phase]
  const rows: SettingsRow[] = [
    toggle(
      `phase-${phase}-enabled`,
      `${spec.n}. ${spec.label}`,
      commandHint(phase),
      c => c.phases[phase].enabled,
      on => phasePatch(phase, { enabled: on }),
    ),
  ]
  if (spec.commands.length > 1) {
    rows.push({
      id: `phase-${phase}-command`,
      label: `${spec.label} command`,
      file: 'config',
      control: 'choice',
      options: () => spec.commands.map((c): Choice => [c, `/${c}`]),
      read: f => f.config.phases[phase].command ?? spec.commands[0] ?? '',
      write: value => ({
        config: phasePatch(phase, { command: spec.commands.find(c => c === value) }),
      }),
    })
  }
  rows.push(
    toggle(
      `phase-${phase}-gate`,
      `Gate after ${spec.label}`,
      'Asks you to confirm before the next phase runs while this one is not done.',
      c => c.phases[phase].gate,
      on => phasePatch(phase, { gate: on }),
    ),
  )
  return rows
}

const PIPELINE_ROWS = PHASE_ORDER.flatMap(phaseRows)

export const HELPERS = PHASE_ORDER.flatMap(p =>
  PHASES[p].helpers.length > 0 ? [{ phase: PHASES[p].label, skills: PHASES[p].helpers }] : [],
)

const wt = (c: CraftoryConfig) => c.worktrees

const WORKTREE_ROWS: readonly SettingsRow[] = [
  line(
    'wt-folder',
    'Worktree folder',
    'Added to .gitignore when you save the setup.',
    c => wt(c).folder,
    text => ({ worktrees: { folder: withSlash(text) } }),
    { check: pathCheck },
  ),
  line(
    'wt-integration-branch',
    'Integration branch',
    'One per spec; tickets merge into it. {spec-slug} is the spec title.',
    c => wt(c).integrationBranch,
    text => ({ worktrees: { integrationBranch: text } }),
  ),
  line(
    'wt-ticket-branch',
    'Ticket branch',
    'Example: craftory/44-ledger-tax. {ticket} and {slug} are filled in.',
    c => wt(c).ticketBranch,
    text => ({ worktrees: { ticketBranch: text } }),
  ),
  {
    id: 'wt-max-parallel',
    label: 'Parallel worktrees, at most',
    hint: 'More tickets wait in the queue.',
    file: 'config',
    control: 'choice',
    options: f =>
      numbers(
        [1, 2, 3, 4, 6],
        n => (n === 1 ? '1 (one at a time)' : String(n)),
        wt(f.config).maxParallel,
      ),
    read: f => String(wt(f.config).maxParallel),
    write: value => ({ config: { worktrees: { maxParallel: Number(value) } } }),
  },
  {
    id: 'wt-token-budget',
    label: 'Token budget per agent',
    hint: 'Amber at 80%. At 100% the agent stops and reports; its worktree is kept.',
    file: 'config',
    control: 'choice',
    options: f => numbers([40_000, 80_000, 120_000, 200_000], budgetK, wt(f.config).tokenBudget),
    read: f => String(wt(f.config).tokenBudget),
    write: value => ({ config: { worktrees: { tokenBudget: Number(value) } } }),
  },
  line(
    'wt-setup',
    'Setup command',
    'Runs in each new worktree. Leave empty to run nothing.',
    c => wt(c).setup,
    text => ({ worktrees: { setup: text } }),
    { allowEmpty: true },
  ),
  {
    id: 'wt-copy',
    label: 'Copy untracked files',
    hint: 'Comma-separated, from your checkout.',
    file: 'config',
    control: 'text',
    allowEmpty: true,
    read: f => wt(f.config).copy.join(', '),
    write: text => ({ config: { worktrees: { copy: listOf(text) } } }),
  },
  line(
    'wt-test',
    'Test command',
    'Runs in a ticket’s worktree after its implementer’s turn; a failure marks the ticket Failed. Leave empty to run nothing.',
    c => wt(c).test,
    text => ({ worktrees: { test: text } }),
    { allowEmpty: true },
  ),
  {
    id: 'wt-test-timeout',
    label: 'Test timeout',
    hint: 'A run still going then is stopped and the ticket is Failed, timed out.',
    file: 'config',
    control: 'choice',
    options: f =>
      numbers(
        [60, 300, 600],
        n => (n % 60 === 0 ? `${n / 60} min` : `${n} s`),
        wt(f.config).testTimeoutSec,
      ),
    read: f => String(wt(f.config).testTimeoutSec),
    write: value => ({ config: { worktrees: { testTimeoutSec: Number(value) } } }),
  },
  toggle(
    'wt-remove-after-merge',
    'Remove a worktree after its ticket merges',
    'Its branch is kept until the PR merges.',
    c => wt(c).removeAfterMerge,
    on => ({ worktrees: { removeAfterMerge: on } }),
  ),
  toggle(
    'wt-rebase-on-move',
    'Tell running agents when the integration branch moves',
    'Each running agent is asked to merge the new tip; a conflict pauses it and asks you.',
    c => wt(c).rebaseOnMove,
    on => ({ worktrees: { rebaseOnMove: on } }),
  ),
  toggle(
    'wt-keep-failed',
    'Keep worktrees of failed tickets',
    'So you or diagnosing-bugs can inspect the exact state.',
    c => wt(c).keepFailed,
    on => ({ worktrees: { keepFailed: on } }),
  ),
  toggle(
    'wt-prune-stale',
    'Prune stale worktrees',
    'Removes worktrees with no commits for 5 days when the session starts, prototype spikes included.',
    c => wt(c).pruneStale,
    on => ({ worktrees: { pruneStale: on } }),
  ),
]

const au = (c: CraftoryConfig) => c.automation

const AUTOMATION_ROWS: readonly SettingsRow[] = [
  toggle(
    'auto-suggest-next',
    'Suggest the next phase',
    'When a phase finishes, the rail highlights the next one with its command ready to run.',
    c => au(c).suggestNext,
    on => ({ automation: { suggestNext: on } }),
  ),
  toggle(
    'auto-live-agents',
    'Live agents in phase details',
    'For Build: each agent’s ticket, TDD step, token use against its budget, and status.',
    c => au(c).liveAgents,
    on => ({ automation: { liveAgents: on } }),
  ),
  toggle(
    'auto-underline-terms',
    'Underline glossary terms in replies',
    'Terms link to wait-what; hover a term in the row under the reply for its definition. Not on the terminal.',
    c => au(c).underlineTerms,
    on => ({ automation: { underlineTerms: on } }),
  ),
  toggle(
    'auto-retro-on-pr',
    'Offer a retro when the PR merges',
    'A band notice offers Run retro once the Feature’s PR merges. Otherwise retro waits until you run /retro.',
    c => au(c).retroOnPr,
    on => ({ automation: { retroOnPr: on } }),
  ),
  toggle(
    'auto-handoff',
    'Write a handoff before context runs out',
    'At 80% context, condense the session so a fresh one can pick up the ticket.',
    c => au(c).handoffAt80,
    on => ({ automation: { handoffAt80: on } }),
  ),
  toggle(
    'auto-weekly-architecture',
    'Weekly architecture check',
    'Runs improve-codebase-architecture and files what it finds with the needs-triage label.',
    c => au(c).weeklyArchitecture,
    on => ({ automation: { weeklyArchitecture: on } }),
  ),
  toggle(
    'auto-nudge-unmet-done',
    'Nudge when a phase ends without its evidence',
    'When a turn ends in a running phase whose Done-when is not met, the band says what is missing.',
    c => au(c).nudgeUnmetDone,
    on => ({ automation: { nudgeUnmetDone: on } }),
  ),
  toggle(
    'deny-skip-gate',
    'Deny a gated phase until the one before it is done',
    'Refuses the phase’s skill when an agent calls it early, instead of asking. The denial names this switch.',
    c => c.deny.skipGate,
    on => ({ deny: { skipGate: on } }),
  ),
  toggle(
    'deny-edit-on-integration',
    'Deny edits in your checkout on an integration branch',
    'Refuses Edit and Write in the main checkout while it is on feat/*, so work stays in worktrees.',
    c => c.deny.editOnIntegrationBranch,
    on => ({ deny: { editOnIntegrationBranch: on } }),
  ),
]

const pref = (patch: PrefOverrides): SettingsChange => ({ prefs: patch })

const PERSONAL_ROWS: readonly SettingsRow[] = [
  {
    id: 'pref-rail',
    label: 'Show the SDLC phase rail above the prompt bar',
    hint: 'Off: phases still run from slash commands and show in the side panel.',
    file: 'prefs',
    header: true,
    control: 'switch',
    read: f => f.prefs.rail,
    write: on => pref({ rail: on }),
  },
  {
    id: 'pref-rail-layout',
    label: 'Rail layout',
    file: 'prefs',
    control: 'choice',
    options: () => [
      ['row', 'Full rail'],
      ['summary', 'Summary chip'],
    ],
    read: f => f.prefs.railLayout,
    write: value => pref({ railLayout: value === 'summary' ? 'summary' : 'row' }),
  },
  {
    id: 'pref-theme',
    label: 'Theme',
    file: 'prefs',
    control: 'choice',
    options: () => [
      ['auto', 'Auto'],
      ['light', 'Light'],
      ['dark', 'Dark'],
    ],
    read: f => f.prefs.theme,
    write: value => pref({ theme: value === 'light' || value === 'dark' ? value : 'auto' }),
  },
  {
    id: 'pref-ascii',
    label: 'ASCII glyphs',
    hint: 'Draw the rail with plain characters if your terminal shows boxes.',
    file: 'prefs',
    control: 'switch',
    read: f => f.prefs.ascii,
    write: on => pref({ ascii: on }),
  },
]

export const SECTIONS: readonly SectionDef[] = [
  {
    id: 'entry',
    title: 'Entry points',
    blurb: () => 'Ways into the flow that sit outside the 7 phases.',
    rows: ENTRY_ROWS,
  },
  {
    id: 'tracker',
    title: 'Issue tracker',
    blurb: () => 'Where specs and tickets live, and the label for each triage role.',
    rows: TRACKER_ROWS,
  },
  {
    id: 'docs',
    title: 'Docs layout',
    blurb: () => 'Where the glossary, ADRs and research notes are kept.',
    rows: DOCS_ROWS,
  },
  {
    id: 'glossary',
    title: 'Glossary',
    blurb: f =>
      `Terms in ${f.setup.docs.glossary}; grill-with-docs and domain-modeling add to it as you talk.`,
    rows: [],
    custom: 'glossary',
  },
  {
    id: 'pipeline',
    title: 'Pipeline',
    blurb: f => {
      const on = PHASE_ORDER.filter(p => f.config.phases[p].enabled).length
      return `${on} of ${PHASE_ORDER.length} phases on · a gate asks you to confirm before the next phase runs while this one is not done.`
    },
    rows: PIPELINE_ROWS,
  },
  {
    id: 'worktrees',
    title: 'Worktrees',
    blurb: () =>
      'Build agents each get their own git worktree, so parallel tickets never touch your checkout.',
    rows: WORKTREE_ROWS,
  },
  {
    id: 'automation',
    title: 'Automation',
    blurb: () => 'What Craftory does on its own.',
    rows: AUTOMATION_ROWS,
  },
  {
    id: 'personal',
    title: 'Personal',
    blurb: () => 'Yours alone: saved on this machine, never in the repo.',
    rows: PERSONAL_ROWS,
  },
]

export const ALL_ROWS: readonly SettingsRow[] = SECTIONS.flatMap(s => s.rows)

export const rowOf = (id: string): SettingsRow | undefined => ALL_ROWS.find(r => r.id === id)

export function pathOf(file: SettingsFile, setup: AgentSetup): string {
  switch (file) {
    case 'config':
      return CONFIG_FILE
    case 'tracker':
      return AGENT_DOCS.tracker
    case 'triage':
      return AGENT_DOCS.triage
    case 'domain':
      return AGENT_DOCS.domain
    case 'steering':
      return setup.steering
    case 'prefs':
      return '$.store'
    default: {
      const _exhaustive: never = file
      return _exhaustive
    }
  }
}

export const visibleRows = (section: SectionDef, facts: SettingsFacts): SettingsRow[] =>
  section.rows.filter(r => r.visible?.(facts) !== false)

export function checkText(row: SettingsRow & { control: 'text' }, text: string): string | null {
  if (text.trim() === '' && row.allowEmpty !== true) return `${row.label} needs a value`
  return row.check?.(text.trim()) ?? null
}
