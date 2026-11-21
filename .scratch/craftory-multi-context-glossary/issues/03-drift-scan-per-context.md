# 03: Run the drift scan per context

**What to build:** The drift scan checks a changed file against the avoid-words of the context whose folder holds it, so one context's avoid-list does not flag another's correct usage. When contexts are nested, the deepest folder holding the file wins. A file outside every context's folder (root docs, tooling) is checked against every context's avoid-words.

**Blocked by:** 01

**Status:** done

- [x] A file under context A is flagged only for A's avoid-words
- [x] A root file is flagged for the avoid-words of both contexts
- [x] With nested context folders, the deepest one is used
- [x] Existing single-context drift tests pass unchanged
