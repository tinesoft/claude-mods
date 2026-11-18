import type {
  EventNotice,
  OverBudgetRefusal,
  SpendBudgetNotice,
  ThrottleNotice,
  InstallState,
  IssueRef,
  NoticeKey,
  PluginStatus,
  RepoSnapshot,
} from '../types'
import type { Action } from './action'
import { overBudgetText } from './budgets'
import { budgetK } from './build'
import { driftText, retroText } from './drift'
import { gateText, hardGateText } from './gates'
import { PHASES, PLUGIN, SKILLS, TESTED_RANGE } from './phases'
import type { Role } from './theme'

/**
 * The held notices the pane shows too, so a surface with no band still sees them: a gate or an
 * over-budget refusal holding a press, and the warning that Build is throttled.
 */
export const PANE_NOTICES: ReadonlySet<EventNotice['kind']> = new Set([
  'gate',
  'over-budget-refusal',
  'throttle',
])

export type NoticeButton = { id: string; label: string; action: Action; primary?: true }

export type NoticeView = {
  id: string
  role: Role
  text: string
  actions: NoticeButton[]
  replacesRail: boolean
  isBusy?: true
}

const NEEDS = `Craftory needs ${PLUGIN} ${TESTED_RANGE.label}`

const pluginNotice = (plugin: PluginStatus): NoticeView | undefined => {
  if (plugin.kind === 'missing') {
    return {
      id: 'plugin',
      role: 'hook',
      text: NEEDS,
      replacesRail: true,
      actions: [
        { id: 'install', label: 'Install', action: { kind: 'install' }, primary: true },
        { id: 'not-now', label: 'Not now', action: { kind: 'not-now', key: 'plugin' } },
      ],
    }
  }
  if (plugin.kind === 'present' && plugin.inRange === false) {
    return {
      id: 'plugin',
      role: 'hook',
      text: `${NEEDS} · found ${plugin.version}`,
      replacesRail: true,
      actions: [
        { id: 'update', label: 'Update', action: { kind: 'update' }, primary: true },
        { id: 'not-now', label: 'Not now', action: { kind: 'not-now', key: 'plugin' } },
      ],
    }
  }
  return undefined
}

function installNotice(install: InstallState, needsPlugin: boolean): NoticeView | undefined {
  switch (install.kind) {
    case 'installing':
      return {
        id: 'installing',
        role: 'skill',
        text: `Installing ${PLUGIN}…`,
        replacesRail: true,
        actions: [],
        isBusy: true,
      }
    case 'restart':
      return needsPlugin
        ? {
            id: 'restart',
            role: 'skill',
            text: 'Installed. Run /reload-plugins to load it.',
            replacesRail: true,
            actions: [],
          }
        : undefined
    case 'failed':
      return {
        id: 'install-failed',
        role: 'danger',
        text: `Install failed: ${install.message}`,
        replacesRail: true,
        actions: [
          { id: 'install', label: 'Install again', action: { kind: 'install' }, primary: true },
        ],
      }
    case 'idle':
      return undefined
    default: {
      const _exhaustive: never = install
      return _exhaustive
    }
  }
}

export function derivedNotices(args: {
  plugin: PluginStatus
  install: InstallState
  repo: RepoSnapshot | null
  hasFeature: boolean
  firstRunText: string
  dismissed: readonly NoticeKey[]
}): NoticeView[] {
  const { plugin, install, repo, hasFeature, firstRunText, dismissed } = args
  const plugged = pluginNotice(plugin)
  const installing = installNotice(install, plugged !== undefined || plugin.kind === 'missing')
  if (installing) return [installing]
  if (plugged && !dismissed.includes('plugin')) return [plugged]
  if (repo === null) return []
  if (repo.setup.state === 'absent' && !dismissed.includes('first-run')) {
    return [
      {
        id: 'first-run',
        role: 'neutral',
        text: firstRunText,
        replacesRail: true,
        actions: [
          { id: 'setup', label: 'Set up Craftory', action: { kind: 'setup' }, primary: true },
        ],
      },
    ]
  }
  if (!hasFeature && plugin.kind === 'present' && !dismissed.includes('no-feature')) {
    return [
      {
        id: 'no-feature',
        role: 'neutral',
        text: 'Start a feature: talk it through first.',
        replacesRail: true,
        actions: [
          {
            id: 'run',
            label: '/grill-with-docs',
            action: { kind: 'run', skill: SKILLS.grillWithDocs, args: '' },
          },
        ],
      },
    ]
  }
  return []
}

const dismiss = (id: string): NoticeButton => ({
  id: `dismiss-${id}`,
  label: 'Dismiss',
  action: { kind: 'dismiss', noticeId: id },
})

/** An open map the Feature can join: its name, its ref to store, and the argument `/wayfinder` takes. */
export type AttachTarget = { name: string; ref: IssueRef; arg: string }

/** What the suggest notice needs to know now: the switch, the Feature's link, and a map to join. */
export type WayfinderOffer = {
  enabled: boolean
  hasLink: boolean
  attach: AttachTarget | null
}

/** `5-hour window at 84% · Build runs 1 implementer at a time until it resets at 18:40`. */
export function throttleText(n: Omit<ThrottleNotice, 'kind' | 'id'>): string {
  const implementers = n.parallel === 1 ? '1 implementer' : `${n.parallel} implementers`
  const until = n.resets === null ? 'until it resets' : `until it resets at ${n.resets}`
  return `${n.window} window at ${n.percent}% · Build runs ${implementers} at a time ${until}`
}

/**
 * The buttons both overrun notices share: Raise budget, only where the Feature has a record to
 * raise it on, and Diagnose about `about`. Their ids are `<raise>-<scope>` and `<diagnose>-<scope>`.
 */
function overrunButtons(
  notice: SpendBudgetNotice | OverBudgetRefusal,
  ids: { raise: string; diagnose: string },
  about: string,
): { raise: NoticeButton[]; diagnose: NoticeButton } {
  const { key, scope } = notice
  return {
    raise: notice.canRaise
      ? [
          {
            id: `${ids.raise}-${scope}`,
            label: 'Raise budget',
            action: { kind: 'raise-spend-budget', key, scope },
            primary: true,
          },
        ]
      : [],
    diagnose: {
      id: `${ids.diagnose}-${scope}`,
      label: 'Diagnose',
      action: { kind: 'diagnose', noticeId: notice.id, about },
    },
  }
}

/** `Build is at $12.40 of $12`, with Raise budget (a specced Feature only), Continue and Diagnose. */
function spendBudgetNotice(notice: SpendBudgetNotice): NoticeView {
  const text = overBudgetText(notice)
  const { key, scope } = notice
  const { raise, diagnose } = overrunButtons(
    notice,
    { raise: 'raise-spend-budget', diagnose: 'diagnose-budget' },
    `${text}: find out why it cost so much`,
  )
  return {
    id: notice.id,
    role: 'danger',
    text,
    replacesRail: false,
    actions: [
      ...raise,
      {
        id: `continue-budget-${scope}`,
        label: 'Continue',
        action: {
          kind: 'continue-spend-budget',
          noticeId: notice.id,
          key,
          scope,
          budget: notice.budget,
        },
        ...(!notice.canRaise && { primary: true as const }),
      },
      diagnose,
    ],
  }
}

/** A press deny.overBudget refused: Raise budget (a specced Feature only), Diagnose and Dismiss. */
function overBudgetRefusalNotice(notice: OverBudgetRefusal): NoticeView {
  const over = overBudgetText(notice)
  const { raise, diagnose } = overrunButtons(
    notice,
    { raise: 'raise-refused-budget', diagnose: 'diagnose-over-budget' },
    `${over}, over its budget`,
  )
  return {
    id: notice.id,
    role: 'danger',
    text: `${over} · deny.${notice.via} refuses /${notice.skill}`,
    replacesRail: false,
    actions: [
      ...raise,
      { ...diagnose, ...(!notice.canRaise && { primary: true as const }) },
      dismiss(notice.id),
    ],
  }
}

export function eventNotice(notice: EventNotice, offer?: WayfinderOffer): NoticeView | undefined {
  switch (notice.kind) {
    case 'gate':
      return {
        id: notice.id,
        role: 'hook',
        text:
          notice.hard === true
            ? hardGateText(notice.phase, notice.by, notice.reason)
            : gateText(notice.phase, notice.reason),
        replacesRail: false,
        actions: [
          ...(notice.hard === true
            ? []
            : [
                {
                  id: `run-anyway-${notice.phase}`,
                  label: 'Run anyway',
                  action: {
                    kind: 'run-anyway',
                    noticeId: notice.id,
                    phase: notice.phase,
                    skill: notice.skill,
                    args: notice.args,
                  },
                  primary: true,
                } satisfies NoticeButton,
              ]),
          {
            id: `diagnose-${notice.phase}`,
            label: 'Diagnose',
            action: {
              kind: 'diagnose',
              noticeId: notice.id,
              about: `${PHASES[notice.phase].label} is gated: ${notice.reason}`,
            },
            ...(notice.hard === true && { primary: true as const }),
          },
          dismiss(notice.id),
        ],
      }
    case 'over-budget-refusal':
      return overBudgetRefusalNotice(notice)
    case 'spec-published':
      return {
        id: notice.id,
        role: 'perm',
        text: `Spec ${notice.spec} published${notice.stories ? ` · ${notice.stories} user stories` : ''}`,
        replacesRail: false,
        actions: [
          { id: 'open', label: 'Open', action: { kind: 'open-tickets' }, primary: true },
          dismiss(notice.id),
        ],
      }
    case 'budget':
      return {
        id: notice.id,
        role: 'danger',
        text: `Agent ${notice.ticket} hit its ${budgetK(notice.budget)} budget · worktree kept`,
        replacesRail: false,
        actions: [
          {
            id: `raise-budget-${notice.ticket}`,
            label: 'Raise budget',
            action: { kind: 'raise-budget', ticket: notice.ticket },
            primary: true,
          },
          {
            id: `diagnose-${notice.ticket}`,
            label: 'Diagnose',
            action: {
              kind: 'diagnose',
              noticeId: notice.id,
              about: `Agent ${notice.ticket} hit its ${budgetK(notice.budget)} budget`,
            },
          },
          dismiss(notice.id),
        ],
      }
    case 'rebase-conflict':
      return {
        id: notice.id,
        role: 'hook',
        text: `Rebase conflict in ${notice.worktree} · agent stopped`,
        replacesRail: false,
        actions: [
          {
            id: `resolve-${notice.ticket}`,
            label: 'Resolve',
            action: { kind: 'resolve', noticeId: notice.id },
            primary: true,
          },
          dismiss(notice.id),
        ],
      }
    case 'drift':
      return {
        id: notice.id,
        role: 'hook',
        text: driftText(notice),
        replacesRail: false,
        actions: [
          {
            id: `rename-${notice.id}`,
            label: 'Rename',
            action: { kind: 'rename', noticeId: notice.id, term: notice.term },
            primary: true,
          },
          dismiss(notice.id),
        ],
      }
    case 'retro-ready':
      return {
        id: notice.id,
        role: 'perm',
        text: retroText(notice.suggestions),
        replacesRail: false,
        actions: [
          {
            id: 'review-retro',
            label: 'Review',
            action: { kind: 'review-retro', noticeId: notice.id },
            primary: true,
          },
          dismiss(notice.id),
        ],
      }
    case 'suggest-wayfinder':
      if (offer === undefined || !offer.enabled || offer.hasLink) return undefined
      return {
        id: notice.id,
        role: 'perm',
        text: 'Chart a map instead? · /wayfinder',
        replacesRail: false,
        actions: [
          {
            id: 'wayfinder',
            label: offer.attach ? `Attach to ${offer.attach.name}` : '/wayfinder',
            action: {
              kind: 'wayfinder',
              noticeId: notice.id,
              args: offer.attach?.arg ?? '',
              ...(offer.attach && { map: offer.attach.ref }),
            },
            primary: true,
          },
          {
            id: 'dismiss-suggest-wayfinder',
            label: 'Dismiss',
            action: { kind: 'dismiss-wayfinder', noticeId: notice.id },
          },
        ],
      }
    case 'spend-budget':
      return spendBudgetNotice(notice)
    case 'throttle':
      return {
        id: notice.id,
        role: 'hook',
        text: throttleText(notice),
        replacesRail: false,
        actions: [dismiss(notice.id)],
      }
    case 'automation':
      return {
        id: notice.id,
        role: 'perm',
        text: notice.text,
        replacesRail: false,
        actions: [
          ...(notice.run
            ? [
                {
                  id: `run-${notice.id}`,
                  label: notice.run.label,
                  action: {
                    kind: 'automation-run',
                    noticeId: notice.id,
                    skill: notice.run.skill,
                    args: notice.run.args,
                  },
                  primary: true,
                } satisfies NoticeButton,
              ]
            : []),
          dismiss(notice.id),
        ],
      }
    default: {
      const _exhaustive: never = notice
      return _exhaustive
    }
  }
}

export const eventNotices = (
  notices: readonly EventNotice[],
  offer?: WayfinderOffer,
): NoticeView[] => notices.flatMap(n => eventNotice(n, offer) ?? []).slice(-2)
