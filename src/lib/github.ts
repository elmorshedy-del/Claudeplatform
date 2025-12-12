import { Octokit } from 'octokit';
import { RepoFile, RepoTree, Branch } from '@/types';

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  // Get the SHA for a branch
  async getBranchSHA(branch: string): Promise<string> {
    const { data } = await this.octokit.rest.repos.getBranch({
      owner: this.owner,
      repo: this.repo,
      branch,
    });
    return data.commit.sha;
  }

  // Get repository file tree
  async getFileTree(branch: string = 'main'): Promise<RepoTree[]> {
    // First get the commit SHA for the branch
    const sha = await this.getBranchSHA(branch);
    
    const { data } = await this.octokit.rest.git.getTree({
      owner: this.owner,
      repo: this.repo,
      tree_sha: sha,
      recursive: 'true',
    });

    return this.buildTree(data.tree);
  }

  private buildTree(flatTree: any[]): RepoTree[] {
    const tree: RepoTree[] = [];
    const pathMap = new Map<string, RepoTree>();

    // Sort by path to ensure parents are processed first
    flatTree.sort((a, b) => a.path.localeCompare(b.path));

    for (const item of flatTree) {
      const node: RepoTree = {
        path: item.path,
        type: item.type === 'tree' ? 'dir' : 'file',
        children: item.type === 'tree' ? [] : undefined,
      };
      pathMap.set(item.path, node);

      const parentPath = item.path.split('/').slice(0, -1).join('/');
      if (parentPath && pathMap.has(parentPath)) {
        pathMap.get(parentPath)!.children!.push(node);
      } else {
        tree.push(node);
      }
    }

    return tree;
  }

  // Get file content
  async getFileContent(path: string, branch: string = 'main'): Promise<RepoFile> {
    const { data } = await this.octokit.rest.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
      ref: branch,
    });

    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`Path ${path} is not a file`);
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { path, content, sha: data.sha };
  }

  // Get multiple files
  async getFiles(paths: string[], branch: string = 'main'): Promise<RepoFile[]> {
    const files = await Promise.all(
      paths.map(path => this.getFileContent(path, branch).catch(() => null))
    );
    return files.filter((f): f is RepoFile => f !== null);
  }

  // Parse imports from a TypeScript/JavaScript file
  parseImports(content: string, currentPath: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(this.resolveImportPath(match[1], currentPath));
    }
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(this.resolveImportPath(match[1], currentPath));
    }

    // Filter out node_modules imports
    return imports.filter(i => i.startsWith('./') || i.startsWith('../') || i.startsWith('/'));
  }

  private resolveImportPath(importPath: string, currentPath: string): string {
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const currentDir = currentPath.split('/').slice(0, -1).join('/');
      const parts = [...currentDir.split('/'), ...importPath.split('/')];
      const resolved: string[] = [];
      
      for (const part of parts) {
        if (part === '..') resolved.pop();
        else if (part !== '.' && part !== '') resolved.push(part);
      }
      
      return resolved.join('/');
    }
    return importPath;
  }

  // Get files with their imports (hybrid loading)
  async getFilesWithImports(
    entryPaths: string[],
    branch: string = 'main',
    maxDepth: number = 2
  ): Promise<RepoFile[]> {
    const loaded = new Set<string>();
    const files: RepoFile[] = [];
    
    const loadFile = async (path: string, depth: number) => {
      // Normalize path and add extensions if needed
      const possiblePaths = [
        path,
        `${path}.ts`,
        `${path}.tsx`,
        `${path}.js`,
        `${path}.jsx`,
        `${path}/index.ts`,
        `${path}/index.tsx`,
        `${path}/index.js`,
      ];

      for (const p of possiblePaths) {
        if (loaded.has(p)) return;
        
        try {
          const file = await this.getFileContent(p, branch);
          loaded.add(p);
          files.push(file);
          
          // Parse and follow imports if not at max depth
          if (depth < maxDepth) {
            const imports = this.parseImports(file.content, p);
            await Promise.all(imports.map(imp => loadFile(imp, depth + 1)));
          }
          return;
        } catch {
          // File doesn't exist with this extension, try next
        }
      }
    };

    await Promise.all(entryPaths.map(p => loadFile(p, 0)));
    return files;
  }

  // Create a new branch
  async createBranch(branchName: string, fromBranch: string = 'main'): Promise<Branch> {
    // Get the SHA of the source branch
    const { data: refData } = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${fromBranch}`,
    });

    // Create the new branch
    await this.octokit.rest.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });

    return {
      name: branchName,
      sha: refData.object.sha,
      isDefault: false,
    };
  }

  // Update or create a file
  async updateFile(
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string
  ): Promise<void> {
    await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
      sha,
    });
  }

  // Apply str_replace edit
  async applyStrReplace(
    path: string,
    oldStr: string,
    newStr: string,
    branch: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const file = await this.getFileContent(path, branch);
      
      if (!file.content.includes(oldStr)) {
        return { 
          success: false, 
          error: `String not found in ${path}. Make sure the string is unique and exact.` 
        };
      }

      const occurrences = file.content.split(oldStr).length - 1;
      if (occurrences > 1) {
        return { 
          success: false, 
          error: `String found ${occurrences} times in ${path}. It must be unique for safe replacement.` 
        };
      }

      const newContent = file.content.replace(oldStr, newStr);
      await this.updateFile(path, newContent, `Edit ${path}`, branch, file.sha);
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Create a pull request
  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string = 'main'
  ): Promise<{ number: number; url: string }> {
    const { data } = await this.octokit.rest.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      head,
      base,
    });

    return { number: data.number, url: data.html_url };
  }

  // Merge a pull request
  async mergePullRequest(prNumber: number): Promise<void> {
    await this.octokit.rest.pulls.merge({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
  }

  // Delete a branch
  async deleteBranch(branch: string): Promise<void> {
    await this.octokit.rest.git.deleteRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branch}`,
    });
  }

  // List branches
  async listBranches(): Promise<Branch[]> {
    const { data } = await this.octokit.rest.repos.listBranches({
      owner: this.owner,
      repo: this.repo,
    });

    const { data: repoData } = await this.octokit.rest.repos.get({
      owner: this.owner,
      repo: this.repo,
    });

    return data.map(b => ({
      name: b.name,
      sha: b.commit.sha,
      isDefault: b.name === repoData.default_branch,
    }));
  }

  // Search files by keyword
  async searchFiles(query: string): Promise<string[]> {
    const { data } = await this.octokit.rest.search.code({
      q: `${query} repo:${this.owner}/${this.repo}`,
      per_page: 20,
    });

    return data.items.map(item => item.path);
  }
}

// Format file tree as string for Claude
export function formatFileTree(tree: RepoTree[], indent: string = ''): string {
  let result = '';
  for (const node of tree) {
    const icon = node.type === 'dir' ? '📁' : '📄';
    result += `${indent}${icon} ${node.path.split('/').pop()}\n`;
    if (node.children) {
      result += formatFileTree(node.children, indent + '  ');
    }
  }
  return result;
}

// Format files for Claude context
export function formatFilesForContext(files: RepoFile[]): string {
  return files.map(f => `
### ${f.path}
\`\`\`${getFileExtension(f.path)}
${f.content}
\`\`\`
`).join('\n');
}

function getFileExtension(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'tsx',
    'js': 'javascript',
    'jsx': 'jsx',
    'py': 'python',
    'json': 'json',
    'css': 'css',
    'html': 'html',
    'md': 'markdown',
  };
  return langMap[ext] || ext;
}
