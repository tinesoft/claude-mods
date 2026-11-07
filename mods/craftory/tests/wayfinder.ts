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
