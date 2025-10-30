import sharp from 'sharp';
import { readdir } from 'fs/promises';
import { join } from 'path';

const photosDir = 'public/uploads/photos';

async function generateDisplayVersions() {
  const files = await readdir(photosDir);

  // Find all full-size images (not thumbnails or display versions)
  const fullSizeImages = files.filter(f =>
    f.endsWith('.webp') && !f.includes('-thumb.webp') && !f.includes('-display.webp')
  );

  console.log(`Found ${fullSizeImages.length} full-size images`);

  let processed = 0;

  for (const filename of fullSizeImages) {
    const fullPath = join(photosDir, filename);
    const displayFilename = filename.replace('.webp', '-display.webp');
    const displayPath = join(photosDir, displayFilename);

    try {
      // Generate display version at 1920px with quality 100
      await sharp(fullPath)
        .resize(1920, null, { withoutEnlargement: true })
        .webp({ quality: 100 })
        .toFile(displayPath);

      processed++;
      if (processed % 10 === 0) {
        console.log(`Processed ${processed}/${fullSizeImages.length}`);
      }
    } catch (err) {
      console.error(`Error processing ${filename}:`, err.message);
    }
  }

  console.log(`✅ Done! Generated ${processed} display versions`);
}

generateDisplayVersions();
