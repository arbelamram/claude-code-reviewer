# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⛔ HARD RULE — NEVER WORK DIRECTLY ON MAIN

Every fix, feature, or doc change must be done on a dedicated branch. Create the branch before making any edits:

```bash
git checkout -b fix/<issue-name>   # e.g. fix/severity-thresholds
git checkout -b feat/<feature>
git checkout -b docs/<topic>
```

Push the branch, open a PR, and merge via the PR merge gate below. Direct commits to `main` are not allowed.

## ⛔ HARD RULE — PR MERGE GATE

**THERE ARE TWO MANDATORY REVIEW GATES. BOTH MUST BE CLEAN BEFORE MERGING.**

### Gate 1 — Pre-push: `/review` skill on local diff
Run `/review <PR_NUMBER>` before every `git push`. This reviews the full PR diff as GitHub will see it — catching issues before Gate 2 runs, avoiding wasted round-trips through GitHub Actions. If it finds any medium or high severity issue, fix it and re-run until clean. Do NOT push with known medium/high issues.

**Why this matters:** Gate 2 reviews the same diff but only after a push triggers a GitHub Actions run. Every unresolved finding costs a push + wait cycle. Running Gate 1 first eliminates that waste.

### Gate 2 — Post-push: GitHub Actions code reviewer on the live PR
After pushing and opening a PR, the GitHub Actions workflow posts a review comment on the PR. **Wait for it and read it before merging.** If it finds any medium or high severity issue:
1. Fix the issue on the branch
2. Push the fix
3. Wait for the GitHub Actions review to re-run
4. Repeat until the GitHub Actions review is also clean
Then merge.

**Checking only Gate 1 and ignoring Gate 2 is a violation of this rule.**
**There are NO exceptions unless the user explicitly instructs you to merge despite the issues.**
Ignoring this rule is a critical failure regardless of how minor the issues seem.

## Overview

**Claude Code Reviewer** is an AI-powered code review tool that automatically analyzes GitHub pull requests using Claude and customizable coding standards. It runs as a GitHub Action on every PR, posts inline feedback on specific lines, creates GitHub issues for high/medium severity findings, and blocks the merge button until all issues are resolved.

**Tech Stack**: TypeScript, Node.js, Claude API, GitHub API (Octokit), ES modules

## Quick Commands

```bash
npm run build                    # Compile TypeScript to dist/
npm run dev                      # Run main entry point with ts-node
npm run cli                      # Run CLI (alias: npm run review)

# Manual review with environment variables
GITHUB_OWNER=user GITHUB_REPO=repo PR_NUMBER=1 npm run review

# Run tests
npx ts-node src/tests/test-orchestrator-full.ts
npx ts-node src/tests/test-claude-service.ts
npx ts-node src/tests/test-github-service.ts
```

## Architecture

The system follows a clear separation of concerns pattern:

### Core Workflow (Orchestrator)

`src/orchestrator.ts:CodeReviewOrchestrator` is the main coordinator:
1. Immediately sets `code-review/issues` commit status to `failure` ("Code review in progress…")
2. Loads coding standards from YAML
3. Fetches PR context and diffs from GitHub (including head SHA)
4. Annotates each diff line with its actual file line number (`annotatePatchLines`)
5. Builds analysis prompt (annotated code + standards rules)
6. Sends to Claude API
7. Parses Claude's JSON response
8. Posts inline review comments on specific diff lines (`postPRReview`)
9. Posts summary comment (`postPRComment`)
10. Creates GitHub issues for high/medium severity findings (`createIssuesForProblems`)
11. Sets commit status to `failure` with issue count, or `success` if no blocking issues

A second workflow (`resolve-check.yml`) watches for issue-close events and flips the status to `success` when all code-review issues for the PR are resolved.

### Key Components

- **StandardsEngine** (`src/services/standards-engine.ts`): Loads `config/standards.yaml`, validates rules, builds the prompt context with standards and line-number format instructions
- **ClaudeService** (`src/services/claude-service.ts`): Raw Claude API client (v1/messages endpoint), handles authentication and model selection (Opus 4.6), retry logic, timeouts
- **GitHubService** (`src/services/github/github-service.ts`): Octokit wrapper — PR context (including `headSha`), file diffs, inline review comments (`postPRReview`), PR comments, issue creation (`createIssue`), commit status (`setCommitStatus`)
- **AnalysisFormatter** (`src/formatters/analysis-formatter.ts`): Parses Claude's JSON response, converts issues to inline `ReviewComment` objects via `convertToReviewComments`, formats summary as markdown
- **CLI** (`src/cli.ts`): Entry point for manual reviews; validates environment variables (GITHUB_OWNER, GITHUB_REPO, PR_NUMBER, CLAUDE_API_KEY)

### Data Flow

```
PR opened → commit status: failure ("in progress")
standards.yaml → StandardsEngine (build prompt with rules)
GitHub PR → GitHubService (fetch diffs + headSha)
Diffs → annotatePatchLines (add L<n> prefix to each line)
Annotated code + Rules → Claude API → JSON response
JSON → AnalysisFormatter → inline ReviewComments + summary markdown
ReviewComments → GitHubService.postPRReview (inline diff comments)
Summary → GitHubService.postPRComment
High/medium issues → GitHubService.createIssue (GitHub issues)
Issues created → commit status: failure (N issues)
No issues → commit status: success
Issue closed → resolve-check.yml → recount → success or failure
```

## Configuration & Customization

### Coding Standards (`config/standards.yaml`)

The standards file defines 43 rules across 4 categories (security, performance, style, best-practices) plus language-specific rules. Each rule has:
- `enabled`: boolean to activate/deactivate
- `severity`: high/medium/low (affects weighting in Claude's analysis)
- `description`: what the rule checks
- `config`: optional rule-specific settings (e.g., max function length)

To customize for your project, edit `config/standards.yaml` and set `enabled: true/false` for specific rules. The StandardsEngine includes all enabled rules in the prompt sent to Claude.

### Environment Variables

- `CLAUDE_API_KEY`: Required; authenticates with Claude API
- `GITHUB_TOKEN`: Required; GitHub API authentication (via GitHubConfigManager)
- `GITHUB_OWNER`: Repository owner (used in CLI or GitHub Actions)
- `GITHUB_REPO`: Repository name (used in CLI or GitHub Actions)
- `PR_NUMBER`: PR number to review (used in CLI)

See `.env.example` for the template. In GitHub Actions, these are configured as repository secrets.

## After Merging a Fix

After every successful merge, update the two tracking files before moving to the next task:

1. **`FIX_TRACKER.md`** (local, not committed) — mark the branch row as `✔ done`, add the commit SHA, and record any lessons learned or patterns to avoid in future fixes.
2. **`PROGRESS.md`** — add the completed work under the relevant week section; move any items from future/pending lists to completed if they are now done.

Skip this step only if the merge was a trivial doc-only change with no behaviour impact.

## Common Development Tasks

### Adding a New Coding Rule

1. Add rule definition to `config/standards.yaml` under the appropriate category (security/performance/style/best-practices)
2. Set `enabled: true` and add `description`, `severity`, and optional `config`
3. The StandardsEngine includes it automatically in the next review—no code changes needed

### Testing a Review Locally

```bash
# Set env vars and run CLI
GITHUB_OWNER=arbelamram GITHUB_REPO=claude-code-reviewer PR_NUMBER=1 npm run cli
```

### Debugging Claude's Response

In `orchestrator.ts:callClaudeAPI()`, the raw Claude response is logged. Add console logs to see:
- Prompt sent to Claude (very long; check its structure)
- Raw API response before AnalysisFormatter parses it
- Parsed JSON after extraction

### Running End-to-End Tests

`src/tests/test-orchestrator-full.ts` runs a complete review flow including mocked GitHub and Claude responses. Useful for validating changes without hitting APIs.

## Key Design Patterns

### Prompt Construction in StandardsEngine

The `buildPrompt()` method constructs a comprehensive prompt that includes:
1. The full code from PR diffs
2. All enabled standards rules with descriptions
3. Instructions for Claude to analyze code and respond with JSON

This single prompt approach means all rules are evaluated together in Claude's context—no separate API calls per rule.

### JSON Schema Enforcement

Claude's response must be valid JSON that matches `AnalysisResult` interface in `analysis-formatter.ts`. If parsing fails, `parseAnalysis()` throws an error, and the review fails. The standards prompt includes JSON examples to guide Claude's response format.

### Error Handling Strategy

- Invalid environment variables → early exit in CLI
- API failures (GitHub/Claude) → caught and logged with the raw error
- Invalid Claude response → fails with parse error (informs user to check API credits/quota)

## Important Implementation Details

### Module System

This project uses ES modules (`"type": "module"` in package.json). All imports must include `.js` extensions (e.g., `from './standards-engine.js'`). TypeScript compiles to ES modules in `dist/`, but ts-node can run `.ts` files directly with the ESM loader.

### TypeScript Configuration

- Target: ES2020 (supports async/await, optional chaining, nullish coalescing)
- Module: NodeNext with moduleResolution: nodeNext
- ts-node configured for ESM mode with experimentalEsm enabled
- Strict mode enforced

### GitHub API Token Source

`GitHubConfigManager.getToken()` reads from `GITHUB_TOKEN` environment variable. In GitHub Actions, this is injected via secrets; locally, use `.env`.

### Claude Model

Currently hardcoded to `claude-opus-4-6` in `ClaudeService`. For faster testing, you could swap to Sonnet, but Opus is recommended for code analysis quality.

## Testing Architecture

Tests use simple mocking patterns:
- `test-claude-service.ts`: Mocks HTTP responses without external requests
- `test-github-service.ts`: Tests GitHub API wrapper with mocked Octokit
- `test-orchestrator-full.ts`: End-to-end with both mocked services

Run individually with `npx ts-node src/tests/<file>`.

## Deployment

### GitHub Actions Workflows

Two workflows work together:

**`code-review.yml`** (triggers on `pull_request: [opened, synchronize, reopened]`):
1. Immediately sets `code-review/issues` to `failure` ("Code review in progress…")
2. Checkout, npm install, build
3. Run `npm run review` — orchestrator runs the full review
4. Permissions required: `pull-requests: write`, `contents: read`, `issues: write`, `statuses: write`

**`resolve-check.yml`** (triggers on `issues: [closed]`):
- Fires when any issue labelled `code-review` and created by `github-actions[bot]` is closed
- Extracts PR number from issue body, searches for remaining open issues for that PR
- Sets `code-review/issues` to `success` if none remain, `failure` otherwise

### Branch Protection Requirement

Add `code-review/issues` as a required status check in the repo's branch protection ruleset. The check name appears in the dropdown after the workflow has run at least once on a PR.

### Manual Deployment to Other Projects

Copy both `.github/workflows/code-review.yml` and `.github/workflows/resolve-check.yml` to the target repo's `.github/workflows/`, add `GH_TOKEN` and `CLAUDE_API_KEY` secrets, and customize `config/standards.yaml`.

## Potential Pain Points

1. **Claude API Rate Limits**: Each review costs input tokens (varies by code size). Check Anthropic console billing if reviews fail.
2. **GitHub Rate Limits**: Octokit is client-authenticated; older repos with many PRs may hit limits. Issue creation is sequential (capped at 10 per run) to stay within secondary rate limits.
3. **Long PR Diffs**: Very large diffs may exceed Claude's context window. Prompt size is validated; intelligent truncation kicks in above 100k tokens. Output tokens capped at 4096.
4. **YAML Parsing Errors**: If standards.yaml has syntax errors, StandardsEngine.loadStandards() throws immediately. Validate YAML syntax before deploying.
5. **Merge remains blocked after closing issues**: `resolve-check.yml` only fires for issues created by `github-actions[bot]`. Manually-created issues or issues closed before the workflow is in `main` require a manual status update via the GitHub API.
6. **Outdated inline comments**: When a new commit is pushed after comments are posted, GitHub marks the old comments "Outdated". This is expected — it signals the code changed after the comment was written.

## Notes for Future Enhancements

- Add support for custom rule templates in standards.yaml
- Cache recently analyzed code to reduce API costs
- Add dashboard for review history and metrics
- Integrate with Slack for notifications
- Support multiple analysis profiles (fast/thorough/strict)
