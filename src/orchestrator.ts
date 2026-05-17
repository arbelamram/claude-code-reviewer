import { StandardsEngine } from './services/standards-engine.js';
import { AnalysisFormatter, type AnalysisResult, type CodeIssue } from './formatters/analysis-formatter.js';
import { GitHubService, type PRDiff } from './services/github/github-service.js';
import { GitHubConfigManager } from './services/github/github-config.js';
import { ClaudeService } from './services/claude-service.js';
import * as path from 'path';

// ── Module-level constants ──────────────────────────────────────────────────

const DEFAULT_MAX_PROMPT_TOKENS    = 150_000;
const DEFAULT_TARGET_PROMPT_TOKENS = 100_000;
const MAX_ISSUE_TITLE_LENGTH       = 69;
const ISSUE_CREATION_DELAY_MS      = 1_000;
const ISSUE_CREATION_MAX_RETRIES   = 3;

// ── Interfaces ─────────────────────────────────────────────────────────────

interface ReviewOptions {
  owner: string;
  repo: string;
  prNumber: number;
  claudeApiKey: string;
}

// Injected at construction time — decouples call sites from process.env
// and makes the class testable without environment side-effects.
interface OrchestratorConfig {
  issueCreationEnabled: boolean;
  maxPromptTokens: number;
  targetPromptTokens: number;
  standardsPath?: string; // override for testing without the filesystem default
}

function loadConfig(): OrchestratorConfig {
  const parseEnvInt = (name: string, fallback: number): number => {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    issueCreationEnabled: process.env.ENABLE_ISSUE_CREATION === 'true',
    maxPromptTokens:    parseEnvInt('MAX_PROMPT_TOKENS',    DEFAULT_MAX_PROMPT_TOKENS),
    targetPromptTokens: parseEnvInt('TARGET_PROMPT_TOKENS', DEFAULT_TARGET_PROMPT_TOKENS),
  };
}

// ── Orchestrator ───────────────────────────────────────────────────────────

class CodeReviewOrchestrator {
  private standardsEngine: StandardsEngine;
  private githubService: GitHubService;
  private claudeService: ClaudeService; // stores the service, not the raw key
  private readonly config: OrchestratorConfig;

  private static readonly SEVERITY_LABEL: Record<string, string> = {
    high:   'priority: high',
    medium: 'priority: medium',
  };

  private static readonly MAX_ISSUES_PER_RUN = 10;

  private static readonly COMMIT_STATE = {
    SUCCESS: 'success' as const,
    FAILURE: 'failure' as const,
  };

  constructor(claudeApiKey: string, config: OrchestratorConfig = loadConfig()) {
    const standardsPath = config.standardsPath ?? path.join(process.cwd(), 'config/standards.yaml');
    this.standardsEngine = new StandardsEngine(standardsPath);
    this.standardsEngine.loadStandards();

    const configManager = new GitHubConfigManager();
    let githubToken: string;
    try {
      githubToken = configManager.getToken();
    } catch (err: unknown) {
      throw new Error(`Failed to load GitHub token: ${this.safeErrorMessage(err)}`);
    }

    this.githubService = new GitHubService(githubToken);
    this.claudeService = new ClaudeService(claudeApiKey);
    this.config        = config;
  }

  // ── Main workflow ──────────────────────────────────────────────────────────

  async reviewPullRequest(options: ReviewOptions): Promise<void> {
    this.validateOptions(options);

    console.log(`\n🚀 Starting Code Review for PR #${options.prNumber}`);
    console.log(`📍 Repository: ${options.owner}/${options.repo}\n`);

    try {
      const { prContext, diffs } = await this.fetchPRData(options);
      const analysis             = await this.analyseCode(diffs);
      const inlineCount          = await this.postResults(options, analysis);

      let issueCount = 0;
      if (this.config.issueCreationEnabled) {
        issueCount = await this.createIssuesForProblems(
          options.owner, options.repo, options.prNumber, prContext.headSha, analysis
        );
      } else {
        await this.setStatusFromAnalysis(options.owner, options.repo, prContext.headSha, analysis);
      }

      this.logReviewSummary(options.prNumber, inlineCount, issueCount);
    } catch (error: unknown) {
      const msg = this.safeErrorMessage(error);
      console.error(`❌ Code review failed for PR #${options.prNumber}: ${msg}`);
      throw new Error(`Code review failed for PR #${options.prNumber}: ${msg}`);
    }
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  private validateOptions(options: ReviewOptions): void {
    if (!options.owner || typeof options.owner !== 'string') {
      throw new Error('Invalid ReviewOptions: owner must be a non-empty string');
    }
    if (!options.repo || typeof options.repo !== 'string') {
      throw new Error('Invalid ReviewOptions: repo must be a non-empty string');
    }
    if (!Number.isInteger(options.prNumber) || options.prNumber <= 0) {
      throw new Error('Invalid ReviewOptions: prNumber must be a positive integer');
    }
    if (!options.claudeApiKey || typeof options.claudeApiKey !== 'string') {
      throw new Error('Invalid ReviewOptions: claudeApiKey must be a non-empty string');
    }
  }

  // ── Fetch phase ────────────────────────────────────────────────────────────

  private async fetchPRData(options: ReviewOptions) {
    console.log('📋 Fetching PR information...');
    const prContext = await this.githubService.getPRContext(
      options.owner, options.repo, options.prNumber
    );

    // Strip control characters before logging user-controlled strings
    const safeTitle  = prContext.title.replace(/[\r\n\t]/g, ' ').slice(0, 200);
    const safeAuthor = prContext.author.replace(/[^a-zA-Z0-9_\-.]/g, '').slice(0, 100);
    console.log(`✅ PR: "${safeTitle}" by @${safeAuthor}\n`);

    console.log('📝 Fetching code changes...');
    const diffs = await this.githubService.getPRDiff(
      options.owner, options.repo, options.prNumber
    );
    console.log(`✅ Found ${diffs.length} files changed\n`);

    return { prContext, diffs };
  }

  // ── Analyse phase ──────────────────────────────────────────────────────────

  private async analyseCode(diffs: PRDiff[]): Promise<AnalysisResult> {
    const combinedCode = this.prepareCombinedCode(diffs);
    console.log('🔨 Code prepared — building prompt...');

    let prompt = this.standardsEngine.buildPrompt(combinedCode, 'mixed');
    const validation = this.validatePromptSize(prompt, diffs);
    prompt = validation.prompt;
    if (validation.truncated) {
      console.warn('⚠️ Large PR truncated to fit context window\n');
    }

    console.log('🤖 Sending to Claude for analysis...');
    const claudeResponse = await this.claudeService.analyzeCode(prompt);
    console.log('✅ Analysis complete\n');

    return AnalysisFormatter.parseAnalysis(claudeResponse);
  }

  // ── Post results phase ─────────────────────────────────────────────────────

  private async postResults(options: ReviewOptions, analysis: AnalysisResult): Promise<number> {
    const prComment      = AnalysisFormatter.formatForPRComment(analysis);
    const reviewComments = AnalysisFormatter.convertToReviewComments(analysis);

    console.log('📤 Posting review to GitHub...');
    if (reviewComments.length > 0) {
      await this.githubService.postPRReview({
        owner:    options.owner,
        repo:     options.repo,
        prNumber: options.prNumber,
        comments: reviewComments,
        summary:  '📋 Inline code review comments posted below',
      });
    }

    await this.githubService.postPRComment({
      owner:    options.owner,
      repo:     options.repo,
      prNumber: options.prNumber,
      comment:  prComment,
    });
    console.log(`✅ Summary comment posted (${reviewComments.length} inline comment(s))\n`);

    return reviewComments.length;
  }

  // ── Commit status ──────────────────────────────────────────────────────────

  private async setStatusFromAnalysis(
    owner: string,
    repo: string,
    headSha: string,
    analysis: AnalysisResult
  ): Promise<void> {
    const blocking = analysis.issues.filter(i => i.severity === 'high' || i.severity === 'medium');
    try {
      if (blocking.length > 0) {
        await this.githubService.setCommitStatus(
          owner, repo, headSha,
          CodeReviewOrchestrator.COMMIT_STATE.FAILURE,
          `${blocking.length} issue(s) found — push fixes to re-run review`
        );
      } else {
        await this.githubService.setCommitStatus(
          owner, repo, headSha,
          CodeReviewOrchestrator.COMMIT_STATE.SUCCESS,
          'No blocking code review issues found'
        );
      }
    } catch (err: unknown) {
      console.warn(`⚠️  Commit status update failed: ${this.safeErrorMessage(err)}`);
    }
  }

  // ── Issue creation ─────────────────────────────────────────────────────────

  private async createIssuesForProblems(
    owner: string,
    repo: string,
    prNumber: number,
    headSha: string,
    analysis: AnalysisResult
  ): Promise<number> {
    const actionable = analysis.issues.filter(
      i => i.severity === 'high' || i.severity === 'medium'
    );

    if (actionable.length === 0) {
      console.log('ℹ️  No high/medium issues — setting commit status to success');
      try {
        await this.githubService.setCommitStatus(
          owner, repo, headSha,
          CodeReviewOrchestrator.COMMIT_STATE.SUCCESS,
          'No blocking code review issues found'
        );
      } catch (err: unknown) {
        console.warn(`⚠️  Status update failed (review still passed): ${this.safeErrorMessage(err)}`);
      }
      return 0;
    }

    const capped = actionable.slice(0, CodeReviewOrchestrator.MAX_ISSUES_PER_RUN);
    if (actionable.length > CodeReviewOrchestrator.MAX_ISSUES_PER_RUN) {
      console.warn(
        `⚠️  ${actionable.length} issues found; capped at ${CodeReviewOrchestrator.MAX_ISSUES_PER_RUN} to respect rate limits`
      );
    }

    let created = 0;
    for (const issue of capped) {
      const { title, body } = this.formatIssueContent(issue, prNumber);
      // Fallback label ensures no undefined entries in the labels array
      const severityLabel = CodeReviewOrchestrator.SEVERITY_LABEL[issue.severity] ?? 'priority: medium';
      try {
        await this.createIssueWithRetry(owner, repo, title, body, ['code-review', severityLabel]);
        created++;
      } catch (err: unknown) {
        console.warn(`⚠️  Could not create issue: ${this.safeErrorMessage(err)}`);
      }
    }

    if (created > 0) {
      try {
        await this.githubService.setCommitStatus(
          owner, repo, headSha,
          CodeReviewOrchestrator.COMMIT_STATE.FAILURE,
          `${created} code review issue(s) must be resolved before merging`
        );
      } catch (err: unknown) {
        console.warn(`⚠️  Status update failed: ${this.safeErrorMessage(err)}`);
      }
    }

    return created;
  }

  // Retries with exponential backoff to handle GitHub secondary rate limits.
  private async createIssueWithRetry(
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels: string[]
  ): Promise<void> {
    let delay = ISSUE_CREATION_DELAY_MS;
    for (let attempt = 1; attempt <= ISSUE_CREATION_MAX_RETRIES; attempt++) {
      try {
        await this.githubService.createIssue(owner, repo, title, body, labels);
        return;
      } catch (err: unknown) {
        if (attempt === ISSUE_CREATION_MAX_RETRIES) throw err;
        console.warn(
          `⚠️  Issue creation attempt ${attempt} failed, retrying in ${delay}ms: ${this.safeErrorMessage(err)}`
        );
        await new Promise<void>(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  // ── Logging ────────────────────────────────────────────────────────────────

  private logReviewSummary(prNumber: number, inlineCount: number, issueCount: number): void {
    console.log(`\n✨ Code review complete for PR #${prNumber}!`);
    console.log(`   📌 Posted ${inlineCount} inline comment(s) on specific lines`);
    if (this.config.issueCreationEnabled) {
      console.log(`   🐛 Created ${issueCount} GitHub issue(s) for problems to fix`);
    } else {
      console.log(`   ℹ️  Issue creation disabled — commit status reflects review outcome`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Returns only printable ASCII from an error — prevents leaking stack traces,
  // internal paths, or embedded secrets that may appear in exception messages.
  private safeErrorMessage(err: unknown): string {
    const raw = err instanceof Error ? err.message : 'Unknown error';
    return raw.replace(/[^\x20-\x7E]/g, '').slice(0, 200);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private validatePromptSize(prompt: string, diffs: PRDiff[]): { prompt: string; truncated: boolean } {
    const estimatedTokens = this.estimateTokens(prompt);

    if (estimatedTokens <= this.config.targetPromptTokens) {
      console.log(`✅ Prompt size OK (${estimatedTokens} estimated tokens)`);
      return { prompt, truncated: false };
    }

    if (estimatedTokens > this.config.maxPromptTokens) {
      console.warn(`⚠️ Prompt exceeds max tokens (${estimatedTokens} > ${this.config.maxPromptTokens})`);
      console.log('🔪 Truncating code changes to fit context window...');

      // Compute fixed standards overhead once so the loop stays O(n) instead of O(n×m).
      const overheadTokens = this.estimateTokens(this.standardsEngine.buildPrompt('', 'mixed'));

      let truncatedCode = '';
      let filesIncluded = 0;

      for (const diff of diffs) {
        const fileSection = `\`\`\`
File: ${diff.fileName}
Status: ${diff.status}
Changes: +${diff.additions}/-${diff.deletions}
\`\`\`

${diff.patch || '(No patch content)'}
`;
        const projectedTokens = overheadTokens + this.estimateTokens(truncatedCode + fileSection);
        if (projectedTokens <= this.config.targetPromptTokens) {
          truncatedCode += fileSection + '\n\n---\n\n';
          filesIncluded++;
        } else {
          break;
        }
      }

      if (filesIncluded === 0) {
        console.error('❌ Even the smallest file exceeds token limit');
        return { prompt, truncated: true };
      }

      const newPrompt = this.standardsEngine.buildPrompt(truncatedCode, 'mixed');
      console.warn(`⚠️ Included ${filesIncluded}/${diffs.length} files (${this.estimateTokens(newPrompt)} tokens)`);
      return { prompt: newPrompt, truncated: true };
    }

    console.log(`✅ Prompt size OK (${estimatedTokens} estimated tokens)`);
    return { prompt, truncated: false };
  }

  private annotatePatchLines(fileName: string, patch: string): string {
    if (!patch) return `File: ${fileName}\n(No patch content)`;

    const lines = patch.split('\n');
    const out: string[] = [`File: ${fileName}`];
    let rightLine = 0;

    for (const raw of lines) {
      const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) {
        rightLine = parseInt(hunk[1], 10) - 1;
        out.push(raw);
        continue;
      }

      if (raw.startsWith('+')) {
        rightLine++;
        out.push(`L${rightLine}+  ${raw.slice(1)}`);
      } else if (raw.startsWith('-')) {
        out.push(`     -  ${raw.slice(1)}`);
      } else {
        rightLine++;
        out.push(`L${rightLine}   ${raw.slice(1)}`);
      }
    }

    return out.join('\n');
  }

  private prepareCombinedCode(diffs: PRDiff[]): string {
    const sections = diffs.map(diff => {
      const annotated = this.annotatePatchLines(diff.fileName, diff.patch);
      return `\`\`\`
Status: ${diff.status} (+${diff.additions}/-${diff.deletions})

${annotated}
\`\`\``;
    });

    return sections.join('\n\n---\n\n');
  }

  private sanitizeForIssue(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')              // strip HTML tags to prevent injection
      .replace(/@(?=[a-zA-Z])/g, '[at]')    // neutralise @mentions so GitHub doesn't notify users
      .replace(/[^\x09\x0A\x0D\x20-\x7E\x80-￿]/g, ''); // remove non-printable control characters
  }

  private formatIssueContent(issue: CodeIssue, prNumber: number): { title: string; body: string } {
    const shortMsg = issue.message.replace(/[\r\n\t`<>]+/g, ' ').trim().slice(0, MAX_ISSUE_TITLE_LENGTH);
    const ellipsis = issue.message.trim().length > MAX_ISSUE_TITLE_LENGTH ? '...' : '';
    const title    = `[Code Review] ${issue.type}: ${shortMsg}${ellipsis}`;

    const location = issue.location ? `\n**Location:** \`${issue.location}\`` : '';
    const body = [
      `> Auto-generated from code review on PR #${prNumber}`,
      '',
      `**Severity:** ${issue.severity}`,
      `**Type:** ${issue.type}`,
      location,
      '',
      '## Problem',
      this.sanitizeForIssue(issue.message),
      '',
      '## Suggested Fix',
      this.sanitizeForIssue(issue.suggestion),
      ...(issue.example
        ? ['', '## Example', `\`\`\`\n${this.sanitizeForIssue(issue.example)}\n\`\`\``]
        : []),
    ].join('\n');

    return { title, body };
  }
}

export { CodeReviewOrchestrator, ReviewOptions };
