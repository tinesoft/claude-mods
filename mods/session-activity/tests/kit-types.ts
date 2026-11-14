// Compile-time guard: the plugin's `types/index.d.ts` must be self-contained (no imports), so it
// declares Tone and ThemeChoice itself. This fails typecheck if either drifts from the kit's.
import type { ThemeChoice, Tone } from '../src/_kit/types'
import type * as Contract from '../types'

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

export const toneMatchesKit: Same<Contract.Tone, Tone> = true
export const chipThemeMatchesKit: Same<Contract.ChipTheme, ThemeChoice> = true
