/**
 * GitLab and Other trackers (plan decision 11): the Tickets tab shows links, not issues. Nothing
 * is read from the tracker itself, so each kind plans no reads and `parse` builds the links from
 * what Settings stored: the instance and project for GitLab, the user's own paragraph for Other.
 */
import type { TrackerLink, TrackerSnapshot } from '../../types'
import type { ReadContext, TrackerSpec } from './index'

const hostOf = (url: string) => {
  const match = /^https?:\/\/([^/\s]+)/i.exec(url)
  return match ? match[1]! : url
}

/** `gitlab.com` and `https://gitlab.com/` both give `https://gitlab.com`. */
export const instanceUrl = (instance: string): string => {
  const trimmed = instance.trim().replace(/\/+$/, '')
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/** The project's GitLab pages; empty until a project path is known. */
export function gitlabLinks(args: {
  instance: string
  project: string
  triageLabel: string
  remoteWeb: string | null
}): TrackerLink[] {
  const project = args.project.trim().replace(/^\/+|\/+$/g, '')
  const base =
    project !== ''
      ? `${instanceUrl(args.instance)}/${project}`
      : (args.remoteWeb?.replace(/\/+$/, '') ?? null)
  if (base === null) return []
  return [
    { label: 'Issues', url: `${base}/-/issues` },
    {
      label: `Needs triage`,
      url: `${base}/-/issues?label_name[]=${encodeURIComponent(args.triageLabel)}`,
    },
    { label: 'Merge requests', url: `${base}/-/merge_requests` },
  ]
}

const URL_IN_TEXT = /https?:\/\/[^\s)>\]"'`]+/gi

/** Every distinct link in the user's description, labelled by its host. */
export function otherLinks(description: string): TrackerLink[] {
  const urls = [...new Set(description.match(URL_IN_TEXT) ?? [])].map(u =>
    u.replace(/[.,;:]+$/, ''),
  )
  return urls.map(url => ({ label: hostOf(url), url }))
}

/** The paragraph a user wrote under the `# Issue tracker: Other` heading, or null. */
export function otherNote(description: string): string | null {
  const body = description.replace(/^# .*\n?/m, '').trim()
  return body === '' ? null : body
}

const snapshot = (
  kind: 'gitlab' | 'other',
  links: TrackerLink[],
  note: string | null,
  at: number,
): TrackerSnapshot => ({
  kind,
  rich: false,
  links,
  note,
  at,
})

export const gitlab: TrackerSpec = {
  label: 'GitLab',
  rich: false,
  plan: () => [],
  parse: (ctx: ReadContext) =>
    snapshot(
      'gitlab',
      gitlabLinks({
        ...ctx.config.tracker.gitlab,
        triageLabel: ctx.labels['needs-triage'],
        remoteWeb: ctx.remoteWeb ?? null,
      }),
      null,
      ctx.now,
    ),
  touches: () => false,
  header: ctx => {
    const { instance, project } = ctx.config.tracker.gitlab
    return `GitLab · ${project.trim() === '' ? hostOf(instanceUrl(instance)) : project.trim()}`
  },
}

export const other: TrackerSpec = {
  label: 'Other',
  rich: false,
  plan: () => [],
  parse: ctx =>
    snapshot(
      'other',
      otherLinks(ctx.otherDescription ?? ''),
      otherNote(ctx.otherDescription ?? ''),
      ctx.now,
    ),
  touches: () => false,
  header: () => 'Other tracker',
}
