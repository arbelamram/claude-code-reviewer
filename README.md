# Claude Code Reviewer

An AI-powered code review tool that automatically analyzes GitHub pull requests using Claude and configurable coding standards.

**Status:** Production-Ready  
**Version:** 1.2.0  
**License:** ISC

---

## Features

### Core Review
- **Automatic PR Reviews** — Triggered on every pull request or manually via `workflow_dispatch`
- **Configurable Standards** — Define your team's coding standards in YAML (21 built-in rules)
- **Intelligent Analysis** — Uses Claude Opus 4.6 to understand code intent, not just patterns
- **Inline Comments** — Posts feedback directly on the exact offending line in the diff
- **Summary Comment** — Full analysis overview posted as a PR comment

### Issue Tracking (v1.2.0)
- **GitHub Issue Creation** — Auto-creates a tracked GitHub issue for every high/medium severity finding, labelled by priority
- **Merge Blocking** — Merge button is disabled the moment a PR opens; enabled only after a clean review pass
- **Auto-Unblock** — `resolve-check.yml` watches for issue closures and re-enables merging once all problems are resolved

### Reliability (v1.1.0)
- **Automatic Retries** — Exponential backoff for transient API failures (3 attempts)
- **Pagination Support** — Analyzes PRs with unlimited file changes
- **Large PR Handling** — Intelligent truncation for PRs exceeding 100k tokens
- **Request Timeouts** — 30-second timeout prevents hanging requests
- **Response Validation** — Validates Claude's JSON against schema

---

## How It Works

```
PR opened / new commit pushed
  └─ code-review.yml triggers
       │
       ├─ 1. Immediately set code-review/issues → FAILURE
       │      "Code review in progress..."  ← merge button disabled
       │
       ├─ 2. Fetch PR context and diffs from GitHub
       │
       ├─ 3. Annotate each diff line with its actual file line number
       │      so Claude reports the exact offending statement
       │
       ├─ 4. Build analysis prompt (code + 21 standards rules)
       │
       ├─ 5. Send to Claude Opus 4.6
       │
       ├─ 6. Post inline review comments on specific lines
       │
       ├─ 7. Post summary comment (all issues grouped by severity)
       │
       └─ 8. For each high/medium severity issue:
              ├─ Create a GitHub issue (labelled code-review + priority)
              ├─ Keep status → FAILURE  "N issue(s) to resolve"
              └─ If zero issues → set status → SUCCESS  ← merge enabled

Issue closed by developer
  └─ resolve-check.yml triggers
       ├─ Count remaining open code-review issues for this PR
       ├─ If > 0 → keep FAILURE
       └─ If = 0 → set SUCCESS  ← merge button re-enabled
```

---

## Setup

### Prerequisites
- Node.js 18+
- GitHub repository
- Claude API key (Anthropic console)

### 1. Clone and install

```bash
git clone https://github.com/arbelamram/claude-code-reviewer.git
cd claude-code-reviewer
npm install
```

### 2. Add GitHub secrets

Go to your repo → **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `GH_TOKEN` | GitHub personal access token (scopes: `repo`, `read:user`) |
| `CLAUDE_API_KEY` | Anthropic API key (`sk-ant-...`) |

### 3. Configure branch protection

For merge blocking to work, add `code-review/issues` as a required status check:

1. Go to **Settings → Rules → Add branch ruleset**
2. Target branch: `main`
3. Enable **Require status checks to pass** → add `code-review/issues`
4. Save

> The check name appears in the dropdown after the workflow has run at least once.

### 4. Local environment (optional, for CLI use)

```bash
cp .env.example .env
# Fill in: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, CLAUDE_API_KEY
```

---

## Usage

### Automatic (recommended)
Open a pull request — the review runs automatically.

### Manual CLI
```bash
npm run build
GITHUB_OWNER=your_user GITHUB_REPO=your_repo PR_NUMBER=1 npm run review
```

### Manual workflow trigger
Actions → Claude Code Review → Run workflow → enter PR number.

### Customize standards
Edit `config/standards.yaml` to enable/disable rules or adjust severity levels.

---

## Project Structure

```
.github/
  workflows/
    code-review.yml       # Main review workflow (runs on every PR)
    resolve-check.yml     # Unblocks PR when all issues are resolved
config/
  standards.yaml          # 21 coding standards rules
  skill-definition.md     # Claude skill instructions
src/
  formatters/
    analysis-formatter.ts # Parses Claude response → GitHub comments
  services/
    claude-service.ts     # Claude API client (Opus 4.6)
    standards-engine.ts   # Loads standards.yaml, builds prompts
    github/
      github-config.ts    # Reads GITHUB_TOKEN from environment
      github-service.ts   # Octokit wrapper (diffs, comments, issues, statuses)
  tests/                  # Test files
  cli.ts                  # CLI entry point
  orchestrator.ts         # Main workflow coordinator
```

---

## What It Reviews

### Security (6 rules)
SQL injection, hardcoded secrets, unsafe deserialization, auth gaps, XSS, input validation

### Performance (5 rules)
N+1 queries, O(n²) algorithms, missing caching, memory leaks, unnecessary operations

### Style (5 rules)
Naming conventions, function length, error handling, code duplication, documentation

### Best Practices (4 rules)
Modern idioms, design patterns, testability, console logs in production

---

## Deploying to Another Project

1. Copy `.github/workflows/code-review.yml` and `.github/workflows/resolve-check.yml` to the target repo
2. Add `GH_TOKEN` and `CLAUDE_API_KEY` secrets
3. Copy `config/standards.yaml` and customize rules for your team
4. Set up branch protection with `code-review/issues` as a required status check

---

## Troubleshooting

**"GitHub token is invalid"** — Check token scopes (`repo`, `read:user`) and expiry.

**"Claude API error: credit balance too low"** — Add credits at console.anthropic.com.

**Merge button stays blocked after closing issues** — The `resolve-check.yml` workflow only fires for issues created by `github-actions[bot]`. Manually created issues with the `code-review` label won't trigger it.

**Inline comments marked "Outdated"** — Expected behavior when a new commit is pushed after comments were posted. GitHub marks them outdated because the underlying code changed.

---

## Architecture

**StandardsEngine** — Loads and validates coding standards from YAML  
**ClaudeService** — Sends prompts to Claude API, handles retries and timeouts  
**GitHubService** — Octokit wrapper: fetches diffs, posts comments, creates issues, sets commit statuses  
**AnalysisFormatter** — Parses Claude's JSON response, converts to inline comments and PR comment markdown  
**CodeReviewOrchestrator** — Coordinates the full workflow end-to-end  

---

**Last Updated:** May 11, 2026 | **Version:** 1.2.0
