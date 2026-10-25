/**
 * Band notices computed from facts, never stored: plugin missing or out of range, installing,
 * restart needed, install failed, first run and no feature in flight. `dismissed` hides the
 * "Not now" ones for the session. Event notices (gates, budget, rebase conflicts) are stored; drift and retro arrive with M5.
 */
import type {
  EventNotice,
  InstallState,
  NoticeKey,
  PluginStatus,
  RepoSnapshot,
  SkillName,
} from '../types'
import { budgetK } from './build'
import { driftText, retroText } from './drift'
import { gateText } from './gates'
import { PLUGIN, TESTED_RANGE } from './phases'
import type { Role } from './theme'

export type NoticeAction =
  | { kind: 'install' }
  | { kind: 'update' }
  | { kind: 'not-now'; key: NoticeKey }
  | { kind: 'setup' } // opens the Settings tab
  | { kind: 'run'; skill: SkillName; args: string }
  | { kind: 'run-anyway'; id: string }
  | { kind: 'diagnose'; id: string }
  | { kind: 'raise-budget'; id: string }
  | { kind: 'resolve'; id: string } // opens the Worktrees tab
  | { kind: 'rename'; id: string } // opens Settings › Glossary on the drifting term
  | { kind: 'review-retro'; id: string } // opens the Flow tab on the Retro result
  | { kind: 'open-tickets' } // opens the pane on the Tickets tab
  | { kind: 'dismiss'; id: string }

export type NoticeButton = { id: string; label: string; action: NoticeAction; primary?: true }

export type NoticeView = {
  id: string
  role: Role
  /** The `mattpocock-skills` part of the text is set in mono on rich surfaces. */
  text: string
  actions: NoticeButton[]
  /** Replaces the rail instead of sitting above it. */
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
      // Shown only while the plugin is still not loaded; once it is, the notice is stale.
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

/**
 * The notices to draw, highest priority only: an install in flight or failed, then the plugin,
 * then first run, then no feature. A dismissed plugin notice falls through to the next.
 */
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
            action: { kind: 'run', skill: 'grill-with-docs' as SkillName, args: '' },
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
  action: { kind: 'dismiss', id },
})

/** The band row of a stored event notice. */
export function eventNotice(notice: EventNotice): NoticeView | undefined {
  switch (notice.kind) {
    case 'gate':
      return {
        id: notice.id,
        role: 'hook',
        text: gateText(notice.phase, notice.reason),
        replacesRail: false,
        actions: [
          {
            id: `run-anyway-${notice.phase}`,
            label: 'Run anyway',
            action: { kind: 'run-anyway', id: notice.id },
            primary: true,
          },
          {
            id: `diagnose-${notice.phase}`,
            label: 'Diagnose',
            action: { kind: 'diagnose', id: notice.id },
          },
          dismiss(notice.id),
        ],
      }
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
            action: { kind: 'raise-budget', id: notice.id },
            primary: true,
          },
          {
            id: `diagnose-${notice.ticket}`,
            label: 'Diagnose',
            action: { kind: 'diagnose', id: notice.id },
          },
          dismiss(notice.id),
        ],
      }
    case 'rebase-conflict':
      return {
        id: notice.id,
        role: 'hook',
        text: `Rebase conflict in ${notice.worktree} · agent paused`,
        replacesRail: false,
        actions: [
          {
            id: `resolve-${notice.ticket}`,
            label: 'Resolve',
            action: { kind: 'resolve', id: notice.id },
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
            action: { kind: 'rename', id: notice.id },
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
            action: { kind: 'review-retro', id: notice.id },
            primary: true,
          },
          dismiss(notice.id),
        ],
      }
    default: {
      const _exhaustive: never = notice
      return _exhaustive
    }
  }
}

/** The two newest event notices, oldest first. */
export const eventNotices = (notices: readonly EventNotice[]): NoticeView[] =>
  notices.slice(-2).flatMap(n => eventNotice(n) ?? [])
