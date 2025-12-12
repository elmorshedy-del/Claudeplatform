# Claude Coder 🚀

AI-powered coding assistant with GitHub integration. Built to save you money on Claude API while maintaining the same power as Claude Code.

## Features

### Core Features
- ✅ **Chat with Claude about your code** - Natural language interface
- ✅ **Hybrid file loading** - Smart context loading (follows imports, Claude can request more)
- ✅ **Prompt caching** - 90% off repeated context
- ✅ **Auto-branching** - Safe mode creates branches automatically
- ✅ **Clean diffs** - Uses str_replace, not full file rewrites
- ✅ **Cost tracking** - See exactly what you're spending
- ✅ **One-click merge/discard** - Easy undo

### Optional Features (Toggleable)
- 🔄 Multi-model routing (Haiku/Sonnet/Opus)
- 📝 Conversation compression
- 💰 Token budget limits
- ⚡ Pre-built commands (/fix, /review, etc.)

## Setup

### 1. Clone and Install

```bash
git clone <this-repo>
cd claude-coder
npm install
```

### 2. Get Your API Keys

**Anthropic API Key:**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Add some credits ($10-20 to start)

**GitHub Personal Access Token:**
1. Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new?scopes=repo)
2. Select `repo` scope
3. Generate token

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Deploy to Railway (Optional)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

## How It Works

### Safe Mode (Default)
```
You: "Add discount feature"
        ↓
Tool creates branch: feature/add-discount-xyz
        ↓
Claude makes edits on that branch
        ↓
You test (Railway auto-deploys preview)
        ↓
Works → Click "Merge to Main"
Broken → Click "Discard"
```

### Direct Mode
```
You: "Fix typo in header"
        ↓
Claude pushes directly to main
        ↓
Live immediately
```

## Cost Comparison

| Usage | Claude Pro | This Tool |
|-------|------------|-----------|
| Light (10 sessions/week) | $20/mo | ~$8-15/mo |
| Medium (daily) | $50/mo + overages | ~$20-35/mo |
| Heavy (all day) | $100-200+/mo | ~$40-60/mo |

**Key savings:**
- Prompt caching = 90% off repeated context
- Smart file loading = fewer tokens sent
- No rate limits = no wasted time

## Project Structure

```
claude-coder/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts      # Main chat endpoint
│   │   │   └── github/route.ts    # Branch management
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx               # Main UI
│   ├── components/
│   ├── lib/
│   │   ├── claude.ts              # Claude API with caching
│   │   └── github.ts              # GitHub operations
│   └── types/
│       └── index.ts
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

## Environment Variables (for deployment)

```env
# Optional - can also enter in UI
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
```

## Tips for Best Results

1. **Be specific** - "Fix the checkout bug where discount codes don't apply" > "Fix bug"
2. **Reference files** - "In checkout.ts, update the price calculation" 
3. **Use safe mode** for big changes, direct mode for small fixes
4. **Check the cost tracker** to understand your usage

## Future Improvements

- [ ] Railway auto-recovery (fetch error logs, auto-fix)
- [ ] VS Code extension
- [ ] Multi-repo support
- [ ] File diff preview before commit
- [ ] Undo/redo within branch

## License

MIT
