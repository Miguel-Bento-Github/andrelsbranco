import type { APIRoute } from 'astro';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';

ffmpeg.setFfmpegPath(ffmpegPath.path);

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

    return new Response(JSON.stringify({
      success: true,
      results
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

    // Save file to public/uploads
    const uploadDir = isVideo
      ? path.join(process.cwd(), 'public/uploads/videos')
      : path.join(process.cwd(), 'public/uploads/photos');

    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const buffer = await file.arrayBuffer();
    let imageWidth = 1920;
    let imageHeight = 1080;

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

    if (!isVideo) {
      // Optimize images: convert to WebP with high quality
      const webpFilename = filename.replace(/\.(jpg|jpeg|png)$/i, '.webp');
      const thumbFilename = filename.replace(/\.(jpg|jpeg|png)$/i, '-thumb.webp');

      const filePath = path.join(uploadDir, webpFilename);
      const thumbPath = path.join(uploadDir, thumbFilename);

      const imageBuffer = Buffer.from(buffer);
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      imageWidth = metadata.width || 1920;
      imageHeight = metadata.height || 1080;

      // Generate full-size WebP with quality 95
      await sharp(imageBuffer)
        .webp({ quality: 95 })
        .toFile(filePath);

      // Generate thumbnail (max 800px width) with quality 85 for fast loading
      await sharp(imageBuffer)
        .resize(800, null, { withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(thumbPath);

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
      await writeFile(path.join(contentDir, mdFilename), markdown);

      return {
        success: true,
        file: webpFilename,
        content: mdFilename
      };
    } else {
      // For videos, save as-is
      const filePath = path.join(uploadDir, filename);
      await writeFile(filePath, Buffer.from(buffer));
    }

    // Generate thumbnail for videos
    let thumbnailPath = '';
    let thumbnailWidth = 1920;
    let thumbnailHeight = 1080;

    const thumbnailFilename = `${timestamp}-${safeName.replace(/\.[^/.]+$/, '')}-thumb.jpg`;
    const filePath = path.join(uploadDir, filename);

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

    thumbnailPath = `/uploads/photos/${thumbnailFilename}`;

    // Create markdown content file for video
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
    await writeFile(path.join(contentDir, mdFilename), markdown);

    return {
      success: true,
      file: filename,
      content: mdFilename
    };
}
