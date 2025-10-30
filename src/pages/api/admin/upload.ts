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

// Helper to commit file to GitHub
async function commitToGitHub(filePath: string, content: Buffer, message: string) {
  if (isDev) return; // Skip in development

  const owner = import.meta.env.GITHUB_OWNER;
  const repo = import.meta.env.GITHUB_REPO;
  const branch = import.meta.env.GITHUB_BRANCH || 'main';

  if (!owner || !repo || !import.meta.env.GITHUB_TOKEN) {
    console.warn('GitHub credentials not configured, skipping commit');
    return;
  }

  try {
    // Get current file SHA if it exists
    let sha: string | undefined;
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branch
      });
      if ('sha' in data) {
        sha = data.sha;
      }
    } catch (error) {
      // File doesn't exist yet, that's ok
    }

    // Create or update file
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message,
      content: content.toString('base64'),
      branch,
      ...(sha && { sha })
    });
  } catch (error) {
    console.error(`Failed to commit ${filePath}:`, error);
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

    // Process files sequentially with minimal delay to avoid Astro data-store race condition
    const results = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const result = await processFile(files[i], category, featured);
        results.push(result);

        // Minimal delay to let Astro's watcher catch up (reduced from 500ms to 200ms)
        if (i < files.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`Error processing ${files[i].name}:`, error);
        results.push({
          success: false,
          file: files[i].name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Trigger Netlify rebuild if webhook is configured (only in production)
    if (!isDev) {
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

async function processFile(file: File, category: string, featured: boolean) {
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

      // Write locally (for dev) or commit to GitHub (for prod)
      if (isDev) {
        const uploadDir = path.join(process.cwd(), 'public/uploads/photos');
        const contentDir = path.join(process.cwd(), `src/content/${category}`);
        const filePath = path.join(uploadDir, webpFilename);
        const thumbPath = path.join(uploadDir, thumbFilename);

        // Generate full-size WebP with quality 95
        await sharp(imageBuffer)
          .webp({ quality: 95 })
          .toFile(filePath);

        // Generate thumbnail (max 800px width) with quality 85 for fast loading
        await sharp(imageBuffer)
          .resize(800, null, { withoutEnlargement: true })
          .webp({ quality: 85 })
          .toFile(thumbPath);

        await writeFile(path.join(contentDir, mdFilename), markdown);
      } else {
        // Commit to GitHub in production
        const fullImageBuffer = await sharp(imageBuffer).webp({ quality: 95 }).toBuffer();
        const thumbImageBuffer = await sharp(imageBuffer).resize(800, null, { withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();

        await Promise.all([
          commitToGitHub(`public/uploads/photos/${webpFilename}`, fullImageBuffer, `Add ${webpFilename}`),
          commitToGitHub(`public/uploads/photos/${thumbFilename}`, thumbImageBuffer, `Add thumbnail ${thumbFilename}`),
          commitToGitHub(`src/content/${category}/${mdFilename}`, Buffer.from(markdown), `Add ${file.name}`)
        ]);
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

      // Write locally (for dev) or commit to GitHub (for prod)
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
        // Commit to GitHub in production
        // For production, we need to generate thumbnail from buffer in memory
        // This is more complex for videos, so for now we'll use a placeholder approach
        // In a full implementation, you'd want to use a service like AWS Lambda with ffmpeg layers
        const videoBuffer = Buffer.from(buffer);

        // Create a simple placeholder thumbnail (you may want to improve this)
        const placeholderThumb = Buffer.from('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

        await Promise.all([
          commitToGitHub(`public/uploads/videos/${filename}`, videoBuffer, `Add video ${filename}`),
          commitToGitHub(`public/uploads/photos/${thumbnailFilename}`, placeholderThumb, `Add thumbnail ${thumbnailFilename}`),
          commitToGitHub(`src/content/${category}/${mdFilename}`, Buffer.from(markdown), `Add ${file.name}`)
        ]);
      }
    }

    return {
      success: true,
      file: filename,
      content: mdFilename
    };
}
