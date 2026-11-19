import { atom, type EngineInterface, read, update } from 'claude-code'
import type { ContextGiven } from '../../types'

const givenState = atom({ plugin: 'craftory', key: 'contextGiven' } as const, null)

/** One run of a command as both hooks name it: `mattpocock-skills:implement csv/03`. */
export const runKey = (name: string, args: string) => `${name} ${args.trim()}`

/**
 * The lines of `lines` the other hook has not given to this run already. A pressed or automated
 * command may reach both `command.run` and `prompt.submit` (the host does not say whether it
 * raises the second), so whichever comes second leaves out what the first gave.
 */
export async function contextOnce(
  $: EngineInterface,
  run: string,
  by: ContextGiven['by'],
  lines: readonly string[],
): Promise<string[]> {
  if (lines.length === 0) return []
  const given = await read($, givenState)
  if (given !== null && given.run === run && given.by !== by) {
    await update($, givenState, () => null)
    return lines.filter(line => !given.lines.includes(line))
  }
  await update($, givenState, () => ({ run, by, lines: [...lines] }))
  return [...lines]
}

/** The main turn ended: the run it carried is over, so its context may be given again. */
export async function forgetContextGiven($: EngineInterface) {
  await update($, givenState, () => null)
}
