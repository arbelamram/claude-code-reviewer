import { Octokit } from '@octokit/rest';
import { STATUS_CONTEXT } from '../../constants.js';

interface PRDiff {
  fileName: string;
  status: 'added' | 'removed' | 'modified';
  patch: string;
  additions: number;
  deletions: number;
}

interface PRContext {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  description: string;
  author: string;
  createdAt: string;
  headSha: string;
}

interface CommentOptions {
  owner: string;
  repo: string;
  prNumber: number;
  comment: string;
}

interface ReviewCommentInput {
  path: string;
  line: number;
  body: string;
}

interface ReviewOptions {
  owner: string;
  repo: string;
  prNumber: number;
  comments: ReviewCommentInput[];
  summary?: string;
}

class GitHubService {
  private octokit: Octokit;
  private token: string;

  constructor(githubToken: string) {
    this.token = githubToken;
    this.octokit = new Octokit({
      auth: githubToken,
      request: {
        fetch: fetch as any,
      },
    });
  }

  /**
   * Get the diff for a pull request (handles pagination for large PRs)
   */
  async getPRDiff(owner: string, repo: string, prNumber: number): Promise<PRDiff[]> {
    try {
      const files = await this.octokit.paginate(this.octokit.pulls.listFiles, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });

      return files.map(file => ({
        fileName: file.filename,
        status: file.status as 'added' | 'removed' | 'modified',
        patch: file.patch || '',
        additions: file.additions,
        deletions: file.deletions,
      }));
    } catch (error) {
      console.error('Error fetching PR diff:', error);
      throw error;
    }
  }

  /**
   * Get PR context information
   */
  async getPRContext(owner: string, repo: string, prNumber: number): Promise<PRContext> {
    try {
      const { data: pr } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      return {
        owner,
        repo,
        prNumber,
        title: pr.title,
        description: pr.body || '',
        author: pr.user?.login || 'unknown',
        createdAt: pr.created_at,
        headSha: pr.head.sha,
      };
    } catch (error) {
      console.error('Error fetching PR context:', error);
      throw error;
    }
  }

  /**
   * Post a comment on a pull request
   */
  async postPRComment(options: CommentOptions): Promise<void> {
    try {
      await this.octokit.issues.createComment({
        owner: options.owner,
        repo: options.repo,
        issue_number: options.prNumber,
        body: options.comment,
      });
      console.log(`✅ Comment posted to PR #${options.prNumber}`);
    } catch (error) {
      console.error('Error posting comment:', error);
      throw error;
    }
  }

  /**
   * Post a pull request review with inline comments on specific lines
   */
  async postPRReview(options: ReviewOptions): Promise<void> {
    try {
      if (options.comments.length === 0) {
        console.log('ℹ️  No inline comments to post');
        return;
      }

      const { data: pr } = await this.octokit.pulls.get({
        owner: options.owner,
        repo: options.repo,
        pull_number: options.prNumber,
      });

      try {
        await this.octokit.pulls.createReview({
          owner:       options.owner,
          repo:        options.repo,
          pull_number: options.prNumber,
          commit_id:   pr.head.sha,
          event:       'COMMENT',
          comments:    options.comments.map(c => ({
            path: c.path,
            line: c.line,
            body: c.body,
          })),
        });
        console.log(`✅ Posted ${options.comments.length} inline comment(s) to PR #${options.prNumber}`);
      } catch (batchError) {
        // createReview is all-or-nothing; fall back to per-comment to preserve partial results
        console.warn(`⚠️  Batch review failed — falling back to per-comment posting: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
        let posted = 0;
        for (const comment of options.comments) {
          try {
            await this.octokit.pulls.createReviewComment({
              owner:       options.owner,
              repo:        options.repo,
              pull_number: options.prNumber,
              commit_id:   pr.head.sha,
              path:        comment.path,
              line:        comment.line,
              body:        comment.body,
            });
            posted++;
          } catch {
            console.warn(`⚠️  Skipped comment on ${comment.path}:${comment.line}`);
          }
        }
        console.log(`✅ Posted ${posted}/${options.comments.length} inline comment(s) via fallback`);
      }
    } catch (error) {
      console.error('Error posting PR review comments:', error);
      throw error;
    }
  }

  /**
   * Create a GitHub issue
   */
  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels?: string[]
  ): Promise<number> {
    try {
      const { data: issue } = await this.octokit.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
      });
      console.log(`✅ Created issue #${issue.number}`);
      return issue.number;
    } catch (error) {
      const safeMsg = (error instanceof Error ? error.message : String(error)).slice(0, 120);
      console.error('Error creating issue:', safeMsg);
      throw error;
    }
  }

  /**
   * Set a commit status check (used to block/unblock PR merges).
   * context should be a stable string like "code-review/issues" that matches
   * the required status check configured in branch protection settings.
   */
  async setCommitStatus(
    owner: string,
    repo: string,
    sha: string,
    state: 'pending' | 'success' | 'failure' | 'error',
    description: string,
    context: string = STATUS_CONTEXT
  ): Promise<void> {
    try {
      await this.octokit.repos.createCommitStatus({
        owner,
        repo,
        sha,
        state,
        description,
        context,
      });
      console.log(`✅ Commit status set to "${state}": ${description}`);
    } catch (error) {
      const safeMsg = (error instanceof Error ? error.message : String(error)).slice(0, 120);
      console.error('Error setting commit status:', safeMsg);
      throw error;
    }
  }

  /**
   * Verify token is valid by fetching authenticated user
   */
  async verifyToken(): Promise<boolean> {
    try {
      await this.octokit.users.getAuthenticated();
      return true;
    } catch (error) {
      console.error('Invalid GitHub token:', error);
      return false;
    }
  }

  /**
   * Get authenticated user information
   */
  async getAuthenticatedUser(): Promise<string> {
    try {
      const { data: user } = await this.octokit.users.getAuthenticated();
      return user.login;
    } catch (error) {
      console.error('Error getting authenticated user:', error);
      throw error;
    }
  }
}

export { GitHubService, PRDiff, PRContext, CommentOptions, ReviewCommentInput, ReviewOptions };