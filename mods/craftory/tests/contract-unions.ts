// Compile-time guard: `types/index.d.ts` must be self-contained, so it spells its unions itself.
// Each one with a value set in `src/` must hold exactly that constant's values: this fails
// typecheck when a value is in the union but not the constant, or the other way round.
import type * as Contract from '../types'
import type { FORECAST_UNITS } from '../src/forecast'
import type { EFFORTS } from '../src/routing'

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

export const effortsMatchConstant: Same<Contract.PhaseEffort, (typeof EFFORTS)[number]> = true
export const forecastUnitsMatchConstant: Same<
  Contract.ForecastUnit,
  (typeof FORECAST_UNITS)[number]
> = true
