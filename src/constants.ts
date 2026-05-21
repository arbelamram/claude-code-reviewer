// STATUS_CONTEXT is the commit status check name that GitHub branch protection
// rules must match. It is referenced by github-service.ts and hardcoded in
// .github/workflows/code-review.yml and resolve-check.yml — all four must stay
// in sync. Change this value here and update the two YAML files manually.
//
// CONSTRAINT: this must be a plain single-quoted string literal with no escape
// sequences and no template expressions. scripts/validate-status-context.mjs
// extracts the value with a simple regex and will fail to locate it otherwise.
export const STATUS_CONTEXT = 'code-review/issues' as const;
