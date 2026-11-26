import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Icon } from '@/components/common/Icon';
import { CATEGORIES, GROUP_BY_ID, TONES } from '@/data/categories';

/**
 * Category-specific map pins, drawn once to canvas and reused by every map instance:
 * a circle in the category group's colour with the category's Lucide glyph in white.
 */

export interface PinImage {
  id: string;
  data: ImageData;
}

const SIZE = 34; // CSS pixels
const RATIO = 2;

/** Render a Lucide icon to an SVG string through React, without pulling in react-dom/server. */
function iconSvg(name: string): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(<Icon name={name} color="#ffffff" width={16} height={16} strokeWidth={2.2} />));
  const svg = host.innerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  root.unmount();
  return svg;
}

const loadImage = (svg: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

async function drawPin(icon: string, color: string): Promise<ImageData> {
  const px = SIZE * RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const c = px / 2;

  ctx.beginPath();
  ctx.arc(c, c + 1.5 * RATIO, 13 * RATIO, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(37,43,38,0.22)';
  ctx.filter = `blur(${1.6 * RATIO}px)`;
  ctx.fill();
  ctx.filter = 'none';

  ctx.beginPath();
  ctx.arc(c, c, 13 * RATIO, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, 11 * RATIO, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  try {
    const img = await loadImage(iconSvg(icon));
    const s = 14 * RATIO;
    ctx.drawImage(img, c - s / 2, c - s / 2, s, s);
  } catch {
    // Glyph failed to rasterise: fall back to a plain dot so the pin still reads as a marker.
    ctx.beginPath();
    ctx.arc(c, c, 3 * RATIO, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  return ctx.getImageData(0, 0, px, px);
}

let pinsPromise: Promise<PinImage[]> | null = null;

export const PIN_PIXEL_RATIO = RATIO;
export const pinId = (categoryId: string) => `pin-${categoryId}`;

export function loadPins(): Promise<PinImage[]> {
  pinsPromise ??= Promise.all(
    CATEGORIES.map(async (cat) => ({ id: pinId(cat.id), data: await drawPin(cat.icon, TONES[GROUP_BY_ID[cat.groupId].tone].hex) })),
  ).catch((error) => {
    pinsPromise = null;
    throw error;
  });
  return pinsPromise;
}
