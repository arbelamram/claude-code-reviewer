import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(process.cwd(), '.env') });

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

class GitHubConfigManager {
  private config: GitHubConfig;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is not set');
    }

    if (!owner || !repo) {
      console.warn('⚠️  GITHUB_OWNER or GITHUB_REPO not set. Some features may not work.');
    }

    this.config = {
      token,
      owner: owner || '',
      repo: repo || '',
    };
  }

  /**
   * Get the full config
   */
  getConfig(): GitHubConfig {
    return this.config;
  }

  /**
   * Get just the token
   */
  getToken(): string {
    return this.config.token;
  }

  /**
   * Get owner/repo
   */
  getRepository(): { owner: string; repo: string } {
    return {
      owner: this.config.owner,
      repo: this.config.repo,
    };
  }

  /**
   * Check if config is complete
   */
  isConfigComplete(): boolean {
    return !!(this.config.token && this.config.owner && this.config.repo);
  }
}

export { GitHubConfigManager, GitHubConfig };