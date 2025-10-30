import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const contentDirs = [
  'src/content/portraits',
  'src/content/bits-pieces',
  'src/content/overview'
];

async function updateFrontmatter() {
  let totalUpdated = 0;

  for (const dir of contentDirs) {
    try {
      const files = await readdir(dir);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      for (const file of mdFiles) {
        const filePath = join(dir, file);
        let content = await readFile(filePath, 'utf-8');

        // Check if display field already exists
        if (content.includes('display:')) {
          continue;
        }

        // Add display field after image field
        const imageMatch = content.match(/image: "(.+?)"/);
        if (imageMatch) {
          const imagePath = imageMatch[1];
          const displayPath = imagePath.replace('.webp', '-display.webp');

          // Insert display field right after image field
          content = content.replace(
            /image: "(.+?)"/,
            `image: "$1"\ndisplay: "${displayPath}"`
          );

          await writeFile(filePath, content);
          totalUpdated++;
        }
      }

      console.log(`Updated ${mdFiles.length} files in ${dir}`);
    } catch (err) {
      console.log(`Skipping ${dir}: ${err.message}`);
    }
  }

  console.log(`✅ Done! Updated ${totalUpdated} markdown files`);
}

updateFrontmatter();
