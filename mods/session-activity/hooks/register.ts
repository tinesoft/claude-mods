import type { Register } from 'claude-code'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'session-activity', description: 'Show session activity' })
    return next(e)
  })
  on('command.run', { command: 'session-activity' }, () => ({ text: 'Session activity' }))
}
