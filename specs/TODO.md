# Verified refactor follow-ups

Last updated: feat/ruxt-core-split@4dd5c27 | 2026-10-22

## Scope

Deferred maintainability and validation work identified in the refactor audit. These are not new behavior requirements or claims of failing existing architecture lint. Active package export/split work is tracked by the manager outside subsystem specifications.

## Follow-ups

- [ ] Decide whether to retire the tracked, empty `core/domain/email/email-validator.ts`. The canonical Email already has `domain/email/index.ts`; there is no second IAM Email implementation. Do not invent a validator contract just to populate an empty file.
- [ ] Retire the dormant frontend `packages/editor` snapshot in a separately reviewed cleanup. It is excluded from the workspace and active Nuxt layer; actual component declarations resolve the installed packed editor. Its manifest is now private to prevent accidental publication, but no source deletion was performed.
- [ ] Consider further responsibility extraction from `app/layouts/editor.vue`, `app/pages/d/index.vue`, and `app/pages/profiles.vue` only with focused route, recovery, confirmation, focus and responsive characterization. Size alone is not a rule violation. The current bounded pass targets concrete duplicated money presentation and profile-result adaptation instead of a broad UI rewrite.
- [ ] Extend repeatable responsive/editor/export browser coverage. Hermetic Node suites and existing opt-in browser cases are not complete rendered UI coverage.
- [ ] Exercise real Clerk-authenticated controls in an explicitly configured non-production fixture. Four prior opt-in auth UI failures depended on auth being disabled locally; neither skipped tests nor mocked account data prove that rendered flow.
- [ ] Review generic value-object validation gaps (e.g. Duration accepting nonfinite values) as a separate intentional behavior change with specification and migration decisions, not a behavior-preserving refactor.

## Current Gaps

No maximum file-size rule exists. No general dead-code/cycle analysis has proven other alleged unused exports. These follow-ups must not be reported as fixed or as enforced lint failures without fresh evidence.
