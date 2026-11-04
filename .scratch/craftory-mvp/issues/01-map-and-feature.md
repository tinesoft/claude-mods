# Map as an optional parent of a Feature

Type: grilling
Status: resolved

## Question

Is a wayfinder map its own top-level object in the mod, or an optional parent of a Feature?

## Answer

An optional parent of a Feature. It sits before the Spec (DESIGN.md: Spec is `/to-spec` or `/wayfinder` for large work), shows as a parent rail above the seven phases, and its child Specs appear as normal Features grouped under it. The map is derived from the tracker; the only stored fact is an optional `map: <ref>` on a Feature's JSON.
