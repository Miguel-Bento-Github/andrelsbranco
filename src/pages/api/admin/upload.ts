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
    const file = formData.get('file') as File;
    const category = formData.get('category') as string;
    const featured = formData.get('featured') === 'true';

    if (!file) {
      return new Response('No file provided', { status: 400 });
    }

    const isVideo = file.type.startsWith('video/');

    // Videos can only be uploaded to film category
    if (isVideo && category !== 'film') {
      return new Response('Videos can only be uploaded to the Film category', { status: 400 });
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
    const filePath = path.join(uploadDir, filename);
    await writeFile(filePath, Buffer.from(buffer));

    // Get actual image dimensions for photos
    let imageWidth = 1920;
    let imageHeight = 1080;

    if (!isVideo) {
      const metadata = await sharp(filePath).metadata();
      imageWidth = metadata.width || 1920;
      imageHeight = metadata.height || 1080;
    }

    // Generate thumbnail for videos
    let thumbnailPath = '';
    let thumbnailWidth = 1920;
    let thumbnailHeight = 1080;

    if (isVideo) {
      const thumbnailFilename = `${timestamp}-${safeName.replace(/\.[^/.]+$/, '')}-thumb.jpg`;

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
    }

    // Create markdown content file
    const contentDir = path.join(process.cwd(), `src/content/${category}`);
    if (!existsSync(contentDir)) {
      await mkdir(contentDir, { recursive: true });
    }

    const videoContentPath = `/uploads/videos/${filename}`;
    const photoContentPath = `/uploads/photos/${filename}`;

    const markdown = isVideo
      ? `---
title: "${file.name.replace(/\.[^/.]+$/, '')}"
description: ""
video: "${videoContentPath}"
thumbnail: "${thumbnailPath}"
thumbnailWidth: ${thumbnailWidth}
thumbnailHeight: ${thumbnailHeight}
featured: ${featured}
date: ${new Date().toISOString()}
order: 0
---`
      : `---
title: "${file.name.replace(/\.[^/.]+$/, '')}"
description: ""
image: "${photoContentPath}"
width: ${imageWidth}
height: ${imageHeight}
featured: ${featured}
date: ${new Date().toISOString()}
order: 0
---`;

    const mdFilename = `${timestamp}-${safeName.replace(/\.[^/.]+$/, '')}.md`;
    await writeFile(path.join(contentDir, mdFilename), markdown);

    return new Response(JSON.stringify({
      success: true,
      file: filename,
      content: mdFilename
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
