import { NextRequest, NextResponse } from 'next/server';
import { GitHubClient } from '@/lib/github';

// GET - List branches
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = request.headers.get('x-github-token');
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (!token || !owner || !repo) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const github = new GitHubClient(token, owner, repo);
    const branches = await github.listBranches();

    return NextResponse.json({ branches });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// POST - Create branch, create PR, merge, or delete
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, token, owner, repo, ...params } = body;

    if (!token || !owner || !repo) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const github = new GitHubClient(token, owner, repo);

    switch (action) {
      case 'create': {
        const { branchName, fromBranch = 'main' } = params;
        if (!branchName) {
          return NextResponse.json(
            { error: 'Branch name required' },
            { status: 400 }
          );
        }

        // Sanitize branch name
        const safeBranchName = branchName
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        const branch = await github.createBranch(safeBranchName, fromBranch);
        return NextResponse.json({ branch });
      }

      case 'createPR': {
        const { title, body: prBody, head, base = 'main' } = params;
        if (!title || !head) {
          return NextResponse.json(
            { error: 'Title and head branch required' },
            { status: 400 }
          );
        }

        const pr = await github.createPullRequest(title, prBody || '', head, base);
        return NextResponse.json({ pr });
      }

      case 'merge': {
        const { prNumber } = params;
        if (!prNumber) {
          return NextResponse.json(
            { error: 'PR number required' },
            { status: 400 }
          );
        }

        await github.mergePullRequest(prNumber);
        return NextResponse.json({ success: true });
      }

      case 'delete': {
        const { branchName } = params;
        if (!branchName) {
          return NextResponse.json(
            { error: 'Branch name required' },
            { status: 400 }
          );
        }

        await github.deleteBranch(branchName);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
