// Generates the PWA icon set from the NearMe mark. Run with: npm run icons
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const INK = '#252B26';
const IVORY = '#F5F3ED';
const BRAND = '#E97845';

/** The mark on a 512 canvas. `inset` shrinks it for maskable icons (safe zone = centre 80%). */
const mark = ({ rounded, inset = 0 }) => {
  const s = 512;
  const scale = (s - inset * 2) / s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${rounded ? 148 : 0}" fill="${INK}"/>
  <g transform="translate(${inset} ${inset}) scale(${scale})">
    <circle cx="256" cy="256" r="56" fill="${BRAND}"/>
    <path d="M131 256A125 125 0 0 1 256 131" stroke="${IVORY}" stroke-width="34" stroke-linecap="round" fill="none"/>
    <path d="M381 256A125 125 0 0 1 256 381" stroke="${IVORY}" stroke-width="34" stroke-linecap="round" fill="none"/>
  </g>
</svg>`;
};

const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

const files = {
  'icon-192.png': await png(mark({ rounded: true }), 192),
  'icon-512.png': await png(mark({ rounded: true }), 512),
  'maskable-512.png': await png(mark({ rounded: false, inset: 64 }), 512),
  'apple-touch-icon.png': await png(mark({ rounded: false, inset: 28 }), 180),
};

for (const [name, data] of Object.entries(files)) {
  await writeFile(new URL(name, out), data);
  console.log(`wrote public/icons/${name} (${data.length} bytes)`);
}

await writeFile(
  new URL('../public/favicon.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9.5" fill="${INK}"/><circle cx="16" cy="16" r="3.5" fill="${BRAND}"/><path d="M8.2 16A7.8 7.8 0 0 1 16 8.2" stroke="${IVORY}" stroke-width="2.1" stroke-linecap="round" fill="none"/><path d="M23.8 16A7.8 7.8 0 0 1 16 23.8" stroke="${IVORY}" stroke-width="2.1" stroke-linecap="round" fill="none"/></svg>\n`,
);
console.log('wrote public/favicon.svg');
