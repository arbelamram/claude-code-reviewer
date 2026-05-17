import * as fs from 'fs';

// Action types a skill can perform. Git-level entries (file_*, branch_*,
// commit_pushed, pr_*) are the primary revert targets. commit_status_set
// is included because it gates PR mergeability and is directly reversible.
type ActionType =
  | 'file_created'
  | 'file_modified'
  | 'file_deleted'
  | 'branch_created'
  | 'branch_deleted'
  | 'commit_pushed'
  | 'pr_created'
  | 'pr_merged'
  | 'commit_status_set';

interface AuditEntry {
  type: ActionType;
  timestamp: string;
  details: Record<string, unknown>;
  // When true, revertInstructions tells Claude exactly how to undo this action.
  revertible: boolean;
  revertInstructions?: string;
}

interface AuditLog {
  skillName: string;
  runId: string;
  startedAt: string;
  repository: string;
  prNumber: number;
  entries: AuditEntry[];
}

class AuditLogger {
  private readonly entries: AuditEntry[] = [];
  private readonly log: AuditLog;

  constructor(repository: string, prNumber: number) {
    this.log = {
      skillName:  'claude-code-reviewer',
      runId:      process.env.GITHUB_RUN_ID ?? 'local',
      startedAt:  new Date().toISOString(),
      repository,
      prNumber,
      entries:    this.entries,
    };
  }

  record(
    type: ActionType,
    details: Record<string, unknown>,
    revertible = false,
    revertInstructions?: string
  ): void {
    this.entries.push({
      type,
      timestamp: new Date().toISOString(),
      details,
      revertible,
      revertInstructions,
    });
  }

  // Writes the audit JSON to the path in AUDIT_LOG_PATH (if set).
  // The workflow uploads this file as a GitHub Actions artifact so Claude
  // can retrieve it later via: gh run download <runId> -n code-reviewer-audit
  flush(): void {
    const dest = process.env.AUDIT_LOG_PATH;
    if (!dest) return;
    try {
      fs.writeFileSync(dest, JSON.stringify(this.log, null, 2), 'utf8');
    } catch {
      // Non-fatal — audit write failure should never abort a review.
    }
  }

  // Appends the markdown audit summary to $GITHUB_STEP_SUMMARY (if set).
  // The summary is visible in the Actions UI under the workflow run.
  flushStepSummary(): void {
    const dest = process.env.GITHUB_STEP_SUMMARY;
    if (!dest) return;
    try {
      fs.appendFileSync(dest, '\n\n' + this.toMarkdown(), 'utf8');
    } catch {
      // Non-fatal — step summary failure should never abort a review.
    }
  }

  toMarkdown(): string {
    const { skillName, runId, startedAt, repository, prNumber, entries } = this.log;

    const lines = [
      `## 🗒️ ${skillName} — Audit Log`,
      '',
      `| Field | Value |`,
      `|---|---|`,
      `| Repository | \`${repository}\` |`,
      `| PR | #${prNumber} |`,
      `| Run ID | \`${runId}\` |`,
      `| Started | ${startedAt} |`,
      '',
    ];

    if (entries.length === 0) {
      lines.push('_No tracked actions recorded during this run._');
      lines.push('');
      lines.push('> This skill run posted review comments and set a commit status.');
      lines.push('> To revert: delete the posted comments via the GitHub UI and');
      lines.push('> reset the commit status via the GitHub API if needed.');
    } else {
      lines.push('### Actions taken', '');
      for (const entry of entries) {
        const icon = entry.revertible ? '↩️' : '📌';
        lines.push(`#### ${icon} \`${entry.type}\` — ${entry.timestamp}`, '');
        lines.push('| Key | Value |');
        lines.push('|---|---|');
        for (const [k, v] of Object.entries(entry.details)) {
          lines.push(`| ${k} | \`${JSON.stringify(v)}\` |`);
        }
        if (entry.revertInstructions) {
          lines.push('', `**To revert:** ${entry.revertInstructions}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

export { AuditLogger, AuditEntry, AuditLog, ActionType };
