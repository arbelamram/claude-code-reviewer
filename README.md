# Claude Code Reviewer

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-brightgreen.svg)
![Claude API](https://img.shields.io/badge/Claude-Opus%204.6-blueviolet.svg)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-Workflow-black.svg)
![License](https://img.shields.io/badge/license-Source%20Available-red.svg)

An AI-powered code review tool that runs as a GitHub Action. On every pull request, it analyzes the diff against configurable coding standards, posts inline comments on the exact offending lines, creates tracked GitHub issues for each finding, and blocks the merge button until every issue is resolved.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
   - [Project Structure](#project-structure)
2. [How It Works](#how-it-works)
3. [Design Decisions](#design-decisions)
4. [Features](#features)
5. [What It Reviews](#what-it-reviews)
6. [Getting Started](#getting-started)
   - [Prerequisites](#prerequisites)
   - [Installation](#installation)
   - [Configuration](#configuration)
7. [Usage](#usage)
8. [Known Limitations & Future Improvements](#known-limitations--future-improvements)
9. [Contact](#contact)
10. [License](#license)

---

## Architecture Overview

The system is split into two coordinated workflows and five focused components:

### Review Workflow (`code-review.yml`)
- Triggers on every pull request (opened, synchronized, reopened) or manually via `workflow_dispatch`
- Immediately sets the commit status to `pending` — blocking the merge button before analysis begins
- Fetches the PR diff, annotates each line with its actual file line number, and sends the annotated code to Claude
- Posts inline review comments, a severity-grouped summary, and GitHub issues for each blocking finding
- Sets the final commit status (`success` or `failure`) based on findings

### Resolve Workflow (`resolve-check.yml`)
- Triggers when any GitHub issue is closed
- Uses a triple gate (label + bot identity + body marker) to filter only skill-created issues
- Re-counts open findings for the associated PR and flips the commit status to `success` when all are resolved

### High-Level Flow

```
Pull Request
     │
     ▼
code-review.yml
     │
     ├── Standards YAML → StandardsEngine → Prompt
     │
     ├── GitHub Diff → annotatePatchLines → Annotated Code
     │
     └── Prompt + Code → Claude API → JSON Response
                                            │
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                       Inline Comments  PR Summary   GitHub Issues
                              │             │             │
                              └─────────────┴─────────────┘
                                            │
                                    Commit Status
                                  (failure / success)

Issue Closed by Developer
     │
     ▼
resolve-check.yml → Re-count open issues → Update Commit Status
```

---

### Project Structure

```
.github/
  workflows/
    code-review.yml       # Main review workflow
    resolve-check.yml     # Auto-unblock on issue close
config/
  standards.yaml          # 53 configurable coding standards
src/
  orchestrator.ts         # Main workflow coordinator
  cli.ts                  # CLI entry point for local runs
  formatters/
    analysis-formatter.ts # Parses Claude response → GitHub comments
  services/
    claude-service.ts     # Claude API client with retry logic
    standards-engine.ts   # Loads standards.yaml, builds prompts
    logger.ts             # Structured logger with log-level control
    github/
      github-service.ts   # Octokit wrapper (diffs, comments, issues, statuses)
      github-config.ts    # Token and config loader
```

---

## How It Works

```
PR opened / new commit pushed
  └─ code-review.yml triggers
       │
       ├─ 1. Set code-review/issues → PENDING
       │      "Code review in progress..."  ← merge button disabled
       │
       ├─ 2. Fetch PR context and diffs from GitHub
       │
       ├─ 3. Annotate each diff line with its actual file line number
       │      so Claude reports the exact offending statement
       │
       ├─ 4. Build analysis prompt (annotated code + 53 standards rules)
       │
       ├─ 5. Send to Claude Opus 4.6
       │
       ├─ 6. Post inline review comments on specific lines
       │
       ├─ 7. Post severity-grouped summary comment on the PR
       │
       └─ 8. For each high/medium severity issue:
              ├─ Create a GitHub issue (labelled code-review + priority)
              ├─ Set status → FAILURE  "N issue(s) to resolve"
              └─ If zero issues → set status → SUCCESS  ← merge enabled

Issue closed by developer
  └─ resolve-check.yml triggers
       ├─ Verify issue was created by github-actions[bot] + has body marker
       ├─ Re-count remaining open code-review issues for this PR
       ├─ If > 0 → keep FAILURE
       └─ If = 0 → set SUCCESS  ← merge button re-enabled
```

---

## Design Decisions

### Line-accurate inline comments
GitHub's diff API returns patch hunks with diff-relative offsets, not actual file line numbers. The orchestrator pre-processes each patch and annotates every line with a synthetic `L<n>` prefix before sending to Claude. This ensures the model's `location` field (e.g. `src/auth.ts:42`) maps directly to the correct file line and can be resolved to a valid inline comment position in the PR diff.

### Two-layer false-positive suppression
When Claude has nothing to flag for a piece of code, it sometimes fills the issues array with a positive observation instead of leaving it empty. Two layers guard against this: the prompt explicitly instructs Claude not to include no-op entries, and `AnalysisFormatter` post-filters any issue whose `suggestion` matches a no-op pattern (`/no change needed/i`, etc.) before rendering. Either layer alone is insufficient; together they handle prompt non-compliance and edge-case phrasings.

### Context window management
Large PRs can exceed Claude's context limit. The orchestrator estimates token count using a 4 chars/token heuristic, targets 100k tokens, and when approaching the limit truncates diffs file-by-file until the prompt fits within 150k. The largest individual file is always retained. Truncation is logged so developers can see which files were excluded.

### Race-condition-safe merge unblocking
Rather than polling after the review completes, a separate workflow watches for issue-close events. It re-counts open issues at close time and only flips the status when the count reaches zero. A triple gate (label + `github-actions[bot]` identity + body marker) prevents spurious triggers from unrelated issue closures.

### No long-lived credentials
The skill uses GitHub's built-in `github.token` (scoped to each run, auto-expires). Issues are created as `github-actions[bot]`. Only `CLAUDE_API_KEY` needs to be stored as a repository secret.

### Sanitized error messages
All errors shown to users pass through `safeErrorMessage()`, which maps specific HTTP codes to generic messages, strips non-printable characters, and caps output at 80 characters. API keys, internal paths, and raw API responses never appear in logs or annotations.

---

## Features

### Core Review
- Automatic PR analysis triggered on open, sync, or reopen
- Inline comments posted directly on the offending diff line
- Severity-grouped summary comment on the PR
- Manual trigger via `workflow_dispatch` with custom PR number

### Issue Tracking & Merge Control
- One GitHub issue created per high/medium severity finding, labelled by priority
- Merge button disabled from the moment the PR opens
- Auto-unblock when all findings are resolved — no manual intervention required

### Reliability
- Exponential backoff with up to 3 retries for transient API failures
- `Retry-After` header respected for GitHub rate limit responses
- 30-second per-request timeout on Claude API calls
- Intelligent prompt truncation for PRs exceeding 100k tokens
- JSON schema validation on Claude's response before any processing
- `::error::` annotation emitted if a commit status update fails silently

---

## What It Reviews

### Security (14 rules)
SQL injection, hardcoded secrets, unsafe deserialization, authentication gaps, XSS, input validation, resource leaks, weak cryptography, race conditions, template injection, default credentials, weak randomness, unvalidated redirects, path traversal

### Performance (8 rules)
N+1 queries, O(n²) algorithms, missing caching, memory leaks, unnecessary operations, query optimisation, API rate limiting, batch processing

### Style (9 rules)
Naming conventions, function length (max 80 lines), error handling, code duplication, documentation, deep nesting (max 3 levels), magic numbers, consistent spacing, dead code

### Best Practices (12 rules)
Modern idioms, design patterns, testability, console logs in production, error messages, logging levels, data exposure, dependency updates, backwards compatibility, concurrency safety, immutability, functional style

---

## Getting Started

### Prerequisites

- Node.js **22+**
- GitHub repository
- Claude API key ([Anthropic console](https://console.anthropic.com))

---

### Installation

Copy both workflow files into the target repository:

```
.github/workflows/code-review.yml
.github/workflows/resolve-check.yml
```

For local CLI use, clone and install:

```bash
git clone https://github.com/arbelamram/claude-code-reviewer.git
cd claude-code-reviewer
npm install
npm run build
```

---

### Configuration

#### GitHub Secret & Variable

Go to **Settings → Secrets and variables → Actions** and add:

**Secret:**

| Name | Value |
|------|-------|
| `CLAUDE_API_KEY` | Anthropic API key (`sk-ant-...`) |

**Repository variable:**

| Name | Value | Description |
|------|-------|-------------|
| `ALLOWED_REVIEWERS` | `["your-github-username"]` | JSON array of GitHub usernames whose PRs trigger the review. Example: `["alice"]` or `["alice","bob"]` |

> GitHub API access uses the built-in `github.token` — no personal access token required.
> If `ALLOWED_REVIEWERS` is unset or empty the workflow skips silently — set it before opening your first PR.

#### Branch Protection

For merge blocking to work, add `code-review/issues` as a required status check:

1. Go to **Settings → Rules → Add branch ruleset**
2. Target branch: `main`
3. Enable **Require status checks to pass** → search for `code-review/issues`
4. Save

> The check name appears in the search dropdown after the workflow has run at least once on a PR.

#### Local Environment Variables

```bash
cp .env.example .env
# Fill in: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, CLAUDE_API_KEY
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `CLAUDE_API_KEY` | Yes | — | Anthropic API key |
| `GITHUB_TOKEN` | CLI only | — | GitHub personal access token — not needed in GitHub Actions (uses built-in `github.token`); required for local CLI runs only |
| `GITHUB_OWNER` | Yes | — | Repository owner |
| `GITHUB_REPO` | Yes | — | Repository name |
| `PR_NUMBER` | Yes | — | PR number to review |
| `ENABLE_ISSUE_CREATION` | No | `false` | Set `true` to create GitHub issues for findings |
| `LOG_LEVEL` | No | `INFO` | Verbosity: `DEBUG`, `INFO`, `WARN`, `ERROR` |

⚠️ Do not commit `.env` files — they are excluded via `.gitignore`.

#### Coding Standards

Enable, disable, or adjust the severity of individual rules in `config/standards.yaml`:

```yaml
security:
  enabled: true
  rules:
    check_sql_injection:
      enabled: true
      severity: high
    check_hardcoded_secrets:
      enabled: true
      severity: high
```

---

## Usage

### Automatic
Open a pull request — the review runs automatically.

### Manual Workflow Trigger
Actions → **Claude Code Review** → **Run workflow** → enter PR number.

### Local CLI
```bash
GITHUB_OWNER=your_user GITHUB_REPO=your_repo PR_NUMBER=1 npm run review
```

### Custom Standards
Edit `config/standards.yaml` to adjust which rules are active and at what severity. No code changes required — the StandardsEngine reads the file at runtime.

---

## Troubleshooting

**Merge button stays blocked after closing all issues** — `resolve-check.yml` only fires for issues created by `github-actions[bot]`. Manually created issues with the `code-review` label won't trigger it.

**"Claude API error: 401 Unauthorized"** — Check that `CLAUDE_API_KEY` is set correctly in repo secrets and has not expired.

**"Claude API error: credit balance too low"** — Add credits at [console.anthropic.com](https://console.anthropic.com).

**No inline comments, only a summary** — The `location` field wasn't parseable for those findings. Claude is instructed to always populate it but may occasionally omit it. All findings still appear in the summary comment.

**Inline comments marked "Outdated"** — Expected. GitHub marks comments outdated when a new commit is pushed after they were posted, signalling the underlying code may have changed.

**Review never triggers** — Confirm `code-review.yml` is on the default branch (`main`). GitHub Actions only reads workflow files from the default branch.

---

## Known Limitations & Future Improvements

- Token estimation uses a 4 chars/token heuristic — actual counts vary by content
- No native test command (`npm test`) — test files exist but are not wired to a test runner
- `severity_thresholds` config in `standards.yaml` is defined but not yet read by the orchestrator — any single medium/high finding blocks the PR regardless of the configured threshold

Planned enhancements:

- Implement `severity_thresholds` so the block threshold is configurable per severity
- Add Jest/Vitest unit tests and a `npm test` script
- Dashboard for review history and metrics
- Slack/email notifications on review completion

---

## Contact

For questions or feedback, open a [GitHub issue](https://github.com/arbelamram/claude-code-reviewer/issues) or reach out via [GitHub](https://github.com/arbelamram).

---

## License

This project is source-available for viewing and educational purposes.  
Copying, redistribution, or use in any project is prohibited without explicit written permission.  
See [LICENSE](./LICENSE) for full terms.

© 2026 Arbel Amram
