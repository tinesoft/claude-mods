import type { EntryId, PhaseId, SkillName } from '../types'

export const PLUGIN = 'mattpocock-skills'
export const INSTALL_ID = 'mattpocock-skills@claude-plugins-official'
export const TESTED_RANGE = { min: '1.3.0', below: '1.4.0', label: '1.3.x' } as const

export type PhaseSpec = {
  n: number
  label: string
  commands: readonly SkillName[]
  helpers: readonly SkillName[]
  defaultGate: boolean
  /**
   * What lets the next phase through its gate: the phase `done`, or only that it `ran`. A grill
   * ends when the user moves on, so Align waits on the user and cannot be done before Spec starts.
   */
  gateClears: 'done' | 'ran'
  why: string
  startedBy?: string
  artifactLabel: string
  pipelineDesc: string
  markDone: 'always' | 'untracked'
}

const skill = (name: string) => name as SkillName

export const SKILLS = {
  grillWithDocs: skill('grill-with-docs'),
  grillMe: skill('grill-me'),
  grilling: skill('grilling'),
  domainModeling: skill('domain-modeling'),
  prototype: skill('prototype'),
  research: skill('research'),
  toSpec: skill('to-spec'),
  toTickets: skill('to-tickets'),
  implementSpec: skill('implement-spec'),
  implement: skill('implement'),
  tdd: skill('tdd'),
  diagnosingBugs: skill('diagnosing-bugs'),
  codebaseDesign: skill('codebase-design'),
  codeReview: skill('code-review'),
  pr: skill('pr'),
  retro: skill('retro'),
  triage: skill('triage'),
  wayfinder: skill('wayfinder'),
  setupMattPocockSkills: skill('setup-matt-pocock-skills'),
  waitWhat: skill('wait-what'),
  handoff: skill('handoff'),
  improveArchitecture: skill('improve-codebase-architecture'),
} as const

export const PHASES = {
  align: {
    n: 1,
    label: 'Align',
    commands: [SKILLS.grillWithDocs, SKILLS.grillMe],
    helpers: [SKILLS.grilling, SKILLS.domainModeling, SKILLS.prototype, SKILLS.research],
    defaultGate: true,
    gateClears: 'ran',
    why: 'Interviews you about the plan until every branch is resolved, and writes the answers back to the docs.',
    artifactLabel: 'Updated',
    pipelineDesc: 'Interview until the plan has no open branches; answer design questions first.',
    markDone: 'always',
  },
  spec: {
    n: 2,
    label: 'Spec',
    commands: [SKILLS.toSpec],
    helpers: [],
    defaultGate: true,
    gateClears: 'done',
    why: 'Turns the conversation into a spec with user stories, decisions and an out-of-scope list, then publishes it.',
    artifactLabel: 'Written',
    pipelineDesc: 'Publish the plan as a spec on the tracker.',
    markDone: 'untracked',
  },
  tickets: {
    n: 3,
    label: 'Tickets',
    commands: [SKILLS.toTickets],
    helpers: [],
    defaultGate: false,
    gateClears: 'done',
    why: 'Splits the spec into thin vertical slices with blocking edges between them.',
    artifactLabel: 'Created',
    pipelineDesc: 'Thin vertical slices with blocking edges.',
    markDone: 'untracked',
  },
  build: {
    n: 4,
    label: 'Build',
    commands: [SKILLS.implementSpec, SKILLS.implement],
    helpers: [SKILLS.tdd, SKILLS.diagnosingBugs, SKILLS.codebaseDesign],
    defaultGate: true,
    gateClears: 'done',
    why: 'Runs every unblocked ticket in parallel on one integration branch, one subagent per ticket.',
    artifactLabel: 'Integration branch',
    pipelineDesc: 'Red-green-refactor per ticket.',
    markDone: 'untracked',
  },
  review: {
    n: 5,
    label: 'Review',
    commands: [],
    helpers: [SKILLS.codeReview],
    defaultGate: true,
    gateClears: 'done',
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
    helpers: [SKILLS.pr],
    defaultGate: false,
    gateClears: 'done',
    why: 'Rewrites the draft PR body with evidence and a merge-danger call, then marks it ready. Merging stays with you.',
    startedBy: 'The agent uses pr on the draft PR that Build opened.',
    artifactLabel: 'Will mark ready',
    pipelineDesc: 'Rewrite the draft PR body, then mark it ready.',
    markDone: 'always',
  },
  retro: {
    n: 7,
    label: 'Retro',
    commands: [SKILLS.retro],
    helpers: [],
    defaultGate: false,
    gateClears: 'done',
    why: 'Suggests ranked improvements to your skills, glossary and steering file.',
    artifactLabel: 'Runs',
    pipelineDesc: 'Ranked improvements for skills, glossary and steering file.',
    markDone: 'always',
  },
} as const satisfies Record<PhaseId, PhaseSpec>

export const PHASE_ORDER = Object.keys(PHASES) as PhaseId[]

export const ENTRIES = {
  triage: { label: 'Triage', commands: [SKILLS.triage] },
  wayfinder: { label: 'Wayfinder', commands: [SKILLS.wayfinder] },
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
register(SKILLS.codeReview, skill => ({ kind: 'phase', phase: 'review', skill }))
register(SKILLS.pr, skill => ({ kind: 'phase', phase: 'ship', skill }))
for (const phase of PHASE_ORDER) {
  for (const skill of PHASES[phase].commands)
    register(skill, k => ({ kind: 'phase', phase, skill: k }))
}
for (const entry of Object.keys(ENTRIES) as EntryId[]) {
  for (const skill of ENTRIES[entry].commands)
    register(skill, k => ({ kind: 'entry', entry, skill: k }))
}
register(SKILLS.setupMattPocockSkills, skill => ({ kind: 'setup', skill }))
register(SKILLS.waitWhat, skill => ({ kind: 'glossary', skill }))

export const KNOWN_SKILLS = [...BY_SKILL.keys()] as SkillName[]

/**
 * What a typed or model-invoked name means to Craftory. A namespaced `mattpocock-skills:x` is
 * always ours. A bare name is ours only when `bare` says so: another source (a built-in, the
 * project, another plugin) may own the name, and Craftory must not gate that.
 */
export function recognise(
  name: string,
  { bare }: { bare?: (skill: string) => boolean } = {},
): Recognised | undefined {
  const trimmed = name.replace(/^\//, '')
  const at = trimmed.indexOf(':')
  const skill = trimmed.slice(at + 1)
  if (at === -1 ? bare?.(skill) !== true : trimmed.slice(0, at) !== PLUGIN) return undefined
  return BY_SKILL.get(skill)?.(skill as SkillName)
}

export const namespaced = (skill: SkillName) => `${PLUGIN}:${skill}`

export function predecessor(phase: PhaseId, isOn: (p: PhaseId) => boolean): PhaseId | undefined {
  return PHASE_ORDER.slice(0, PHASE_ORDER.indexOf(phase)).reverse().find(isOn)
}
