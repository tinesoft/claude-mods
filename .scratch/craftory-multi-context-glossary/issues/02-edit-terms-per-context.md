# 02: Edit terms per context

**What to build:** In Settings › Glossary, list, add, edit and delete work in each context's file with the same byte-for-byte round-trip as 1.0. **Add term** asks which context; the default is the context whose folder the active Feature's diff touches most, or the first in the map when there is no diff or on a tie. **Add term** on a context with no glossary file yet creates the file in Matt's format (title, one-line description from the map, `## Language`). A file that exists but does not parse is never written.

**Blocked by:** 01

**Status:** done

- [x] Add, edit and delete write only the chosen context's file; every other file and the rest of that file are byte for byte unchanged
- [x] **Add term** defaults to the context the Feature's diff touches most; ties and no diff give the first context in the map
- [x] **Add term** on a missing glossary creates the file in Matt's format, then adds the term
- [x] A glossary file that does not parse is reported and never written
- [x] Existing single-context editing tests pass unchanged
