# Agent Guide — Walkinal Repo

This file applies to the entire repository unless a deeper `AGENTS.md` overrides part of it.

## Stability First

Walkinal is a local desktop tool with a fragile integration surface:

- renderer
- preload IPC
- main process
- AppleScript automation
- Warp terminal behavior
- macOS input methods / focus state

Because of this, **protecting the working main path is more important than landing ambitious refactors quickly**.

## Main Path Definition

The main path includes any code that directly affects:

- queue send / send-and-run
- Warp bridge behavior
- queue item formatting or send ordering
- IPC used by sending
- input-to-send transitions
- draft persistence and restore

Files that should be treated as main-path-sensitive include, but are not limited to:

- `src/main/warp-bridge.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`
- `src/renderer/stores/sessionStore.ts`
- any module directly imported by the files above

## Hard Rules For Main-Path Changes

1. Do not replace or refactor a working main-path implementation unless the user explicitly asked for that refactor.
2. When exploring a risky change, prefer adding a parallel module, flag, or isolated experiment before touching the live path.
3. Do not connect experimental logic to the real send path until:
   - the behavior is clearly specified
   - the old path can be restored quickly
   - the change has been locally verified
4. If a risky change breaks the main path even once during validation, revert or disable it before doing anything else.
5. If a change is only partially validated, keep it out of the live path.

## Safe Delivery Pattern

For high-risk features, use this order:

1. Model the logic in a pure module.
2. Add tests around that pure module.
3. Add script/action generation tests if relevant.
4. Keep the existing live path unchanged.
5. Only after the above passes, connect the new logic behind the real path.
6. Re-verify the real path immediately.

## Validation Requirements

For any main-path code change:

- `npm run build` must pass.
- If relevant tests exist, `npm test` must pass.
- The final response must clearly say whether the live path was changed.
- The final response must clearly say what was or was not manually verified.

For any change affecting Warp sending:

- treat AppleScript generation and AppleScript execution as separate concerns
- do not assume a passing unit test proves real Warp behavior
- call out any remaining need for manual validation

## Change Control

If the user asks for investigation, design, or planning only:

- do not hook unfinished logic into the live path
- keep experiments isolated

If the user asks for a fix on a fragile path:

- prefer the smallest viable fix
- avoid opportunistic refactors
- avoid bundling unrelated cleanup into the same change

## Rollback Bias

If there is doubt between:

- keeping a new but uncertain implementation in the live path
- reverting to a previously working implementation

choose the previously working implementation.
