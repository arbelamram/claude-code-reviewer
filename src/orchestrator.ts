import { StandardsEngine } from './services/standards-engine.js';
import { AnalysisFormatter, type AnalysisResult, type CodeIssue } from './formatters/analysis-formatter.js';
import { GitHubService } from './services/github/github-service.js';
import { GitHubConfigManager } from './services/github/github-config.js';
import { ClaudeService } from './services/claude-service.js';
import * as path from 'path';

interface ReviewOptions {
  owner: string;
  repo: string;
  prNumber: number;
  claudeApiKey: string;
}

// Injected at construction time so call sites never read process.env directly.
interface OrchestratorConfig {
  issueCreationEnabled: boolean;
  maxPromptTokens: number;
  targetPromptTokens: number;
}

function loadConfig(): OrchestratorConfig {
  return {
    issueCreationEnabled: process.env.ENABLE_ISSUE_CREATION === 'true',
    maxPromptTokens: 150000,
    targetPromptTokens: 100000,
  };
}

class CodeReviewOrchestrator {
  private standardsEngine: StandardsEngine;
  private githubService: GitHubService;
  private configManager: GitHubConfigManager;
  private claudeApiKey: string;
  private readonly config: OrchestratorConfig;

  private static readonly SEVERITY_LABEL: Record<string, string> = {
    high: 'priority: high',
    medium: 'priority: medium',
  };

  private static readonly MAX_ISSUES_PER_RUN = 10;

  private static readonly COMMIT_STATE = {
    SUCCESS: 'success' as const,
    FAILURE: 'failure' as const,
  };

  constructor(claudeApiKey: string, config: OrchestratorConfig = loadConfig()) {
    const standardsPath = path.join(process.cwd(), 'config/standards.yaml');
    this.standardsEngine = new StandardsEngine(standardsPath);
    this.standardsEngine.loadStandards();

    this.configManager = new GitHubConfigManager();
    const githubToken = this.configManager.getToken();
    this.githubService = new GitHubService(githubToken);
    this.claudeApiKey = claudeApiKey;
    this.config = config;
  }

  // ── Main workflow ──────────────────────────────────────────────────────────

  async reviewPullRequest(options: ReviewOptions): Promise<void> {
    console.log(`\n🚀 Starting Code Review for PR #${options.prNumber}`);
    console.log(`📍 Repository: ${options.owner}/${options.repo}\n`);

    try {
      const { prContext, diffs } = await this.fetchPRData(options);
      const analysis = await this.analyseCode(diffs);
      const inlineCount = await this.postResults(options, analysis);

      let issueCount = 0;
      if (this.config.issueCreationEnabled) {
        issueCount = await this.createIssuesForProblems(
          options.owner, options.repo, options.prNumber, prContext.headSha, analysis
        );
      } else {
        await this.setStatusFromAnalysis(options.owner, options.repo, prContext.headSha, analysis);
      }

      console.log(`\n✨ Code review complete for PR #${options.prNumber}!`);
      console.log(`   📌 Posted ${inlineCount} inline comment(s) on specific lines`);
      if (this.config.issueCreationEnabled) {
        console.log(`   🐛 Created ${issueCount} GitHub issue(s) for problems to fix`);
      } else {
        console.log(`   ℹ️  Issue creation disabled — commit status reflects review outcome`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Code review failed for PR #${options.prNumber}: ${msg.slice(0, 200)}`);
      throw new Error(`Code review failed for PR #${options.prNumber}: ${msg}`);
    }
  }

  // ── Fetch phase ────────────────────────────────────────────────────────────

  private async fetchPRData(options: ReviewOptions) {
    console.log('📋 Fetching PR information...');
    const prContext = await this.githubService.getPRContext(
      options.owner, options.repo, options.prNumber
    );
    console.log(`✅ PR Title: ${prContext.title}`);
    console.log(`✅ Author: @${prContext.author}\n`);

    console.log('📝 Fetching code changes...');
    const diffs = await this.githubService.getPRDiff(
      options.owner, options.repo, options.prNumber
    );
    console.log(`✅ Found ${diffs.length} files changed\n`);

    return { prContext, diffs };
  }

  // ── Analyse phase ──────────────────────────────────────────────────────────

  private async analyseCode(diffs: any[]): Promise<AnalysisResult> {
    console.log('🔨 Preparing code for analysis...');
    const combinedCode = this.prepareCombinedCode(diffs);
    console.log(`✅ Code prepared (${combinedCode.length} characters)\n`);

    console.log('📊 Building analysis prompt with standards...');
    let prompt = this.standardsEngine.buildPrompt(combinedCode, 'mixed');
    console.log(`✅ Prompt ready (${prompt.length} characters)\n`);

    console.log('📏 Validating prompt size...');
    const validation = this.validatePromptSize(prompt, diffs);
    prompt = validation.prompt;
    if (validation.truncated) {
      console.warn('⚠️ Note: Large PR was truncated to fit context window\n');
    }

    console.log('🤖 Sending to Claude for analysis...');
    const claudeResponse = await this.callClaudeAPI(prompt);
    console.log('✅ Analysis complete\n');

    return AnalysisFormatter.parseAnalysis(claudeResponse);
  }

  // ── Post results phase ─────────────────────────────────────────────────────

  private async postResults(options: ReviewOptions, analysis: AnalysisResult): Promise<number> {
    const prComment = AnalysisFormatter.formatForPRComment(analysis);
    const reviewComments = AnalysisFormatter.convertToReviewComments(analysis);

    console.log('📤 Posting review to GitHub...');
    if (reviewComments.length > 0) {
      await this.githubService.postPRReview({
        owner: options.owner,
        repo: options.repo,
        prNumber: options.prNumber,
        comments: reviewComments,
        summary: '📋 Inline code review comments posted below',
      });
    }

    console.log('💬 Posting summary comment...');
    await this.githubService.postPRComment({
      owner: options.owner,
      repo: options.repo,
      prNumber: options.prNumber,
      comment: prComment,
    });

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
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  Commit status update failed: ${msg.slice(0, 120)}`);
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
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️  Status update failed (review still passed): ${msg.slice(0, 120)}`);
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
      try {
        await this.githubService.createIssue(owner, repo, title, body, [
          'code-review',
          CodeReviewOrchestrator.SEVERITY_LABEL[issue.severity],
        ]);
        created++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️  Could not create issue: ${msg.slice(0, 120)}`);
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
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️  Status update failed: ${msg.slice(0, 120)}`);
      }
    }

    return created;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private validatePromptSize(prompt: string, diffs: any[]): { prompt: string; truncated: boolean } {
    const estimatedTokens = this.estimateTokens(prompt);

    if (estimatedTokens <= this.config.targetPromptTokens) {
      console.log(`✅ Prompt size OK (${estimatedTokens} estimated tokens)`);
      return { prompt, truncated: false };
    }

    if (estimatedTokens > this.config.maxPromptTokens) {
      console.warn(`⚠️ Prompt exceeds max tokens (${estimatedTokens} > ${this.config.maxPromptTokens})`);
      console.log('🔪 Truncating code changes to fit context window...');

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
        const testPrompt = this.standardsEngine.buildPrompt(truncatedCode + fileSection, 'mixed');
        if (this.estimateTokens(testPrompt) <= this.config.targetPromptTokens) {
          truncatedCode += fileSection + '\n\n---\n\n';
          filesIncluded++;
        } else {
          break;
        }
      }

      const newPrompt = this.standardsEngine.buildPrompt(truncatedCode, 'mixed');
      console.warn(`⚠️ Included ${filesIncluded}/${diffs.length} files (${this.estimateTokens(newPrompt)} tokens)`);

      if (filesIncluded === 0) {
        console.error('❌ Even the smallest file exceeds token limit');
        return { prompt, truncated: true };
      }

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

  private prepareCombinedCode(diffs: any[]): string {
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
      .replace(/<[^>]*>/g, '')
      .replace(/@(?=[a-zA-Z])/g, '[at]')
      .replace(/[^\x09\x0A\x0D\x20-\x7E\x80-￿]/g, '');
  }

  private formatIssueContent(issue: CodeIssue, prNumber: number): { title: string; body: string } {
    const shortMsg = issue.message.replace(/[\r\n\t`<>]+/g, ' ').trim().slice(0, 69);
    const ellipsis = issue.message.trim().length > 69 ? '...' : '';
    const title = `[Code Review] ${issue.type}: ${shortMsg}${ellipsis}`;

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

  private async callClaudeAPI(prompt: string): Promise<string> {
    const claude = new ClaudeService(this.claudeApiKey);
    return claude.analyzeCode(prompt);
  }
}

export { CodeReviewOrchestrator, ReviewOptions };
