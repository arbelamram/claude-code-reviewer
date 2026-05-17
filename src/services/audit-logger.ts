import * as fs from 'fs';
import * as path from 'path';

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

const MAX_DETAIL_VALUE_LENGTH = 500;

class AuditLogger {
  private readonly entries: AuditEntry[] = [];
  private readonly log: AuditLog;
  private readonly auditLogPath: string | undefined;
  private readonly stepSummaryPath: string | undefined;

  constructor(
    repository: string,
    prNumber: number,
    auditLogPath: string | undefined  = process.env.AUDIT_LOG_PATH,
    stepSummaryPath: string | undefined = process.env.GITHUB_STEP_SUMMARY
  ) {
    this.auditLogPath    = auditLogPath;
    this.stepSummaryPath = stepSummaryPath;
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

  // Rejects paths with traversal components (e.g. /tmp/../etc/passwd).
  // path.resolve normalises the path; if the result differs, it contained "..".
  private isSafePath(p: string): boolean {
    return path.isAbsolute(p) && path.resolve(p) === p;
  }

  // Escapes characters that would break a markdown table cell or inject HTML.
  private sanitizeMd(value: string): string {
    return value
      .replace(/[\r\n]/g, ' ')
      .replace(/\|/g, '\\|')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Writes the audit JSON to the path in AUDIT_LOG_PATH (if set).
  // The workflow uploads this file as a GitHub Actions artifact so Claude
  // can retrieve it later via: gh run download <runId> -n code-reviewer-audit
  async flush(): Promise<void> {
    const dest = this.auditLogPath;
    if (!dest || !this.isSafePath(dest)) return;
    try {
      await fs.promises.writeFile(dest, JSON.stringify(this.log, null, 2), 'utf8');
    } catch (err) {
      console.warn('Audit log flush failed:', err);
    }
  }

  // Appends the markdown audit summary to $GITHUB_STEP_SUMMARY (if set).
  // The summary is visible in the Actions UI under the workflow run.
  async flushStepSummary(): Promise<void> {
    const dest = this.stepSummaryPath;
    if (!dest || !this.isSafePath(dest)) return;
    try {
      await fs.promises.appendFile(dest, '\n\n' + this.toMarkdown(), 'utf8');
    } catch (err) {
      console.warn('Step summary flush failed:', err);
    }
  }

  toMarkdown(): string {
    const { skillName, runId, startedAt, repository, prNumber, entries } = this.log;
    const s = this.sanitizeMd.bind(this);

    const lines = [
      `## 🗒️ ${skillName} — Audit Log`,
      '',
      `| Field | Value |`,
      `|---|---|`,
      `| Repository | \`${s(repository)}\` |`,
      `| PR | #${prNumber} |`,
      `| Run ID | \`${s(runId)}\` |`,
      `| Started | ${s(startedAt)} |`,
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
        lines.push(`#### ${icon} \`${entry.type}\` — ${s(entry.timestamp)}`, '');
        lines.push('| Key | Value |');
        lines.push('|---|---|');
        for (const [k, v] of Object.entries(entry.details)) {
          const raw = JSON.stringify(v);
          const truncated = raw.length > MAX_DETAIL_VALUE_LENGTH
            ? raw.slice(0, MAX_DETAIL_VALUE_LENGTH) + '…'
            : raw;
          lines.push(`| ${s(k)} | \`${s(truncated)}\` |`);
        }
        if (entry.revertInstructions) {
          lines.push('', `**To revert:** ${s(entry.revertInstructions)}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

export { AuditLogger, AuditEntry, AuditLog, ActionType };
