## Summary

<!-- One or two sentences: what does this PR do and why? -->

## Type of change

- [ ] Bug fix
- [ ] New feature / use-case
- [ ] Refactor (no behaviour change)
- [ ] Documentation
- [ ] Chore / dependency update

## Changes

<!-- Bullet list of the concrete things changed. Be specific about files/layers touched. -->

-
-
-

## Related issues

<!-- Link issues this closes. Use "Closes #123" to auto-close. -->

Closes #

## Checklist

- [ ] Follows the three-export handler pattern (`create*Handler`, `*Command`/`*Query`, `register*`) if a handler was added
- [ ] Repository contracts use `@ruxt/core`; deployment implementations belong in the relevant `infra/deploy/` adapter
- [ ] New deploy strategies are registered in `infra/deploy/index.ts`
- [ ] New API routes use the correct Nitro filename convention (`<name>.<method>.ts`)
- [ ] `infra/registry.ts` updated if new handlers were added
- [ ] No `@infra` or `@core` imports introduced in the wrong direction (core must not import infra)
- [ ] Types are explicit — no `any` left in production code paths
- [ ] Tested locally (`pnpm dev`)

## Screenshots / logs

<!-- If this touches UI or server output, paste a screenshot or relevant log lines. Delete if not applicable. -->