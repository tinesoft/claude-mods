/** The oldest Claude Code that draws the band and pane: a Button of Text children, Box gaps. */
export const ENGINE_FLOOR = '2.1.299'

const numbers = (release: string) => release.split('-')[0]!.split('.').map(Number)

/** Whether a release `base` is at or past the floor; a build that names no release is trusted. */
export const meetsFloor = (base: string | undefined) => {
  if (base === undefined) return true
  const have = numbers(base)
  const need = numbers(ENGINE_FLOOR)
  const differs = need.findIndex((n, i) => (have[i] ?? 0) !== n)
  return differs === -1 || (have[differs] ?? 0) > need[differs]!
}
