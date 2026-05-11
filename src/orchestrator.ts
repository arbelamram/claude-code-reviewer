import { StandardsEngine } from './services/standards-engine.js';
import { AnalysisFormatter, type AnalysisResult } from './formatters/analysis-formatter.js';
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

class CodeReviewOrchestrator {
  private standardsEngine: StandardsEngine;
  private githubService: GitHubService;
  private configManager: GitHubConfigManager;
  private claudeApiKey: string;
  private maxPromptTokens: number = 150000;
  private targetPromptTokens: number = 100000;

  constructor(claudeApiKey: string) {
    const standardsPath = path.join(process.cwd(), 'config/standards.yaml');
    this.standardsEngine = new StandardsEngine(standardsPath);
    this.standardsEngine.loadStandards();

    this.configManager = new GitHubConfigManager();
    const githubToken = this.configManager.getToken();
    this.githubService = new GitHubService(githubToken);
    this.claudeApiKey = claudeApiKey;
  }

  /**
   * Estimate token count (rough: ~4 characters = 1 token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Validate and potentially truncate prompt to fit within token limits
   */
  private validatePromptSize(prompt: string, diffs: any[]): { prompt: string; truncated: boolean } {
    const estimatedTokens = this.estimateTokens(prompt);

    if (estimatedTokens <= this.targetPromptTokens) {
      console.log(`✅ Prompt size OK (${estimatedTokens} estimated tokens)`);
      return { prompt, truncated: false };
    }

    if (estimatedTokens > this.maxPromptTokens) {
      console.warn(`⚠️ Prompt exceeds max tokens (${estimatedTokens} > ${this.maxPromptTokens})`);
      console.log('🔪 Truncating code changes to fit context window...');

      let truncatedCode = '';
      let filesIncluded = 0;

      for (const diff of diffs) {
        const fileSection = `
\`\`\`
File: ${diff.fileName}
Status: ${diff.status}
Changes: +${diff.additions}/-${diff.deletions}
\`\`\`

${diff.patch || '(No patch content)'}
`;

        const testPrompt = this.standardsEngine.buildPrompt(
          truncatedCode + fileSection,
          'mixed'
        );
        const testTokens = this.estimateTokens(testPrompt);

        if (testTokens <= this.targetPromptTokens) {
          truncatedCode += fileSection + '\n\n---\n\n';
          filesIncluded++;
        } else {
          break;
        }
      }

      const newPrompt = this.standardsEngine.buildPrompt(truncatedCode, 'mixed');
      const newTokens = this.estimateTokens(newPrompt);

      console.warn(`⚠️ Included ${filesIncluded}/${diffs.length} files (${newTokens} tokens)`);

      if (filesIncluded === 0) {
        console.error('❌ Even the smallest file exceeds token limit');
        return { prompt, truncated: true };
      }

      return { prompt: newPrompt, truncated: true };
    }

    console.log(`✅ Prompt size OK (${estimatedTokens} estimated tokens)`);
    return { prompt, truncated: false };
  }

  /**
   * Main workflow: Review a GitHub PR
   */
  async reviewPullRequest(options: ReviewOptions): Promise<void> {
    console.log(`\n🚀 Starting Code Review for PR #${options.prNumber}`);
    console.log(`📍 Repository: ${options.owner}/${options.repo}\n`);

    try {
      // Step 1: Get PR information
      console.log('📋 Fetching PR information...');
      const prContext = await this.githubService.getPRContext(
        options.owner,
        options.repo,
        options.prNumber
      );
      console.log(`✅ PR Title: ${prContext.title}`);
      console.log(`✅ Author: @${prContext.author}\n`);

      // Step 2: Get PR diff
      console.log('📝 Fetching code changes...');
      const diffs = await this.githubService.getPRDiff(
        options.owner,
        options.repo,
        options.prNumber
      );
      console.log(`✅ Found ${diffs.length} files changed\n`);

      // Step 3: Combine code from all files
      console.log('🔨 Preparing code for analysis...');
      const combinedCode = this.prepareCombinedCode(diffs);
      console.log(`✅ Code prepared (${combinedCode.length} characters)\n`);

      // Step 4: Build prompt with standards
      console.log('📊 Building analysis prompt with standards...');
      let prompt = this.standardsEngine.buildPrompt(combinedCode, 'mixed');
      console.log(`✅ Prompt ready (${prompt.length} characters)\n`);

      // Step 4.5: Validate prompt size
      console.log('📏 Validating prompt size...');
      const validation = this.validatePromptSize(prompt, diffs);
      prompt = validation.prompt;
      if (validation.truncated) {
        console.warn('⚠️ Note: Large PR was truncated to fit context window\n');
      }

      // Step 5: Send to Claude
      console.log('🤖 Sending to Claude for analysis...');
      const claudeResponse = await this.callClaudeAPI(prompt);

      // Step 6: Parse Claude's response
      console.log('✅ Analysis complete\n');

      // Step 7: Create PR comment
      console.log('💬 Preparing PR analysis...');
      const analysis = AnalysisFormatter.parseAnalysis(claudeResponse);

      // Format for GitHub
      const prComment = AnalysisFormatter.formatForPRComment(analysis);

      // Step 8: Post inline review comments (if any issues with file/line info)
      console.log('📤 Posting review to GitHub...');
      const reviewComments = AnalysisFormatter.convertToReviewComments(analysis);

      if (reviewComments.length > 0) {
        await this.githubService.postPRReview({
          owner: options.owner,
          repo: options.repo,
          prNumber: options.prNumber,
          comments: reviewComments,
          summary: '📋 Inline code review comments posted below',
        });
      }

      // Step 9: Also post summary comment for overview
      console.log('💬 Posting summary comment...');
      await this.githubService.postPRComment({
        owner: options.owner,
        repo: options.repo,
        prNumber: options.prNumber,
        comment: prComment,
      });

      // Step 10: Create GitHub issues for high/medium severity problems and update commit status
      console.log('📋 Creating GitHub issues for problems found...');
      const issueCount = await this.createIssuesForProblems(
        options.owner,
        options.repo,
        options.prNumber,
        prContext.headSha,
        analysis
      );

      console.log(`\n✨ Code review complete for PR #${options.prNumber}!`);
      console.log(`   📌 Posted ${reviewComments.length} inline comment(s) on specific lines`);
      console.log(`   🐛 Created ${issueCount} GitHub issue(s) for problems to fix`);
    } catch (error) {
      console.error('❌ Error during code review:', error);
      throw error;
    }
  }

  /**
   * Parse a unified diff patch and annotate each line with its actual file line number.
   * This lets Claude report exact line numbers instead of approximate ones from @@ headers.
   *
   * Output format per line:
   *   L<n>+  <code>   — added line at file line n
   *   L<n>   <code>   — context (unchanged) line at file line n
   *        - <code>   — removed line (no right-side line number)
   */
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

  /**
   * Combine code from multiple files into a single string with annotated line numbers.
   */
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

  /**
   * Create a GitHub issue for each high/medium severity problem found in the review,
   * then set the commit status to pending (blocking merge) until all issues are resolved.
   * Returns the number of issues created.
   */
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
      await this.githubService.setCommitStatus(
        owner, repo, headSha,
        'success',
        'No blocking code review issues found'
      );
      return 0;
    }

    const severityLabel: Record<string, string> = {
      high: 'priority: high',
      medium: 'priority: medium',
    };

    let created = 0;
    for (const issue of actionable) {
      const shortMsg = issue.message.length > 72
        ? issue.message.slice(0, 69) + '...'
        : issue.message;

      const title = `[Code Review] ${issue.type}: ${shortMsg}`;

      const location = issue.location ? `\n**Location:** \`${issue.location}\`` : '';
      const body = [
        `> Auto-generated from code review on PR #${prNumber}`,
        '',
        `**Severity:** ${issue.severity}`,
        `**Type:** ${issue.type}`,
        location,
        '',
        '## Problem',
        issue.message,
        '',
        '## Suggested Fix',
        issue.suggestion,
        ...(issue.example ? ['', '## Example', `\`\`\`\n${issue.example}\n\`\`\``] : []),
      ].join('\n');

      try {
        await this.githubService.createIssue(owner, repo, title, body, [
          'code-review',
          severityLabel[issue.severity],
        ]);
        created++;
      } catch {
        console.warn(`⚠️  Could not create issue for: ${shortMsg}`);
      }
    }

    // Block merge until all created issues are resolved
    if (created > 0) {
      await this.githubService.setCommitStatus(
        owner, repo, headSha,
        'pending',
        `${created} code review issue(s) must be resolved before merging`
      );
    }

    return created;
  }

  /**
   * Call Claude API
   */
  private async callClaudeAPI(prompt: string): Promise<string> {
    const claude = new ClaudeService(this.claudeApiKey);
    return await claude.analyzeCode(prompt);
  }
}

export { CodeReviewOrchestrator, ReviewOptions };