import sharp from 'sharp';
import { readdir } from 'fs/promises';
import { join } from 'path';

const photosDir = 'public/uploads/photos';

async function regenerateThumbnails() {
  const files = await readdir(photosDir);

  // Find all full-size images (not thumbnails)
  const fullSizeImages = files.filter(f =>
    f.endsWith('.webp') && !f.includes('-thumb.webp')
  );

  console.log(`Found ${fullSizeImages.length} full-size images`);

  let processed = 0;

  for (const filename of fullSizeImages) {
    const fullPath = join(photosDir, filename);
    const thumbFilename = filename.replace('.webp', '-thumb.webp');
    const thumbPath = join(photosDir, thumbFilename);

    try {
      // Generate new 400px thumbnail with quality 100
      await sharp(fullPath)
        .resize(400, null, { withoutEnlargement: true })
        .webp({ quality: 100 })
        .toFile(thumbPath);

      processed++;
      if (processed % 10 === 0) {
        console.log(`Processed ${processed}/${fullSizeImages.length}`);
      }
    } catch (err) {
      console.error(`Error processing ${filename}:`, err.message);
    }
  }

  console.log(`✅ Done! Regenerated ${processed} thumbnails`);
}

regenerateThumbnails();
