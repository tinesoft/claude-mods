import { DEFAULT_LABELS } from '../src/agents-md'
import { DEFAULT_CONFIG } from '../src/config'
import type { FsListing, Read, ReadContext, ReadResult } from '../src/tracker'
import { WAYFINDER_FIXTURES } from './wayfinder-fixtures'

/** The mattpocock-skills range the fixture sets under `fixtures/wayfinder/` were made for. */
export const SKILLS_RANGE = '1.3'

/** A scenario as the repo files it is made of, keyed by path from the repo root. */
export function scenarioFiles(
  source: 'local' | 'github' | 'gitlab',
  scenario: string,
): Record<string, string> {
  const prefix = `${SKILLS_RANGE}/${source}/${scenario}/`
  return Object.fromEntries(
    Object.entries(WAYFINDER_FIXTURES)
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, text]) => [path.slice(prefix.length), text]),
  )
}

type Files = Record<string, string | { text: string; mtimeMs: number }>

/** An in-memory repo answering the reads a Local reader plans; it can list and read, nothing else. */
export const fs =
  (files: Files) =>
  async (reads: readonly Read[]): Promise<ReadResult[]> =>
    reads.map((read): ReadResult => {
      if (read.kind === 'read') {
        const file = files[read.path]
        return {
          kind: 'read',
          text: file === undefined ? null : typeof file === 'string' ? file : file.text,
        }
      }
      if (read.kind === 'list') {
        const dir = read.dir.replace(/\/$/, '') + '/'
        const seen = new Map<string, FsListing>()
        for (const [path, file] of Object.entries(files)) {
          if (!path.startsWith(dir)) continue
          const [first = '', ...more] = path.slice(dir.length).split('/')
          seen.set(first, {
            name: first,
            kind: more.length > 0 ? 'dir' : 'file',
            mtimeMs: typeof file === 'string' ? 1 : file.mtimeMs,
          })
        }
        return { kind: 'list', entries: seen.size === 0 ? null : [...seen.values()] }
      }
      throw new Error('the Local tracker only lists and reads')
    })

export const ctx: ReadContext = { config: DEFAULT_CONFIG, labels: DEFAULT_LABELS, now: 9 }

/**
 * What a `gh` answers from a GitHub scenario's canned output: `issue-list.json`,
 * `sub_issues-<n>.json` and `blocked_by-<n>.json`. A call with no file fails, as a repo without
 * native sub-issue or dependency support does. The first line of each file is its header comment.
 */
export const ghAnswer =
  (scenario: string) =>
  (argv: readonly string[]): { exitCode: number; stdout: string; stderr?: string } => {
    const api = /\/issues\/(\d+)\/(sub_issues|dependencies\/blocked_by)$/.exec(argv[2] ?? '')
    const name =
      argv[1] === 'issue'
        ? 'issue-list.json'
        : api
          ? `${api[2] === 'sub_issues' ? 'sub_issues' : 'blocked_by'}-${api[1]}.json`
          : undefined
    const file =
      name === undefined
        ? undefined
        : WAYFINDER_FIXTURES[`${SKILLS_RANGE}/github/${scenario}/${name}`]
    return file === undefined
      ? { exitCode: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' }
      : { exitCode: 0, stdout: file.slice(file.indexOf('\n') + 1) }
  }

/** The same answers as an executor for a reader's reads. */
export const gh =
  (scenario: string) =>
  async (reads: readonly Read[]): Promise<ReadResult[]> =>
    reads.map((read): ReadResult => {
      if (read.kind !== 'run') throw new Error('the GitHub tracker only runs gh')
      return { kind: 'run', argv: read.argv, ...ghAnswer(scenario)(read.argv) }
    })

/**
 * What a `glab` answers from a GitLab scenario's canned output: `issue-list.json` and
 * `links-<iid>.json`. A call with no file fails, as a project without native blocking links does
 * (they are a Premium feature). The first line of each file is its header comment.
 */
export const glabAnswer =
  (scenario: string) =>
  (argv: readonly string[]): { exitCode: number; stdout: string; stderr?: string } => {
    const links = /^projects\/[^/]+\/issues\/(\d+)\/links$/.exec(argv[2] ?? '')
    const name =
      argv[1] === 'issue' ? 'issue-list.json' : links ? `links-${links[1]}.json` : undefined
    const file =
      name === undefined
        ? undefined
        : WAYFINDER_FIXTURES[`${SKILLS_RANGE}/gitlab/${scenario}/${name}`]
    return file === undefined
      ? { exitCode: 1, stdout: '', stderr: '404 Not Found' }
      : { exitCode: 0, stdout: file.slice(file.indexOf('\n') + 1) }
  }

/** The same answers as an executor for a reader's reads. */
export const glab =
  (scenario: string) =>
  async (reads: readonly Read[]): Promise<ReadResult[]> =>
    reads.map((read): ReadResult => {
      if (read.kind !== 'run') throw new Error('the GitLab tracker only runs glab')
      return { kind: 'run', argv: read.argv, ...glabAnswer(scenario)(read.argv) }
    })
