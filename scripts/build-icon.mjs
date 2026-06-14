import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = process.cwd();
const source = path.join(root, 'renderer', 'src', 'assets', 'images', 'common', 'jnm-logo.svg');
const outputDir = path.join(root, 'build');
const output = path.join(outputDir, 'icon.ico');
const sizes = [16, 24, 32, 48, 64, 128, 256];

await fs.mkdir(outputDir, {recursive: true});

const svg = await fs.readFile(source);
const pngs = await Promise.all(
  sizes.map(size =>
    sharp(svg)
      .resize(size, size, {fit: 'contain'})
      .png()
      .toBuffer()
  )
);

const ico = await pngToIco(pngs);
await fs.writeFile(output, ico);

console.log(`Generated ${path.relative(root, output)}`);
