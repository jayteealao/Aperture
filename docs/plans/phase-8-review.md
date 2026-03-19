# Phase 8 Review Findings

Date: 2026-03-19

Scope reviewed: shadcn consolidation plan Phase 8 button migration, using `docs/plans/shadcn-consolidation.md` as the source of truth.

## Findings

1. Medium: The core migration is not complete.
   The plan requires deleting `web/src/components/ui/Button.tsx`, adding `web/src/components/ui/button.tsx`, and updating consumers from `@/components/ui/Button` to `@/components/ui/button` (`docs/plans/shadcn-consolidation.md`, Phase 8). In the current implementation there is still no lowercase `button.tsx`, `web/src/components/ui/index.ts` still re-exports `./Button`, and consumers still import the uppercase path in files including `web/src/components/layout/Sidebar.tsx`, `web/src/pages/Sessions.tsx`, and `web/src/components/ui/input-group.tsx`.

2. Low: The compatibility aliases specified by the phase plan were removed instead of preserved.
   The plan explicitly says to keep `primary` and `danger` variant aliases and an `md` size alias during the migration. The current `web/src/components/ui/Button.tsx` only exposes the canonical shadcn variants and sizes through `buttonVariants`, and `ButtonProps` now derives directly from those CVA keys. That makes the change a breaking API cleanup rather than the compatibility-preserving migration described in the phase.

3. Low: There is no button-specific regression coverage for the highest-risk phase.
   Phase 8 is identified as the highest-consumer, very-high-risk migration in `docs/plans/shadcn-consolidation.md`, but there is no `button.test.tsx` in `web/src/components/ui`. Current added coverage is limited to input accessibility in `web/src/components/ui/input.test.tsx`, leaving `Button` behaviors like `loading`, `leftIcon`, `rightIcon`, and `asChild` without direct regression protection.

## Verification

The implementation passes local validation:

- `pnpm --filter aperture-web type-check`
- `pnpm --filter aperture-web test`
- `pnpm --filter aperture-web lint`

Observed test status during review: 13 test files passed, 161 tests passed.
