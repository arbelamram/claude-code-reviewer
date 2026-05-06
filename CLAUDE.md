# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Claude Code Reviewer** is an AI-powered code review tool that automatically analyzes GitHub pull requests using Claude and customizable coding standards. It runs as a GitHub Action on every PR and posts formatted feedback as comments.

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
1. Loads coding standards from YAML
2. Fetches PR context and diffs from GitHub
3. Combines code changes into a single prompt
4. Sends combined code + standards to Claude API
5. Parses Claude's JSON response
6. Formats output as a GitHub PR comment
7. Posts comment back to the PR

### Key Components

- **StandardsEngine** (`src/standards-engine.ts`): Loads `config/standards.yaml`, validates rules, builds the prompt context with standards
- **ClaudeService** (`src/claude-service.ts`): Raw Claude API client (v1/messages endpoint), handles authentication and model selection (Opus 4.6)
- **GitHubService** (`src/github/github-service.ts`): Octokit wrapper for GitHub API calls (PR context, file diffs, comments)
- **AnalysisFormatter** (`src/analysis-formatter.ts`): Parses Claude's JSON response and converts to GitHub-compatible markdown comment
- **CLI** (`src/cli.ts`): Entry point for manual reviews; validates environment variables (GITHUB_OWNER, GITHUB_REPO, PR_NUMBER, CLAUDE_API_KEY)

### Data Flow

```
standards.yaml → StandardsEngine (build prompt with rules)
GitHub PR → GitHubService (fetch diffs)
Code + Rules → Claude API → JSON response
JSON → AnalysisFormatter → GitHub comment markdown
```

## Configuration & Customization

### Coding Standards (`config/standards.yaml`)

The standards file defines 21 rules across 4 categories (security, performance, style, best-practices) plus language-specific rules. Each rule has:
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

### GitHub Actions Workflow

Deployed via `.github/workflows/code-review.yml` (auto-triggered on PR creation):
1. Checkout code
2. Install dependencies
3. Set environment from secrets (GITHUB_TOKEN, CLAUDE_API_KEY)
4. Run `npm run review` with PR context injected by GitHub Actions

### Manual Deployment to Other Projects

Copy `.github/workflows/code-review.yml` to a new repo's `.github/workflows/`, add secrets, and customize `config/standards.yaml` for that team's needs.

## Potential Pain Points

1. **Claude API Rate Limits**: Each review costs input tokens (varies by code size). Check Anthropic console billing if reviews fail.
2. **GitHub Rate Limits**: Octokit is client-authenticated, not app-authenticated; older repos with many PRs may hit limits. Consider upgrading to app-based auth if needed.
3. **Long PR Diffs**: Very large diffs may exceed Claude's context window. Current limit is 2048 output tokens; adjust in `ClaudeService.analyzeCode()` if needed.
4. **YAML Parsing Errors**: If standards.yaml has syntax errors, StandardsEngine.loadStandards() throws immediately. Validate YAML syntax before deploying.

## Notes for Future Enhancements

- Add support for custom rule templates in standards.yaml
- Cache recently analyzed code to reduce API costs
- Add dashboard for review history and metrics
- Integrate with Slack for notifications
- Support multiple analysis profiles (fast/thorough/strict)
