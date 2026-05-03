# Claude Code Reviewer Skill

An AI-powered code review skill that automatically analyzes GitHub pull requests using Claude and configurable coding standards.

**Status:** ✅ Production-Ready MVP  
**Latest Version:** 1.0.0  
**License:** ISC

---

## 🚀 Features

- ✅ **Automatic PR Reviews** — Triggered on every pull request
- ✅ **Configurable Standards** — Define your team's coding standards in YAML
- ✅ **Intelligent Analysis** — Uses Claude API to understand code intent
- ✅ **GitHub Integration** — Posts formatted feedback directly as PR comments
- ✅ **Reusable Skill** — Can be deployed to any GitHub project
- ✅ **Low Maintenance** — Rules in YAML, Claude improves automatically
- ✅ **21 Built-in Rules** — Security, performance, style, and best practices

---

## 📋 What It Reviews

### Security (6 rules)
- SQL injection vulnerabilities
- Hardcoded secrets and API keys
- Unsafe deserialization
- Authentication/authorization gaps
- XSS vulnerabilities
- Input validation

### Performance (5 rules)
- N+1 database query patterns
- Inefficient algorithms (O(n²) loops)
- Missing caching opportunities
- Memory leaks
- Unnecessary operations

### Code Style (5 rules)
- Naming conventions
- Function length limits
- Error handling
- Code duplication
- Documentation quality

### Best Practices (4 rules)
- Modern language idioms
- Design patterns
- Testability
- Console logs in production

---

## 🛠️ Installation

### Prerequisites
- Node.js 18+ 
- GitHub account
- Claude API account with credits

### 1. Clone Repository

```bash
git clone https://github.com/arbelamram/claude-code-reviewer.git
cd claude-code-reviewer
npm install
```

### 2. Get API Credentials

**GitHub Token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` and `read:user`
4. Copy the token

**Claude API Key:**
1. Go to https://console.anthropic.com/account/keys
2. Click "Create Key"
3. Copy the key (starts with `sk-ant-`)
4. Add credits to your Anthropic account (https://console.anthropic.com/account/billing/overview)

### 3. Configure Environment

Create `.env` file in project root:

```bash
GITHUB_TOKEN=your_github_token_here
GITHUB_OWNER=your_github_username
GITHUB_REPO=your_repository_name
CLAUDE_API_KEY=your_claude_api_key_here
```

**Never commit `.env` to Git** — it contains secrets.

### 4. Deploy GitHub Actions Workflow

The workflow file is already created at `.github/workflows/code-review.yml`.

**Add secrets to GitHub:**
1. Go to your repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add:
   - `GITHUB_TOKEN` (your GitHub PAT)
   - `CLAUDE_API_KEY` (your Claude API key)

**Activate workflow:**
- GitHub Actions are enabled by default
- Workflow triggers on every PR

---

## 📖 Usage

### Automatic (Recommended)
When you create a pull request, the skill automatically reviews it and posts feedback as a comment.

### Manual CLI
```bash
npm run build
GITHUB_OWNER=your_user GITHUB_REPO=your_repo PR_NUMBER=1 npm run review
```

### Customize Standards
Edit `config/standards.yaml` to:
- Enable/disable rules
- Add custom rules
- Adjust severity levels
- Configure language-specific rules

Example:
```yaml
security:
  enabled: true
  rules:
    check_sql_injection: true
    check_hardcoded_secrets: true

performance:
  enabled: true
  rules:
    check_n_plus_one_queries: true
```

---

## 📁 Project Structure

code-reviewer/
├── .github/workflows/code-review.yml    # GitHub Actions automation
├── config/
│   ├── standards.yaml                   # Coding standards (21 rules)
│   ├── analysis-schema.json             # Output format spec
│   └── skill-definition.md              # Claude skill instructions
├── src/
│   ├── github/
│   │   ├── github-config.ts             # Configuration manager
│   │   └── github-service.ts            # GitHub API wrapper
│   ├── tests/                           # Test files
│   ├── analysis-formatter.ts            # Output formatting
│   ├── claude-service.ts                # Claude API client
│   ├── cli.ts                           # Command-line interface
│   ├── orchestrator.ts                  # Main workflow
│   └── standards-engine.ts              # Rules engine
├── dist/                                # Compiled JavaScript (gitignored)
├── .env.example                         # Environment template
├── package.json                         # Dependencies
├── tsconfig.json                        # TypeScript config
├── PROGRESS.md                          # Development progress
└── README.md                            # This file

---

## 🔄 How It Works

GitHub PR Created
↓
GitHub Actions Workflow Triggers
↓
Load Coding Standards (21 rules)
↓
Fetch PR Information & Code Diffs
↓
Build Analysis Prompt with Standards
↓
Send to Claude API
↓
Claude Analyzes Code
↓
Parse Claude's JSON Response
↓
Format as GitHub PR Comment
↓
Post Comment to PR
↓
Developer Reviews Feedback

---

## 📊 Example Feedback

When the skill reviews a PR, it posts formatted feedback like:

🔍 Code Review Analysis
Summary: Code has a critical SQL injection vulnerability
Issues Found (1)
🔴 High Severity

security: SQL injection vulnerability: user input concatenated directly into query
📍 Location: Line 2
💡 Fix: Use parameterized queries: db.query("SELECT * FROM users WHERE id = ?", [userId])
📝 Example: db.query("SELECT * FROM users WHERE id = ?", [userId])

✨ What's Good

Function has clear purpose

📋 Suggested Test Cases

 Empty userId
 Special characters in userId
 SQL injection attempt

Overall Quality: ⭐⭐ NEEDS-IMPROVEMENT

---

## 🧪 Testing

Run all tests:

```bash
npm run build
npx ts-node src/tests/test-claude-service.ts
npx ts-node src/tests/test-github-service.ts
npx ts-node src/tests/test-orchestrator-full.ts
```

---

## 🔧 Development

### Build
```bash
npm run build           # Compile TypeScript to dist/
```

### Run
```bash
npm run start           # Run main entry point
npm run dev            # Run with ts-node (development)
npm run cli            # Run CLI
npm run review         # Alias for cli
```

### Add Dependencies
```bash
npm install package-name
npm install --save-dev @types/package-name
```

---

## 📚 Using This Skill on Other Projects

### Option 1: GitHub Actions Workflow
Copy `.github/workflows/code-review.yml` to your project, add secrets, and you're done!

### Option 2: As a Reusable Skill
1. Clone this repo
2. Update `standards.yaml` for your project
3. Deploy GitHub Actions
4. Create a PR to test

### Customize for Your Team
Edit `config/standards.yaml`:

```yaml
# Your custom standards
security:
  enabled: true
  rules:
    # Add/remove rules as needed

performance:
  enabled: true
  # Adjust for your performance requirements

style:
  enabled: true
  # Your team's coding style
```

---

## 🐛 Troubleshooting

### "GitHub token is invalid"
- Verify token at https://github.com/settings/tokens
- Check token has `repo` and `read:user` scopes
- Token may have expired

### "Claude API error: 400 - credit balance too low"
- Add credits at https://console.anthropic.com/account/billing/overview
- Wait 1-2 minutes for credits to process
- Retry

### "PR not found (404)"
- Ensure PR number is correct
- Workflow runs on PR creation, not on manual trigger with wrong PR

### "Cannot find standards.yaml"
- Ensure `config/standards.yaml` exists
- Check path in `orchestrator.ts`

---

## 🚀 Future Enhancements

- [ ] Docker containerization
- [ ] Custom agent types
- [ ] Multi-language support expansion
- [ ] Dashboard for review history
- [ ] Slack/Email notifications
- [ ] Performance metrics and trends
- [ ] Team settings and preferences

---

## 📝 Contributing

This is a personal project, but feel free to fork and customize for your needs!

---

## 📄 License

ISC License - See LICENSE file for details

---

## 💡 Architecture

### Core Components

**StandardsEngine** — Loads and manages coding standards  
**ClaudeService** — Interfaces with Claude API  
**GitHubService** — Interfaces with GitHub API  
**AnalysisFormatter** — Converts Claude output to PR comments  
**CodeReviewOrchestrator** — Orchestrates the full workflow  

### Data Flow

1. Standards YAML → StandardsEngine (parsed rules)
2. GitHub PR → GitHubService (code diffs)
3. Rules + Code → Claude API (analysis prompt)
4. Claude Response → AnalysisFormatter (GitHub comment)
5. Formatted Comment → GitHub (posted to PR)

---

## 🎯 Success Metrics

- ✅ Automatically reviews every PR
- ✅ Identifies real code issues
- ✅ Provides actionable feedback
- ✅ Developers follow suggestions
- ✅ Code quality improves over time
- ✅ Zero manual intervention needed

---

## 📞 Support

For issues or questions:
1. Check `PROGRESS.md` for development status
2. Review `.env.example` for configuration
3. Check test files for usage examples
4. Refer to inline code comments

---

## 🎓 Learning Resources

This project demonstrates:
- Claude API integration
- GitHub API integration (Octokit)
- TypeScript with ES modules
- GitHub Actions automation
- YAML configuration management
- CLI development
- Architecture patterns (separation of concerns)

---

## 📈 Project Status

**Week 1:** Complete ✅
- Environment setup
- Core components
- API integrations
- GitHub Actions workflow
- Full end-to-end testing

**Ready for:** 
- Immediate deployment
- Production use
- Team adoption
- Reuse on other projects

---

## 🙏 Acknowledgments

Built with:
- [Claude API](https://anthropic.com) — AI analysis engine
- [Octokit](https://github.com/octokit) — GitHub API client
- [TypeScript](https://www.typescriptlang.org/) — Type-safe JavaScript

---

**Last Updated:** April 30, 2026  
**Version:** 1.0.0 (MVP)

