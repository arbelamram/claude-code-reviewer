// STATUS_CONTEXT is the commit status check name that GitHub branch protection
// rules must match. It is referenced by github-service.ts and hardcoded in
// .github/workflows/code-review.yml and resolve-check.yml — all four must stay
// in sync. Change this value here and update the two YAML files manually.
export const STATUS_CONTEXT = 'code-review/issues' as const;
