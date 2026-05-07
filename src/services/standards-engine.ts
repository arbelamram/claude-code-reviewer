import * as fs from 'fs';
import * as yaml from 'js-yaml';

interface Rule {
  description: string;
  severity: 'high' | 'medium' | 'low';
  enabled?: boolean;
  config?: Record<string, unknown>;
}

interface RuleCategory {
  enabled: boolean;
  rules: Record<string, Rule | boolean>;
}

interface Standards {
  security: RuleCategory;
  performance: RuleCategory;
  style: RuleCategory;
  best_practices: RuleCategory;
  languages?: Record<string, unknown>;
  global?: Record<string, unknown>;
}

class StandardsEngine {
  private standards: Standards | null = null;
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  /**
   * Load standards from YAML file
   */
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
   * Get currently loaded standards
   */
  getStandards(): Standards {
    if (!this.standards) {
      throw new Error('Standards not loaded. Call loadStandards() first.');
    }
    return this.standards;
  }

  /**
   * Get all enabled rules formatted as text
   */
  getEnabledRulesAsText(): string {
    if (!this.standards) {
      throw new Error('Standards not loaded');
    }

    const lines: string[] = [];

    // Security rules
    if (this.standards.security?.enabled) {
      lines.push('## SECURITY RULES');
      lines.push('');
      const rules = this.standards.security.rules;
      for (const [ruleName, ruleData] of Object.entries(rules)) {
        if (typeof ruleData === 'object' && ruleData !== null) {
          const rule = ruleData as Rule;
          lines.push(`- ${ruleName}`);
          lines.push(`  Description: ${rule.description}`);
          lines.push(`  Severity: ${rule.severity}`);
          lines.push('');
        }
      }
    }

    // Performance rules
    if (this.standards.performance?.enabled) {
      lines.push('## PERFORMANCE RULES');
      lines.push('');
      const rules = this.standards.performance.rules;
      for (const [ruleName, ruleData] of Object.entries(rules)) {
        if (typeof ruleData === 'object' && ruleData !== null) {
          const rule = ruleData as Rule;
          lines.push(`- ${ruleName}`);
          lines.push(`  Description: ${rule.description}`);
          lines.push(`  Severity: ${rule.severity}`);
          lines.push('');
        }
      }
    }

    // Style rules
    if (this.standards.style?.enabled) {
      lines.push('## STYLE RULES');
      lines.push('');
      const rules = this.standards.style.rules;
      for (const [ruleName, ruleData] of Object.entries(rules)) {
        if (typeof ruleData === 'object' && ruleData !== null) {
          const rule = ruleData as Rule;
          lines.push(`- ${ruleName}`);
          lines.push(`  Description: ${rule.description}`);
          lines.push(`  Severity: ${rule.severity}`);
          lines.push('');
        }
      }
    }

    // Best practices
    if (this.standards.best_practices?.enabled) {
      lines.push('## BEST PRACTICES');
      lines.push('');
      const rules = this.standards.best_practices.rules;
      for (const [ruleName, ruleData] of Object.entries(rules)) {
        if (typeof ruleData === 'object' && ruleData !== null) {
          const rule = ruleData as Rule;
          lines.push(`- ${ruleName}`);
          lines.push(`  Description: ${rule.description}`);
          lines.push(`  Severity: ${rule.severity}`);
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Build the prompt for Claude
   */
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
      "location": "line number or function name",
      "message": "what is wrong",
      "suggestion": "how to fix it"
    }
  ],
  "testCases": ["test case 1"],
  "overallQuality": "excellent|good|fair|needs-improvement"
}

Code to review:
\`\`\`${language}
${codeToReview}
\`\`\`

Return ONLY valid JSON, no other text.`;
  }

  /**
   * Count total number of enabled rules
   */
  countEnabledRules(): number {
    if (!this.standards) {
      throw new Error('Standards not loaded');
    }

    let count = 0;

    const categories = [
      this.standards.security,
      this.standards.performance,
      this.standards.style,
      this.standards.best_practices,
    ];

    for (const category of categories) {
      if (category?.enabled) {
        for (const rule of Object.values(category.rules)) {
          if (typeof rule === 'object' && rule !== null) {
            const r = rule as Rule;
            if (r.enabled !== false) {
              count++;
            }
          }
        }
      }
    }

    return count;
  }
}

export { StandardsEngine, Standards, Rule, RuleCategory };