# ROADMAP

For the shared branch and workspace map, start at [CONTROL_DEL_PROYECTO](docs/CONTROL_DEL_PROYECTO.md).

Updated: 28/09/2026. Detailed scope, evidence limits, task template and merge rules: [Plan maestro](docs/PLAN_MAESTRO_PRODUCTO_Y_ENTREGA.md). Technical history: [estado de integración](docs/estado-integracion.md). Publication controls: [ANTES_DE_PUBLICAR](docs/ANTES_DE_PUBLICAR.md).

**Working baseline:** `develop`, created from `emdash/integracion-programa` at `7e6357e` on 28/09/2026. `main` was at `4845640`, 47 commits behind. PRs #1 and #2 target `develop`; [draft PR #3](https://github.com/danielruizpadel-ux/trainer-booking-platform/pull/3) connects it to `main` without merging. Recheck refs before any new branch or merge. These are repository observations, not proof of the state of local worktrees or Supabase today.

## Now

1. Inventory local worktrees, untracked assets, remote backup branches and migration state. Preserve work before cleanup.
2. Settle the open product decisions in the master plan; define the trainer / academy ownership and permission boundary.
3. Review `backup/clientes-wip` and integrate a minimal Clients view safely into the current working baseline.
4. Specify and then implement the Mauri pilot: account-required private lessons, confirmation after court check, cash ledger, configurable cancellation rule and discreet debt notice.

## Next

5. Player purchase and self-booking of 5/10-session packages, partial scheduling, credit accounting, expiry and corrections.
6. Real notifications, English copy, mobile QA, current pricing and no dead UI actions.
7. Define multi-trainer academy operation from actual cases and integrate only the needed role and shared client rules.
8. Review integration into `main` and publication checklist; test the deployed pilot with Mauri.

## Later

- Trainer onboarding and commercial SaaS model, after the Mauri pilot demonstrates reliable operations.
- Online payments with configurable methods and settlement destination. The academy expects one Malaysian receiving account; trainer-specific recipients require separate provider/legal design.
- The Player Development Plan and `/programa` remain separate from the Mauri package launch.

## Completion rule

Each task records its base SHA, owner, scope, dependencies, tests and integration PR. A feature is complete only after review and merge into its declared base; a branch, a worktree or an AI conversation alone is not completion. Update this roadmap as decisions or dependencies change.
