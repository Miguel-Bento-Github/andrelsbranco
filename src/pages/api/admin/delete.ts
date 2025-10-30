import type { APIRoute } from 'astro';
import { unlink } from 'fs/promises';
import path from 'path';
import { Octokit } from '@octokit/rest';

const isDev = import.meta.env.DEV;
const octokit = new Octokit({
  auth: import.meta.env.GITHUB_TOKEN
});

// Helper to delete multiple files from GitHub in a single commit
async function deleteFilesFromGitHub(filePaths: string[], message: string) {
  if (isDev) return; // Skip in development

  const owner = import.meta.env.GITHUB_OWNER;
  const repo = import.meta.env.GITHUB_REPO;
  const branch = import.meta.env.GITHUB_BRANCH || 'main';

  if (!owner || !repo || !import.meta.env.GITHUB_TOKEN) {
    console.warn('GitHub credentials not configured, skipping delete');
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

    // Get the current tree SHA
    const { data: commitData } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: currentCommitSha
    });
    const baseTreeSha = commitData.tree.sha;

    // Create tree entries with null sha to delete files
    const tree = filePaths.map(filePath => ({
      path: filePath,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: null as any // null sha means delete the file
    }));

    // Create a new tree with the deletions
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
    console.error('Failed to delete files from GitHub:', error);
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
    const { id, category, filePath, thumbnailPath } = await request.json();

    if (!id || !category || !filePath) {
      return new Response('Missing required fields', { status: 400 });
    }

    if (isDev) {
      // Development: Delete from local filesystem
      // Delete the markdown content file
      // id already includes .md extension from Astro collections
      const contentPath = path.join(process.cwd(), `src/content/${category}/${id}`);
      await unlink(contentPath);

      // Delete the actual file (photo/video)
      const actualFilePath = path.join(process.cwd(), `public${filePath}`);
      await unlink(actualFilePath);

      // Delete thumbnail if provided
      if (thumbnailPath) {
        const thumbFilePath = path.join(process.cwd(), `public${thumbnailPath}`);
        try {
          await unlink(thumbFilePath);
        } catch (error) {
          console.warn('Failed to delete thumbnail:', error);
        }
      }
    } else {
      // Production: Delete from GitHub
      const filesToDelete = [
        `src/content/${category}/${id}`,
        `public${filePath}`
      ];

      if (thumbnailPath) {
        filesToDelete.push(`public${thumbnailPath}`);
      }

      // Delete all files from GitHub in a single commit
      await deleteFilesFromGitHub(filesToDelete, `Delete ${id} and associated files`);

      // Trigger Netlify rebuild if webhook is configured
      const buildHook = import.meta.env.NETLIFY_BUILD_HOOK;
      if (buildHook) {
        try {
          await fetch(buildHook, { method: 'POST' });
        } catch (error) {
          console.error('Failed to trigger rebuild:', error);
          // Don't fail the delete if rebuild trigger fails
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Delete error:', error);
    return new Response(JSON.stringify({
      error: 'Delete failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
