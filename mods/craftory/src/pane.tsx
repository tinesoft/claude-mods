/** The pane body. Placeholder until M5: a title, the plugin line and the temporary setup button. */
import type { PaneTab, Tone } from '../types'
import type { Ui } from './rail'
import { SPACE, TOKENS } from './theme'

export type PaneArgs = {
  ui: Ui
  tone: Tone | undefined
  tab: PaneTab
  pluginLine: string
  setupNote: string | null
  on: { writeSetup: () => void }
}

export function renderPane({ ui, tone, tab, pluginLine, setupNote, on }: PaneArgs) {
  const { Box, Button, Text } = ui
  const quiet = tone === undefined ? { dimColor: true } : { color: TOKENS[tone].text2 }
  return (
    <Box
      flexDirection="column"
      paddingLeft={SPACE.paneLeft}
      paddingRight={SPACE.paneRight}
      rowGap={SPACE.paneGap}
    >
      <Text bold>Craftory</Text>
      <Text {...quiet}>{pluginLine}</Text>
      {tab === 'settings' && (
        <Box flexDirection="column" rowGap={SPACE.paneGap}>
          <Button key="pane-write-setup" onPress={() => on.writeSetup()}>
            <Text>Write setup with detected defaults</Text>
          </Button>
          {setupNote !== null && <Text {...quiet}>{setupNote}</Text>}
        </Box>
      )}
    </Box>
  )
}
