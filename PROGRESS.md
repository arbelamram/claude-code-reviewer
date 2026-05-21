# Claude Code Reviewer — Progress Tracker

**Version:** 1.3.0 | **Updated:** May 21, 2026

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
- ✅ fix/standards-engine-bool-rules — Boolean-format rules (`rule: true`) now included via `getRuleName()` + `METADATA_KEYS` exclusion set; `enabled: false` on individual rules respected
- ✅ fix/language-rules-unused — Language-specific rules (JS/TS/Python) now appended to prompt in `getEnabledRulesAsText()` second loop; `countEnabledRules()` updated to match
- ✅ fix/job-timeout — `timeout-minutes: 10` added to the Run Claude Code Review step in `code-review.yml`; prevents a hung Claude API call from consuming the 6-hour default
- ✅ fix/inline-comment-batching — Single `createReview` call replaces per-comment loop; per-comment fallback preserved for resilience on batch rejection
- ✅ fix/status-context-constant — `STATUS_CONTEXT` extracted to `src/constants.ts`; imported in `github-service.ts`; source-of-truth comments added to both YAML workflow files
- ✅ fix/status-context-validation — `scripts/validate-status-context.mjs` added; prebuild hook gates every build; 9 revision cycles against GitHub Actions reviewer until EXCELLENT with no medium/high issues; two-gate review process documented in CLAUDE.md

---

## 🔲 Pending

- [ ] ops/token-rotation — Revoke GH_TOKEN PAT + rotate CLAUDE_API_KEY (manual, no code change)

---

## 🔧 Improvements Backlog (priority ordered)

### 🟠 Priority 2 — High (reliability & maintainability)

- [x] **fix/version-sync** — `package.json` version synced to `1.3.0`; description, author, keywords, license all updated.
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
