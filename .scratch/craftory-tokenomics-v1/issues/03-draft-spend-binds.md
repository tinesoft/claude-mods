# 03: Draft spend binds to the spec

**What to build:** Spend charged to a draft feature (Align, and Spec before the spec binds) is kept in `$.store` under `spend:draft:<draftId>`. When `promote()` binds the spec, the draft's rollup moves into this session's file under the new slug and the store key is cleared. A discarded draft keeps its spend local. Outside-features spend is kept in `$.store` under `spend:outside` as a rolling 30-day rollup.

**Blocked by:** 02

**Status:** resolved

- [x] Draft rollup in the store, keyed by draft id
- [x] The rollup moves on bind; the totals after the bind include Align
- [x] A discarded draft is never committed
- [x] `spend:outside` with the 30-day roll-off
- [x] Fake-world test: grill, then `/to-spec`, then the spec binds, then the status line total includes the grill
