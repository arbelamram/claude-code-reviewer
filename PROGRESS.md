# Claude Code Reviewer — Progress Tracker

**Version:** 1.3.0 | **Updated:** May 18, 2026

---

## ✅ Completed (v1.3.0)

- ✅ fix/disable-issue-creation — Gate issue creation behind env var
- ✅ fix/resolve-check-condition — Triple gate on resolve-check.yml (label + owner + body marker)
- ✅ docs/post-merge-workflow — Post-merge tracking rule in CLAUDE.md
- ✅ fix/false-positive-issues — Suppress no-op AI responses (prompt + post-parse filter)
- ✅ fix/commit-status-annotation — ::error:: annotation when status update fails silently
- ✅ fix/issue-location — 📍 Location shown for all severities; prompt instruction mandatory
- ✅ fix/issue-comment-spacing — Blank line between message and location/suggestion
- ✅ feat/bot-identity — Switched to github.token; GH_TOKEN PAT eliminated
- ✅ docs/readme-v1.3.0 — README updated: no PAT, rule count corrected, v1.3.0 features
- ✅ fix/pending-initial-status — Initial commit status changed from failure → pending while review runs
- ✅ docs/license-and-readme — LICENSE file added; README rewritten with badges, ToC, Design Decisions
- ✅ fix/file-type-filtering — Non-code files excluded from review via configurable exclude_paths in standards.yaml; trySetCommitStatus helper extracted; PR comment posted when all files excluded
- ✅ fix/prompt-false-positives — 4 prompt rules added to suppress missing-import noise, acknowledged-tradeoff re-flagging, metadata/badge complaints, and library-swap opinions; NO_OP_PATTERNS expanded with Class 3 filter

---

## 🔲 Pending

- [ ] ops/token-rotation — Revoke GH_TOKEN PAT + rotate CLAUDE_API_KEY (manual, no code change)

---

## 🔧 Improvements Backlog (priority ordered)

### 🔴 Priority 1 — Critical (correctness bugs)

- [ ] **fix/standards-engine-bool-rules** — `standards-engine.ts` skips all boolean-format rules (`rule: true`) because it checks `typeof ruleData === 'object'`. Likely ~50% of standards.yaml rules are silently ignored. Fix: handle boolean rules explicitly. File: `src/services/standards-engine.ts` lines 72–127.
- [ ] **fix/language-rules-unused** — Language-specific rules (JS/TS/Python, 13+ rules) in `standards.yaml` are loaded but never included in the prompt. `getEnabledRulesAsText()` iterates only the 4 main categories. Fix: add language rules iteration. File: `src/services/standards-engine.ts`.

### 🟠 Priority 2 — High (reliability & maintainability)

- [ ] **fix/job-timeout** — `npm run review` step in `code-review.yml` has no `timeout-minutes`. A hung Claude API call runs for GitHub's 6-hour default. Fix: add `timeout-minutes: 10` to the run step.
- [ ] **fix/anthropic-api-version** — `claude-service.ts` hardcodes `anthropic-version: '2023-06-01'` (outdated). Update to current version. File: `src/services/claude-service.ts` line 76.
- [x] **fix/version-sync** — `package.json` version synced to `1.3.0`; description, author, keywords, license all updated.
- [ ] **fix/inline-comment-batching** — `github-service.ts` posts each inline comment as a separate API call. GitHub's review API accepts all comments in one call. Fix reduces latency and rate limit exposure. File: `src/services/github/github-service.ts` lines 148–164.
- [ ] **fix/status-context-constant** — The string `'code-review/issues'` is hardcoded independently in `github-service.ts`, `orchestrator.ts`, `code-review.yml`, and `resolve-check.yml`. Extract to shared constant. One drift breaks the entire flow.

### 🟡 Priority 3 — Medium (gaps worth addressing)

- [ ] **fix/remove-node-fetch** — Project runs on Node 22 (native `fetch` available). Remove outdated `node-fetch` dependency and `@types/node-fetch`. File: `src/services/claude-service.ts` line 1, `package.json`.
- [ ] **fix/claude-total-timeout** — `claude-service.ts` sets 60s timeout per attempt but with 3 retries total could take 3+ minutes. Add a global timeout cap across all attempts.
- [ ] **fix/severity-thresholds** — `standards.yaml` defines `severity_thresholds: high: 10, medium: 20` but orchestrator never reads them. Currently any single issue blocks. Implement or remove the config.
- [ ] **fix/npm-test-script** — Test files exist in `src/tests/` but no `npm test` command in `package.json`. CI has no automated test step.

### 🟢 Priority 4 — Low (polish)

- [ ] **fix/status-description-length** — GitHub caps status descriptions at 140 characters. `github-service.ts` doesn't validate or truncate before sending.
- [ ] **fix/cli-pr-number-validation** — `cli.ts` parses `PR_NUMBER` env var with `parseInt` but doesn't guard against NaN before passing to orchestrator.
- [ ] **fix/package-metadata** — `package.json` missing `description`, `author`, `repository` fields.
- [ ] **docs/env-vars-readme** — `ENABLE_ISSUE_CREATION`, `LOG_LEVEL`, token env vars not documented in README setup section.

---

## 💡 Future (long-term)

- [ ] Real unit tests with Jest/Vitest
- [ ] Dashboard for review history and metrics
- [ ] Slack/Email notifications on review completion
- [ ] Support multiple standards profiles (fast / thorough / strict)
- [ ] Docker containerization for isolated local runs
- [ ] Cache recently analyzed code to reduce API costs
