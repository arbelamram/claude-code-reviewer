interface CodeIssue {
    severity: 'high' | 'medium' | 'low';
    type: 'security' | 'performance' | 'style' | 'best-practice' | 'custom';
    location?: string;
    message: string;
    suggestion: string;
    example?: string;
    standardsReference?: string;
  }
  
  interface AnalysisResult {
    summary: string;
    issues: CodeIssue[];
    testCases?: string[];
    overallQuality: 'excellent' | 'good' | 'fair' | 'needs-improvement';
    positiveAspects?: string[];
    suggestedImprovements?: string[];
  }
  
  class AnalysisFormatter {
    /**
     * Parse JSON response from Claude
     */
    static parseAnalysis(jsonText: string): AnalysisResult {
      try {
        // Try to extract JSON if it's surrounded by other text
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }
  
        const result = JSON.parse(jsonMatch[0]) as AnalysisResult;
        return result;
      } catch (error) {
        console.error('❌ Failed to parse analysis:', error);
        throw new Error(`Invalid JSON response: ${error}`);
      }
    }
  
    /**
     * Format analysis as readable GitHub PR comment
     */
    static formatForPRComment(analysis: AnalysisResult): string {
      let comment = '';
  
      // Header
      comment += '## 🔍 Code Review Analysis\n\n';
  
      // Summary
      comment += `**Summary:** ${analysis.summary}\n\n`;
  
      // Issues section
      if (analysis.issues.length > 0) {
        comment += `### Issues Found (${analysis.issues.length})\n\n`;
  
        // Separate by severity
        const high = analysis.issues.filter(i => i.severity === 'high');
        const medium = analysis.issues.filter(i => i.severity === 'medium');
        const low = analysis.issues.filter(i => i.severity === 'low');
  
        if (high.length > 0) {
          comment += '#### 🔴 High Severity\n';
          high.forEach((issue, idx) => {
            comment += `${idx + 1}. **${issue.type}**: ${issue.message}\n`;
            if (issue.location) comment += `   📍 Location: ${issue.location}\n`;
            comment += `   💡 Fix: ${issue.suggestion}\n`;
            if (issue.example) comment += `   📝 Example: \`${issue.example}\`\n`;
            comment += '\n';
          });
        }
  
        if (medium.length > 0) {
          comment += '#### 🟡 Medium Severity\n';
          medium.forEach((issue, idx) => {
            comment += `${idx + 1}. **${issue.type}**: ${issue.message}\n`;
            comment += `   💡 Suggestion: ${issue.suggestion}\n`;
            comment += '\n';
          });
        }
  
        if (low.length > 0) {
          comment += '#### 🟢 Low Severity\n';
          low.forEach((issue, idx) => {
            comment += `${idx + 1}. **${issue.type}**: ${issue.message}\n`;
          });
          comment += '\n';
        }
      } else {
        comment += '✅ **No issues found!**\n\n';
      }
  
      // Positive aspects
      if (analysis.positiveAspects && analysis.positiveAspects.length > 0) {
        comment += '### ✨ What\'s Good\n';
        analysis.positiveAspects.forEach(aspect => {
          comment += `- ${aspect}\n`;
        });
        comment += '\n';
      }
  
      // Test cases
      if (analysis.testCases && analysis.testCases.length > 0) {
        comment += '### 📋 Suggested Test Cases\n';
        analysis.testCases.forEach(testCase => {
          comment += `- [ ] ${testCase}\n`;
        });
        comment += '\n';
      }
  
      // Overall quality
      const qualityEmoji: Record<string, string> = {
        excellent: '⭐⭐⭐⭐⭐',
        good: '⭐⭐⭐⭐',
        fair: '⭐⭐⭐',
        'needs-improvement': '⭐⭐',
      };
      comment += `### Overall Quality: ${qualityEmoji[analysis.overallQuality]} ${analysis.overallQuality.toUpperCase()}\n`;
  
      return comment;
    }
  
    /**
     * Output analysis as formatted JSON
     */
    static formatAsJSON(analysis: AnalysisResult): string {
      return JSON.stringify(analysis, null, 2);
    }
  
    /**
     * Get summary stats about the analysis
     */
    static getStats(analysis: AnalysisResult): Record<string, number> {
      return {
        totalIssues: analysis.issues.length,
        highSeverity: analysis.issues.filter(i => i.severity === 'high').length,
        mediumSeverity: analysis.issues.filter(i => i.severity === 'medium').length,
        lowSeverity: analysis.issues.filter(i => i.severity === 'low').length,
        suggestedTests: analysis.testCases?.length || 0,
      };
    }
  }
  
  export { AnalysisFormatter, AnalysisResult, CodeIssue };