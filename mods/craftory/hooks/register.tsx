import type { Register } from 'claude-code'

const PANE = 'craftory'
const COMMAND = 'craftory'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: "Show the active feature's phases, tickets, worktrees, glossary and settings",
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await $.ui.open({ id: PANE, title: 'Craftory', focus: true, closeOnEscape: true })
    return { text: 'Opened the Craftory pane.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box padding={1}>
        <Text>Craftory</Text>
      </Box>
    )
  })
}
