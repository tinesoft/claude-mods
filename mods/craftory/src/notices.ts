import type { EventNotice, InstallState, NoticeKey, PluginStatus, RepoSnapshot } from '../types'
import type { Action } from './action'
import { budgetK } from './build'
import { driftText, retroText } from './drift'
import { gateText } from './gates'
import { PHASES, PLUGIN, SKILLS, TESTED_RANGE } from './phases'
import type { Role } from './theme'

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
            action: {
              kind: 'run-anyway',
              noticeId: notice.id,
              phase: notice.phase,
              skill: notice.skill,
              args: notice.args,
            },
            primary: true,
          },
          {
            id: `diagnose-${notice.phase}`,
            label: 'Diagnose',
            action: {
              kind: 'diagnose',
              noticeId: notice.id,
              about: `${PHASES[notice.phase].label} is gated: ${notice.reason}`,
            },
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
    default: {
      const _exhaustive: never = notice
      return _exhaustive
    }
  }
}

export const eventNotices = (notices: readonly EventNotice[]): NoticeView[] =>
  notices.slice(-2).flatMap(n => eventNotice(n) ?? [])
