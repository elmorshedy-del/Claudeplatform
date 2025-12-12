import { NextRequest, NextResponse } from 'next/server';
import { ClaudeClient, CODING_SYSTEM_PROMPT, generateCodeContext, parseFileChanges } from '@/lib/claude';
import { GitHubClient, formatFileTree, formatFilesForContext } from '@/lib/github';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      message,
      conversationHistory = [],
      settings,
      session,
    } = body;

    // Validate required fields
    if (!session?.anthropicKey) {
      return NextResponse.json({ error: 'Anthropic API key required' }, { status: 400 });
    }
    if (!session?.githubToken) {
      return NextResponse.json({ error: 'GitHub token required' }, { status: 400 });
    }
    if (!session?.repo) {
      return NextResponse.json({ error: 'Repository not selected' }, { status: 400 });
    }

    // Initialize clients
    const claude = new ClaudeClient(session.anthropicKey);
    const github = new GitHubClient(
      session.githubToken,
      session.repo.owner,
      session.repo.name
    );

    const branch = session.currentBranch || session.repo.defaultBranch;

    // Get file tree
    const fileTree = await github.getFileTree(branch);
    const fileTreeStr = formatFileTree(fileTree);

    // Smart file loading: find relevant files based on the message
    const relevantPaths = await findRelevantFiles(message, github);
    
    // Load files with their imports (hybrid approach)
    const files = await github.getFilesWithImports(relevantPaths, branch, 2);
    
    // Generate context
    const codeContext = generateCodeContext(fileTreeStr, files);

    // Build messages
    const messages = [
      ...conversationHistory,
      { role: 'user' as const, content: message },
    ];

    // Call Claude
    const response = await claude.chat(
      messages,
      CODING_SYSTEM_PROMPT,
      codeContext
    );

    // Handle tool calls if any
    let toolResults: any[] = [];
    let filesChanged: any[] = [];

    if (response.toolCalls) {
      for (const call of response.toolCalls) {
        const result = await executeToolCall(call, github, branch);
        toolResults.push(result);
        
        if (call.name === 'str_replace' || call.name === 'create_file') {
          filesChanged.push({
            path: call.input.path,
            action: call.name === 'create_file' ? 'create' : 'edit',
          });
        }
      }

      // If there were tool calls, make a follow-up call to get Claude's summary
      if (toolResults.length > 0) {
        const toolResultsMessage = toolResults.map((r, i) => 
          `Tool ${response.toolCalls![i].name}: ${r.success ? 'Success' : 'Failed - ' + r.error}`
        ).join('\n');

        const followUp = await claude.chat(
          [
            ...messages,
            { role: 'assistant' as const, content: response.content },
            { role: 'user' as const, content: `Tool results:\n${toolResultsMessage}\n\nPlease summarize what was done.` },
          ],
          CODING_SYSTEM_PROMPT,
          codeContext
        );

        return NextResponse.json({
          content: followUp.content,
          filesChanged,
          cost: response.cost + followUp.cost,
          tokensUsed: {
            input: (response.usage.input_tokens || 0) + (followUp.usage.input_tokens || 0),
            output: (response.usage.output_tokens || 0) + (followUp.usage.output_tokens || 0),
            cacheRead: (response.usage.cache_read_input_tokens || 0) + (followUp.usage.cache_read_input_tokens || 0),
            cacheWrite: (response.usage.cache_creation_input_tokens || 0) + (followUp.usage.cache_creation_input_tokens || 0),
          },
          costTracker: claude.getCostTracker(),
        });
      }
    }

    return NextResponse.json({
      content: response.content,
      filesChanged,
      cost: response.cost,
      tokensUsed: {
        input: response.usage.input_tokens || 0,
        output: response.usage.output_tokens || 0,
        cacheRead: response.usage.cache_read_input_tokens || 0,
        cacheWrite: response.usage.cache_creation_input_tokens || 0,
      },
      costTracker: claude.getCostTracker(),
    });

  } catch (error: any) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    );
  }
}

// Find relevant files based on the message
async function findRelevantFiles(message: string, github: GitHubClient): Promise<string[]> {
  const keywords = extractKeywords(message);
  
  if (keywords.length === 0) {
    return [];
  }

  // Search for files matching keywords
  const searchResults = await Promise.all(
    keywords.map(k => github.searchFiles(k).catch(() => []))
  );

  // Flatten and dedupe
  const allPaths = [...new Set(searchResults.flat())];
  
  // Limit to most relevant (first 5)
  return allPaths.slice(0, 5);
}

// Extract keywords from message
function extractKeywords(message: string): string[] {
  // Common code-related terms to look for
  const codeTerms = message.match(/\b(component|function|api|route|service|util|hook|type|interface|class|module|page|layout)\b/gi) || [];
  
  // File names or paths mentioned
  const fileRefs = message.match(/[\w-]+\.(ts|tsx|js|jsx|css|json|py)/gi) || [];
  
  // CamelCase or PascalCase words (likely component/function names)
  const camelCase = message.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) || [];
  
  // Combine and dedupe
  return [...new Set([...codeTerms, ...fileRefs, ...camelCase])].slice(0, 3);
}

// Execute a tool call
async function executeToolCall(
  call: any,
  github: GitHubClient,
  branch: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    switch (call.name) {
      case 'read_file': {
        const file = await github.getFileContent(call.input.path, branch);
        return { success: true, result: file.content };
      }
      
      case 'str_replace': {
        const result = await github.applyStrReplace(
          call.input.path,
          call.input.old_str,
          call.input.new_str,
          branch
        );
        return result;
      }
      
      case 'create_file': {
        await github.updateFile(
          call.input.path,
          call.input.content,
          `Create ${call.input.path}`,
          branch
        );
        return { success: true };
      }
      
      case 'search_files': {
        const paths = await github.searchFiles(call.input.query);
        return { success: true, result: paths };
      }
      
      default:
        return { success: false, error: `Unknown tool: ${call.name}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
