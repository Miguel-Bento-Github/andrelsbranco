import type { APIRoute } from 'astro';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import { Octokit } from '@octokit/rest';

ffmpeg.setFfmpegPath(ffmpegPath.path);

const isDev = import.meta.env.DEV;
const octokit = new Octokit({
  auth: import.meta.env.GITHUB_TOKEN
});

// Helper to commit multiple files to GitHub in a single commit
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
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const category = formData.get('category') as string;
    const featured = formData.get('featured') === 'true';

    if (!files || files.length === 0) {
      return new Response('No files provided', { status: 400 });
    }

    // Process all files and collect their data
    const results = [];
    const filesToCommit: Array<{ path: string; content: Buffer }> = [];

    for (const file of files) {
      try {
        const result = await processFile(file, category, featured, filesToCommit);
        results.push(result);
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        results.push({
          success: false,
          file: file.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // In production, commit all files in a single batch commit to GitHub
    if (!isDev && filesToCommit.length > 0) {
      try {
        const fileNames = results.filter(r => r.success).map(r => r.file).join(', ');
        await commitFilesToGitHub(filesToCommit, `Add ${files.length} file(s): ${fileNames}`);
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
          // Don't fail the upload if rebuild trigger fails
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      results,
      message: !isDev && import.meta.env.NETLIFY_BUILD_HOOK
        ? 'Upload complete. Site will rebuild in 2-3 minutes.'
        : 'Upload complete.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return new Response(JSON.stringify({
      error: 'Upload failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

async function processFile(file: File, category: string, featured: boolean, filesToCommit?: Array<{ path: string; content: Buffer }>) {
    if (!file) {
      throw new Error('No file provided');
    }

    const isVideo = file.type.startsWith('video/');

    // Videos can only be uploaded to film category
    if (isVideo && category !== 'film') {
      throw new Error('Videos can only be uploaded to the Film category');
    }
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-z0-9.-]/gi, '_');
    const filename = `${timestamp}-${safeName}`;

    const buffer = await file.arrayBuffer();
    let imageWidth = 1920;
    let imageHeight = 1080;

    // Only create directories in development mode
    if (isDev) {
      // Save file to public/uploads
      const uploadDir = isVideo
        ? path.join(process.cwd(), 'public/uploads/videos')
        : path.join(process.cwd(), 'public/uploads/photos');

      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }

      // Create markdown content file directory
      const contentDir = path.join(process.cwd(), `src/content/${category}`);
      if (!existsSync(contentDir)) {
        await mkdir(contentDir, { recursive: true });
      }

      // Ensure .astro directory exists for data-store
      const astroDir = path.join(process.cwd(), '.astro');
      if (!existsSync(astroDir)) {
        await mkdir(astroDir, { recursive: true });
      }
    }

    if (!isVideo) {
      // Optimize images: convert to WebP with high quality
      const webpFilename = filename.replace(/\.(jpg|jpeg|png)$/i, '.webp');
      const thumbFilename = filename.replace(/\.(jpg|jpeg|png)$/i, '-thumb.webp');

      const imageBuffer = Buffer.from(buffer);
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      imageWidth = metadata.width || 1920;
      imageHeight = metadata.height || 1080;

      const photoContentPath = `/uploads/photos/${webpFilename}`;
      const thumbContentPath = `/uploads/photos/${thumbFilename}`;

      const markdown = `---
title: "${file.name.replace(/\.[^/.]+$/, '')}"
description: ""
image: "${photoContentPath}"
thumbnail: "${thumbContentPath}"
width: ${imageWidth}
height: ${imageHeight}
featured: ${featured}
date: ${new Date().toISOString()}
order: 0
---`;

      const mdFilename = `${timestamp}-${safeName.replace(/\.[^/.]+$/, '')}.md`;

      // Write locally (for dev) or add to batch commit (for prod)
      if (isDev) {
        const uploadDir = path.join(process.cwd(), 'public/uploads/photos');
        const contentDir = path.join(process.cwd(), `src/content/${category}`);
        const filePath = path.join(uploadDir, webpFilename);
        const thumbPath = path.join(uploadDir, thumbFilename);

        // Generate full-size WebP with quality 100
        await sharp(imageBuffer)
          .webp({ quality: 100 })
          .toFile(filePath);

        // Generate thumbnail (max 400px width) with quality 90 for fast loading
        await sharp(imageBuffer)
          .resize(400, null, { withoutEnlargement: true })
          .webp({ quality: 90 })
          .toFile(thumbPath);

        await writeFile(path.join(contentDir, mdFilename), markdown);
      } else {
        // Add files to batch commit for production
        const fullImageBuffer = await sharp(imageBuffer).webp({ quality: 100 }).toBuffer();
        const thumbImageBuffer = await sharp(imageBuffer).resize(400, null, { withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();

        if (filesToCommit) {
          filesToCommit.push(
            { path: `public/uploads/photos/${webpFilename}`, content: fullImageBuffer },
            { path: `public/uploads/photos/${thumbFilename}`, content: thumbImageBuffer },
            { path: `src/content/${category}/${mdFilename}`, content: Buffer.from(markdown) }
          );
        }
      }

      return {
        success: true,
        file: webpFilename,
        content: mdFilename
      };
    } else {
      // For videos
      let thumbnailWidth = 1920;
      let thumbnailHeight = 1080;

      const thumbnailFilename = `${timestamp}-${safeName.replace(/\.[^/.]+$/, '')}-thumb.jpg`;
      const thumbnailPath = `/uploads/photos/${thumbnailFilename}`;
      const videoContentPath = `/uploads/videos/${filename}`;

      const markdown = `---
title: "${file.name.replace(/\.[^/.]+$/, '')}"
description: ""
video: "${videoContentPath}"
thumbnail: "${thumbnailPath}"
thumbnailWidth: ${thumbnailWidth}
thumbnailHeight: ${thumbnailHeight}
featured: ${featured}
date: ${new Date().toISOString()}
order: 0
---`;

      const mdFilename = `${timestamp}-${safeName.replace(/\.[^/.]+$/, '')}.md`;

      // Write locally (for dev) or add to batch commit (for prod)
      if (isDev) {
        const uploadDir = path.join(process.cwd(), 'public/uploads/videos');
        const contentDir = path.join(process.cwd(), `src/content/${category}`);
        const filePath = path.join(uploadDir, filename);

        // Save video file
        await writeFile(filePath, Buffer.from(buffer));

        // Generate thumbnail for videos
        await new Promise<void>((resolve, reject) => {
          ffmpeg(filePath)
            .screenshots({
              timestamps: ['00:00:01'],
              filename: thumbnailFilename,
              folder: path.join(process.cwd(), 'public/uploads/photos'),
              size: '1920x1080'
            })
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
        });

        await writeFile(path.join(contentDir, mdFilename), markdown);
      } else {
        // Add files to batch commit for production
        const videoBuffer = Buffer.from(buffer);

        // Create a simple placeholder thumbnail (you may want to improve this)
        const placeholderThumb = Buffer.from('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

        if (filesToCommit) {
          filesToCommit.push(
            { path: `public/uploads/videos/${filename}`, content: videoBuffer },
            { path: `public/uploads/photos/${thumbnailFilename}`, content: placeholderThumb },
            { path: `src/content/${category}/${mdFilename}`, content: Buffer.from(markdown) }
          );
        }
      }
    }

    return {
      success: true,
      file: filename,
      content: mdFilename
    };
}
