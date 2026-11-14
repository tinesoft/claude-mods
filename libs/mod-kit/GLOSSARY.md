# Mod kit

The code that more than one mod needs, kept in one place and copied into each mod that uses it.

## Language

**Kit**:
The shared source in `libs/mod-kit`. Never imported by a mod at runtime.
_Avoid_: Shared lib, common, core

**Vendored copy**:
A mod's generated copy of the kit files it lists, committed under its `src/_kit/`. Edited only by changing the kit.
_Avoid_: Symlink, fork

**Kit list**:
The kit modules a mod declares it uses, in its `package.json`.
_Avoid_: Dependencies

**Sync**:
Regenerating every vendored copy from the kit; its check mode fails when a copy has drifted.
_Avoid_: Build, bundle
