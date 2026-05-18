import * as fs from 'fs';
import * as yaml from 'js-yaml';

// A single entry in a rules list. The rule name is whichever key has value `true`;
// description, severity, enabled, and config are metadata keys.
interface RuleEntry {
  description?: string;
  severity?: 'high' | 'medium' | 'low';
  enabled?: boolean;
  config?: Record<string, unknown>;
  [ruleName: string]: unknown;
}

interface RuleCategory {
  enabled: boolean;
  rules: RuleEntry[];
}

interface LanguageConfig {
  enabled?: boolean;
  specific_rules?: RuleEntry[];
}

interface ReviewConfig {
  exclude_paths?: string[];
}

interface Standards {
  review_config?: ReviewConfig;
  security: RuleCategory;
  performance: RuleCategory;
  style: RuleCategory;
  best_practices: RuleCategory;
  languages?: Record<string, LanguageConfig>;
  global?: Record<string, unknown>;
}

// Keys that are rule metadata, not the rule name itself.
const METADATA_KEYS = new Set(['description', 'severity', 'config', 'enabled']);

class StandardsEngine {
  private standards: Standards | null = null;
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  loadStandards(): void {
    try {
      const fileContent = fs.readFileSync(this.configPath, 'utf-8');
      this.standards = yaml.load(fileContent) as Standards;
      console.log('✅ Standards loaded successfully');
    } catch (error) {
      console.error('❌ Error loading standards:', error);
      throw error;
    }
  }

  /**
   * Return paths/globs that should be excluded from code review.
   * Supports exact names (LICENSE), prefix globs (CHANGELOG*), and
   * double-star extension globs (see standards.yaml review_config.exclude_paths).
   */
  getExcludePaths(): string[] {
    return [...(this.standards?.review_config?.exclude_paths ?? [])];
  }

  getStandards(): Standards {
    if (!this.standards) {
      throw new Error('Standards not loaded. Call loadStandards() first.');
    }
    return this.standards;
  }

  getEnabledRulesAsText(): string {
    if (!this.standards) {
      throw new Error('Standards not loaded');
    }

    const lines: string[] = [];

    const appendCategory = (header: string, category: RuleCategory | undefined): void => {
      if (!category?.enabled || !Array.isArray(category.rules)) return;
      lines.push(`## ${header}`);
      lines.push('');
      for (const entry of category.rules) {
        if (!entry.description || !entry.severity) continue;
        lines.push(`- ${StandardsEngine.getRuleName(entry)}`);
        lines.push(`  Description: ${entry.description}`);
        lines.push(`  Severity: ${entry.severity}`);
        lines.push('');
      }
    };

    appendCategory('SECURITY RULES',  this.standards.security);
    appendCategory('PERFORMANCE RULES', this.standards.performance);
    appendCategory('STYLE RULES',      this.standards.style);
    appendCategory('BEST PRACTICES',   this.standards.best_practices);

    if (this.standards.languages) {
      for (const [lang, config] of Object.entries(this.standards.languages)) {
        if (!config.enabled || !Array.isArray(config.specific_rules)) continue;
        lines.push(`## ${lang.toUpperCase()} RULES`);
        lines.push('');
        for (const entry of config.specific_rules) {
          if (!entry.description || !entry.severity) continue;
          lines.push(`- ${StandardsEngine.getRuleName(entry)}`);
          lines.push(`  Description: ${entry.description}`);
          lines.push(`  Severity: ${entry.severity}`);
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  buildPrompt(codeToReview: string, language: string = 'javascript'): string {
    if (!this.standards) {
      throw new Error('Standards not loaded');
    }

    const rulesText = this.getEnabledRulesAsText();

    return `You are an expert code reviewer. Analyze the following ${language} code against these standards:

${rulesText}

Return your analysis as JSON with this exact structure:
{
  "summary": "one sentence summary",
  "issues": [
    {
      "severity": "high|medium|low",
      "type": "security|performance|style|best-practice|custom",
      "location": "filepath:line_number (e.g., src/auth.ts:42 or src/auth.ts:40-45)",
      "message": "what is wrong",
      "suggestion": "how to fix it"
    }
  ],
  "testCases": ["test case 1"],
  "overallQuality": "excellent|good|fair|needs-improvement"
}

Code to review (each line is prefixed with its actual file line number, e.g. "L42+  code" means an added line at file line 42, "L42   code" means unchanged context at line 42, and "     -  code" means a removed line):
${codeToReview}

IMPORTANT:
- Use the "L<n>" prefix to determine the exact line number where the issue occurs.
- The "location" field is REQUIRED for every issue. Always populate it using the format: filepath:line_number (e.g. src/auth.ts:42) or filepath:startLine-endLine (e.g. src/auth.ts:40-45). Never omit it.
- Report the line number of the specific statement that is the problem, not a surrounding bracket or closing line.
- Only include an entry in "issues" if the code requires an actual change. Do NOT add observations, compliments, or notes that require no action — if you have nothing to flag, return an empty array.
- The "suggestion" field must describe a concrete code change. Never write "No change needed", "No action required", or any equivalent no-op phrase.
- Do NOT flag code as missing (imports, declarations, dependencies) unless the absence is visible within the diff itself. Code that exists outside the diff is assumed correct — never infer a missing import from a partial view of a file.
- Do NOT re-flag a concern that the code already explicitly acknowledges. If a comment documents a known tradeoff, limitation, or restriction (e.g. "trusted config only", "rough approximation"), treat it as accepted and do not raise it as an issue.
- Do NOT flag package.json metadata (license, version, author, keywords), copyright notices, or README badge text as code issues. These are editorial choices, not correctness problems.
- Do NOT suggest replacing a working implementation with a third-party library unless the current implementation has a demonstrable correctness bug. Preference for a library over custom code is an opinion, not a finding.

Return ONLY valid JSON, no other text.`;
  }

  countEnabledRules(): number {
    if (!this.standards) {
      throw new Error('Standards not loaded');
    }

    let count = 0;

    for (const category of [
      this.standards.security,
      this.standards.performance,
      this.standards.style,
      this.standards.best_practices,
    ]) {
      if (category?.enabled && Array.isArray(category.rules)) {
        count += category.rules.filter(r => r.description && r.severity).length;
      }
    }

    if (this.standards.languages) {
      for (const config of Object.values(this.standards.languages)) {
        if (config.enabled && Array.isArray(config.specific_rules)) {
          count += config.specific_rules.filter(r => r.description && r.severity).length;
        }
      }
    }

    return count;
  }

  // Extracts the rule name from a rule entry — the key whose value is `true`
  // (i.e., not a metadata key like description, severity, config, or enabled).
  private static getRuleName(entry: RuleEntry): string {
    return Object.keys(entry).find(k => !METADATA_KEYS.has(k)) ?? 'unknown';
  }
}

export { StandardsEngine, Standards, RuleEntry, RuleCategory, LanguageConfig };
