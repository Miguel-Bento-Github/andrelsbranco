import type { APIRoute } from 'astro';
import { readFile, rename } from 'fs/promises';
import path from 'path';
import { Octokit } from '@octokit/rest';

const isDev = import.meta.env.DEV;
const octokit = new Octokit({
  auth: import.meta.env.GITHUB_TOKEN
});

// Helper to commit files to GitHub in a single commit
async function commitFilesToGitHub(
  files: Array<{ path: string; content: Buffer }>,
  message: string,
  filesToDelete: string[] = []
) {
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

    // Create blobs for new/updated files
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

    // Add delete entries (sha: null means delete)
    const deleteEntries = filesToDelete.map(filePath => ({
      path: filePath,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: null as any  // null sha means delete
    }));

    const tree = [...await Promise.all(blobPromises), ...deleteEntries];

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

    // Remove duplicates from items array
    const uniqueItems = Array.from(new Map(items.map(item => [item.id, item])).values());

    const filesToRename: Array<{ oldPath: string; newPath: string; content: Buffer }> = [];

    // Two-phase rename to avoid conflicts
    if (isDev) {
      const { stat } = await import('fs/promises');

      // Phase 1: Rename all files to temporary names
      const tempRenames = [];
      for (let i = 0; i < uniqueItems.length; i++) {
        const item = uniqueItems[i];
        const oldFilename = item.id;
        const tempFilename = `__temp_${i}_${oldFilename}`;

        const oldFilePath = path.join(process.cwd(), `src/content/${category}/${oldFilename}`);
        const tempFilePath = path.join(process.cwd(), `src/content/${category}/${tempFilename}`);

        // Check if file exists before renaming
        try {
          await stat(oldFilePath);
        } catch (error) {
          console.error(`File not found: ${oldFilePath}`);
          continue; // Skip this file if it doesn't exist
        }

        await rename(oldFilePath, tempFilePath);
        tempRenames.push({ tempFilename, index: i });
      }

      // Phase 2: Rename temp files to final names
      for (const { tempFilename, index } of tempRenames) {
        // Remove the __temp_N_ prefix to get original filename
        const originalFilename = tempFilename.replace(`__temp_${index}_`, '');

        // Extract the part after the first dash from original filename
        const dashIndex = originalFilename.indexOf('-');
        const originalName = dashIndex > 0 ? originalFilename.substring(dashIndex + 1) : originalFilename;

        const orderPrefix = String(index + 1).padStart(4, '0');
        const newFilename = `${orderPrefix}-${originalName}`;

        const tempFilePath = path.join(process.cwd(), `src/content/${category}/${tempFilename}`);
        const newFilePath = path.join(process.cwd(), `src/content/${category}/${newFilename}`);

        await rename(tempFilePath, newFilePath);
      }
    } else {
      // Production: prepare for GitHub commit
      for (let i = 0; i < uniqueItems.length; i++) {
        const item = uniqueItems[i];
        const oldFilename = item.id;
        const dashIndex = oldFilename.indexOf('-');
        const originalName = dashIndex > 0 ? oldFilename.substring(dashIndex + 1) : oldFilename;

        const orderPrefix = String(i + 1).padStart(4, '0');
        const newFilename = `${orderPrefix}-${originalName}`;

        if (oldFilename === newFilename) continue;

        const oldFilePath = path.join(process.cwd(), `src/content/${category}/${oldFilename}`);
        const content = await readFile(oldFilePath, 'utf-8');

        filesToRename.push({
          oldPath: `src/content/${category}/${oldFilename}`,
          newPath: `src/content/${category}/${newFilename}`,
          content: Buffer.from(content)
        });
      }
    }

    // In production, commit all file renames in a single batch commit to GitHub
    if (!isDev && filesToRename.length > 0) {
      try {
        // For GitHub, we need to delete old files and create new ones (rename = delete + create)
        const gitHubFiles = filesToRename.map(({ newPath, content }) => ({
          path: newPath,
          content
        }));

        const oldPaths = filesToRename.map(({ oldPath }) => oldPath);

        await commitFilesToGitHub(gitHubFiles, `Reorder ${uniqueItems.length} items in ${category}`, oldPaths);
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
