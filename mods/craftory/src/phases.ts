/**
 * The phase registry: the one list of phases, their commands, helpers, copy and gate default.
 * Config defaults, Settings pipeline rows, rail steps, card copy and command recognition all
 * derive from PHASES, so a new phase cannot be added in one list and forgotten in another.
 */
import type { EntryId, PhaseId, SkillName } from '../types'

export const PLUGIN = 'mattpocock-skills'
export const INSTALL_ID = 'mattpocock-skills@claude-plugins-official'
/** Plan O2. Widened per release after the end-to-end fixture passes. */
export const TESTED_RANGE = { min: '1.3.0', below: '1.4.0', label: '1.3.x' } as const

export type PhaseSpec = {
  n: number
  label: string
  /** Alternatives the user can pick in Settings; the first is the default. Empty: no command. */
  commands: readonly SkillName[]
  helpers: readonly SkillName[]
  defaultGate: boolean
  why: string
  /** "None to type" line when `commands` is empty. */
  startedBy?: string
  artifactLabel: string
  pipelineDesc: string
  /**
   * When a person may mark the phase done. `always`: nothing on the tracker can show it.
   * `untracked`: Local and GitHub hold a real issue as evidence, so only GitLab and Other
   * (links, no issues) take a mark.
   */
  markDone: 'always' | 'untracked'
}

const s = (name: string) => name as SkillName

export const PHASES = {
  align: {
    n: 1,
    label: 'Align',
    commands: [s('grill-with-docs'), s('grill-me')],
    helpers: [s('grilling'), s('domain-modeling'), s('prototype'), s('research')],
    defaultGate: true,
    why: 'Interviews you about the plan until every branch is resolved, and writes the answers back to the docs.',
    artifactLabel: 'Updated',
    pipelineDesc: 'Interview until the plan has no open branches; answer design questions first.',
    markDone: 'always',
  },
  spec: {
    n: 2,
    label: 'Spec',
    commands: [s('to-spec')],
    helpers: [],
    defaultGate: true,
    why: 'Turns the conversation into a spec with user stories, decisions and an out-of-scope list, then publishes it.',
    artifactLabel: 'Written',
    pipelineDesc: 'Publish the plan as a spec on the tracker.',
    markDone: 'untracked',
  },
  tickets: {
    n: 3,
    label: 'Tickets',
    commands: [s('to-tickets')],
    helpers: [],
    defaultGate: false,
    why: 'Splits the spec into thin vertical slices with blocking edges between them.',
    artifactLabel: 'Created',
    pipelineDesc: 'Thin vertical slices with blocking edges.',
    markDone: 'untracked',
  },
  build: {
    n: 4,
    label: 'Build',
    commands: [s('implement-spec'), s('implement')],
    helpers: [s('tdd'), s('diagnosing-bugs'), s('codebase-design')],
    defaultGate: true,
    why: 'Runs every unblocked ticket in parallel on one integration branch, one subagent per ticket.',
    artifactLabel: 'Integration branch',
    pipelineDesc: 'Red-green-refactor per ticket.',
    markDone: 'untracked',
  },
  review: {
    n: 5,
    label: 'Review',
    commands: [],
    helpers: [s('code-review')],
    defaultGate: true,
    why: 'The close-out of implement-spec: the diff is checked against your standards and the spec, and one agent fixes what they find.',
    startedBy: 'Runs as the end of Build.',
    artifactLabel: 'Will check against',
    pipelineDesc: 'Diff checked against standards and the spec.',
    markDone: 'always',
  },
  ship: {
    n: 6,
    label: 'Ship',
    commands: [],
    helpers: [s('pr')],
    defaultGate: false,
    why: 'Rewrites the draft PR body with evidence and a merge-danger call, then marks it ready. Merging stays with you.',
    startedBy: 'The agent uses pr on the draft PR that Build opened.',
    artifactLabel: 'Will mark ready',
    pipelineDesc: 'Rewrite the draft PR body, then mark it ready.',
    markDone: 'always',
  },
  retro: {
    n: 7,
    label: 'Retro',
    commands: [s('retro')],
    helpers: [],
    defaultGate: false,
    why: 'Suggests ranked improvements to your skills, glossary and steering file.',
    artifactLabel: 'Runs',
    pipelineDesc: 'Ranked improvements for skills, glossary and steering file.',
    markDone: 'always',
  },
} as const satisfies Record<PhaseId, PhaseSpec>

export const PHASE_ORDER = Object.keys(PHASES) as PhaseId[]

export const ENTRIES = {
  triage: { label: 'Triage', commands: [s('triage')] },
  wayfinder: { label: 'Wayfinder', commands: [s('wayfinder')] },
} as const satisfies Record<EntryId, { label: string; commands: readonly SkillName[] }>

export type Recognised =
  | { kind: 'phase'; phase: PhaseId; skill: SkillName }
  | { kind: 'entry'; entry: EntryId; skill: SkillName }
  | { kind: 'helper'; phase: PhaseId; skill: SkillName }
  | { kind: 'setup'; skill: SkillName }
  | { kind: 'glossary'; skill: SkillName }

const BY_SKILL = new Map<string, (skill: SkillName) => Recognised>()
const register = (name: SkillName, make: (skill: SkillName) => Recognised) =>
  BY_SKILL.set(name, make)
for (const phase of PHASE_ORDER) {
  for (const skill of PHASES[phase].helpers)
    register(skill, k => ({ kind: 'helper', phase, skill: k }))
}
// code-review and pr are helpers upstream, but they are the observable start of Review and Ship.
register(s('code-review'), skill => ({ kind: 'phase', phase: 'review', skill }))
register(s('pr'), skill => ({ kind: 'phase', phase: 'ship', skill }))
for (const phase of PHASE_ORDER) {
  for (const skill of PHASES[phase].commands)
    register(skill, k => ({ kind: 'phase', phase, skill: k }))
}
for (const entry of Object.keys(ENTRIES) as EntryId[]) {
  for (const skill of ENTRIES[entry].commands)
    register(skill, k => ({ kind: 'entry', entry, skill: k }))
}
register(s('setup-matt-pocock-skills'), skill => ({ kind: 'setup', skill }))
register(s('wait-what'), skill => ({ kind: 'glossary', skill }))

/**
 * `mattpocock-skills:to-spec` resolves to the spec phase. Only the namespaced form counts when
 * `strict`, because a user copy of a skill under another plugin is not Matt's.
 */
export function recognise(name: string, { strict = true } = {}): Recognised | undefined {
  const bare = name.replace(/^\//, '')
  const at = bare.indexOf(':')
  if (at === -1 ? strict : bare.slice(0, at) !== PLUGIN) return undefined
  return BY_SKILL.get(bare.slice(at + 1))?.(bare.slice(at + 1) as SkillName)
}

export const namespaced = (skill: SkillName) => `${PLUGIN}:${skill}`

/** The phase before `phase` for which `isOn` holds: the one whose gate guards it. */
export function predecessor(phase: PhaseId, isOn: (p: PhaseId) => boolean): PhaseId | undefined {
  return PHASE_ORDER.slice(0, PHASE_ORDER.indexOf(phase)).reverse().find(isOn)
}
