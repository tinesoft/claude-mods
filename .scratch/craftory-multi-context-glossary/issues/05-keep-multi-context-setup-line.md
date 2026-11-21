# 05: Keep the multi-context line in the setup block

**What to build:** Saving Settings › Docs keeps the multi-context line in the `## Agent skills` block when the repo has a glossary map, and never writes the single-context line over it. When Craftory writes the line itself, it uses the exact text Matt's setup skill writes (check against the vendored templates first).

**Blocked by:** 01

**Status:** done

- [x] A Settings save in a repo with a map keeps the existing multi-context line
- [x] A Settings save that writes the block fresh in a repo with a map writes the multi-context line, matching Matt's setup skill text
- [x] A single-context repo still gets the single-context line
