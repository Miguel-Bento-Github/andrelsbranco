import type { APIRoute } from 'astro';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { Octokit } from '@octokit/rest';

const isDev = import.meta.env.DEV;
const octokit = new Octokit({
  auth: import.meta.env.GITHUB_TOKEN
});

// Helper to commit files to GitHub in a single commit
async function commitFilesToGitHub(files: Array<{ path: string; content: Buffer }>, message: string) {
  if (isDev) return; // Skip in development

  const owner = import.meta.env.GITHUB_OWNER;
  const repo = import.meta.env.GITHUB_REPO;
  const branch = import.meta.env.GITHUB_BRANCH || 'main';

  if (!owner || !repo || !import.meta.env.GITHUB_TOKEN) {
    console.warn('GitHub credentials not configured, skipping commit');
    return;
  }

  try {
    // Get the current commit SHA
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`
    });
    const currentCommitSha = refData.object.sha;

    // Get the tree SHA from the current commit
    const { data: commitData } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: currentCommitSha
    });
    const baseTreeSha = commitData.tree.sha;

    // Create blobs for all files
    const blobPromises = files.map(async (file) => {
      const { data: blobData } = await octokit.git.createBlob({
        owner,
        repo,
        content: file.content.toString('base64'),
        encoding: 'base64'
      });
      return {
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blobData.sha
      };
    });

    const tree = await Promise.all(blobPromises);

    // Create a new tree with all the files
    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree
    });

    // Create a new commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message,
      tree: newTree.sha,
      parents: [currentCommitSha]
    });

    // Update the branch to point to the new commit
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha
    });
  } catch (error) {
    console.error('Failed to commit files to GitHub:', error);
    throw error;
  }
}

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  // Check GitHub session
  const session = cookies.get('github_session')?.value;
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const sessionData = JSON.parse(session);
    if (!sessionData.authenticated) {
      return new Response('Unauthorized', { status: 401 });
    }
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { category, items } = await request.json();

    if (!category || !items || !Array.isArray(items)) {
      return new Response('Invalid request', { status: 400 });
    }

    const filesToCommit: Array<{ path: string; content: Buffer }> = [];

    // Update order field in each markdown file
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const filePath = path.join(process.cwd(), `src/content/${category}/${item.id}`);

      // Read the markdown file
      const content = await readFile(filePath, 'utf-8');

      // Update the order field in frontmatter
      const updatedContent = content.replace(/^order: \d+$/m, `order: ${i + 1}`);

      // Write locally (for dev) or add to batch commit (for prod)
      if (isDev) {
        await writeFile(filePath, updatedContent);
      } else {
        filesToCommit.push({
          path: `src/content/${category}/${item.id}`,
          content: Buffer.from(updatedContent)
        });
      }
    }

    // In production, commit all files in a single batch commit to GitHub
    if (!isDev && filesToCommit.length > 0) {
      try {
        await commitFilesToGitHub(filesToCommit, `Reorder ${items.length} items in ${category}`);
      } catch (error) {
        console.error('Failed to commit files to GitHub:', error);
        return new Response(JSON.stringify({
          error: 'GitHub commit failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Trigger Netlify rebuild if webhook is configured
      const buildHook = import.meta.env.NETLIFY_BUILD_HOOK;
      if (buildHook) {
        try {
          await fetch(buildHook, { method: 'POST' });
        } catch (error) {
          console.error('Failed to trigger rebuild:', error);
          // Don't fail the reorder if rebuild trigger fails
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Reorder error:', error);
    return new Response(JSON.stringify({
      error: 'Reorder failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
