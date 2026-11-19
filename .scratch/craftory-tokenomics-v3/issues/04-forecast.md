# 04: Forecast what Build and each phase will cost

**What to build:** From this repo's finished Features (Ship done, or archived), Craftory takes one sample per Build ticket (its dollars) and one per phase per Feature. The Tickets card shows `Build ≈ $9 (p90 $14) for 5 tickets`: the per-ticket median and p90, times the tickets meant for an agent. With fewer than 2 finished Features it shows "No forecast yet: it needs 2 finished features". The Spend tab shows each phase's forecast beside its spend. When Build starts, the forecast is saved once on the Feature record (`forecast`). Without a cost ledger, everything is in fresh tokens.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Pure median/p90 and the forecast from samples; table tests (odd, even, one Feature, none)
- [x] Samples from finished Features' spend (every session's files); finished means Ship done or archived
- [x] Tickets card line, in dollars and in tokens; card tests with spend-file fixtures
- [x] Spend tab forecast beside each phase
- [x] `forecast` saved on the record when Build starts (typed, pressed or first spawn), never overwritten; features and fake-world tests
