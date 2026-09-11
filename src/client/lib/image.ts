/**
 * Prepare an image for the support desk.
 *
 * A phone photo is several megabytes; a Durable Object storage value is not.
 * So the browser does the work: downscale to `MAX_IMAGE_EDGE` on the long
 * side, then step the JPEG quality down until it fits `MAX_IMAGE_BYTES`.
 * Doing it here rather than server-side also means the big bytes never go on
 * the wire at all.
 *
 * PNG is kept only when it is already small enough — screenshots of the
 * portal, which is the common case, stay crisp instead of picking up JPEG
 * artefacts around text.
 */
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
} from '@shared/constants/support';

export interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Quality ladder for the JPEG fallback, best first. */
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4, 0.3];

export function isAcceptedImage(file: File | null): file is File {
  return Boolean(
    file && (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type),
  );
}

/** Rough byte count of a base64 data URL, without materialising a Blob. */
function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function loadBitmap(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!isAcceptedImage(file)) {
    throw new Error('Only PNG, JPEG, WebP or GIF images can be sent.');
  }

  const img = await loadBitmap(file);

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');

  // A white ground, so a transparent PNG does not turn black once it is
  // flattened into a JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const asPng = canvas.toDataURL('image/png');
  if (dataUrlBytes(asPng) <= MAX_IMAGE_BYTES) {
    return { dataUrl: asPng, width, height };
  }

  for (const quality of QUALITY_STEPS) {
    const candidate = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlBytes(candidate) <= MAX_IMAGE_BYTES) {
      return { dataUrl: candidate, width, height };
    }
  }

  throw new Error(
    'That image is too detailed to send — try a screenshot or a smaller crop.',
  );
}

/** The first image on a paste event, if there is one. */
export function imageFromClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;

  for (const item of items) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (isAcceptedImage(file)) return file;
  }
  return null;
}
