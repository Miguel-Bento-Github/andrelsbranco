import type { APIRoute } from 'astro';
import { unlink } from 'fs/promises';
import path from 'path';
import { Octokit } from '@octokit/rest';

const isDev = import.meta.env.DEV;
const octokit = new Octokit({
  auth: import.meta.env.GITHUB_TOKEN
});

// Helper to delete file from GitHub
async function deleteFromGitHub(filePath: string, message: string) {
  if (isDev) return; // Skip in development

  const owner = import.meta.env.GITHUB_OWNER;
  const repo = import.meta.env.GITHUB_REPO;
  const branch = import.meta.env.GITHUB_BRANCH || 'main';

  if (!owner || !repo || !import.meta.env.GITHUB_TOKEN) {
    console.warn('GitHub credentials not configured, skipping delete');
    return;
  }

  try {
    // Get file SHA (required for deletion)
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch
    });

    if ('sha' in data) {
      // Delete the file
      await octokit.repos.deleteFile({
        owner,
        repo,
        path: filePath,
        message,
        sha: data.sha,
        branch
      });
    }
  } catch (error) {
    console.error(`Failed to delete ${filePath} from GitHub:`, error);
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
        { path: `src/content/${category}/${id}`, name: 'content file' },
        { path: `public${filePath}`, name: 'media file' }
      ];

      if (thumbnailPath) {
        filesToDelete.push({ path: `public${thumbnailPath}`, name: 'thumbnail' });
      }

      // Delete all files from GitHub
      await Promise.all(
        filesToDelete.map(file =>
          deleteFromGitHub(file.path, `Delete ${file.name} ${id}`)
        )
      );

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
