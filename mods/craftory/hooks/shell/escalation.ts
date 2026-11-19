import { atom, type EngineInterface, read, update } from 'claude-code'
import type { IssueRef } from '../../types'

const escalationsState = atom({ plugin: 'craftory', key: 'escalations' } as const, {})

/** The tickets a press of **Retry on …** is waiting to start, and the model each gets. */
export async function pendingEscalations(
  $: EngineInterface,
): Promise<Readonly<Record<IssueRef, string>>> {
  return read($, escalationsState)
}

export async function escalate($: EngineInterface, ticket: IssueRef, model: string) {
  await update($, escalationsState, pending => ({ ...pending, [ticket]: model }))
}

export async function clearEscalation($: EngineInterface, ticket: IssueRef) {
  await update($, escalationsState, pending =>
    ticket in pending
      ? (Object.fromEntries(Object.entries(pending).filter(([ref]) => ref !== ticket)) as Record<
          IssueRef,
          string
        >)
      : pending,
  )
}
