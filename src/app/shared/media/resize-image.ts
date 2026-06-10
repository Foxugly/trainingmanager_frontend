/**
 * Pure, component-agnostic client-side image resize. Reads a File via
 * FileReader, draws it onto a <canvas> downscaled so the longest side is at
 * most `maxDim` (aspect preserved), and returns a data-URL. SVGs are kept
 * as-is (vector, already small). No `this`, no signals — safe to import as a
 * free function (canvas/FileReader/Image are browser globals).
 */

/** Max base64 data-URL length accepted by the backend (~375 KB binary). */
export const LOGO_MAX_CHARS = 500000;
/** Longest side (px) the logo is downscaled to before encoding. */
export const LOGO_MAX_DIM = 256;

/**
 * Load the file into an <img>, draw it onto a canvas downscaled so the
 * longest side is at most `maxDim` (aspect preserved), and return a PNG
 * data-URL — falling back to progressively lower JPEG quality if the PNG
 * exceeds `maxChars`. SVGs are kept as-is (vector, already small).
 */
export function resizeImageToDataUrl(
  file: File,
  maxDim: number,
  maxChars: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => {
      const src = reader.result as string;
      if (file.type === 'image/svg+xml') {
        resolve(src);
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('decode_failed'));
      img.onload = () => {
        const max = maxDim;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('no_context'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        // Prefer PNG; if too heavy, fall back to progressively lower JPEG quality.
        let out = canvas.toDataURL('image/png');
        for (const q of [0.85, 0.7, 0.55, 0.4]) {
          if (out.length <= maxChars) break;
          out = canvas.toDataURL('image/jpeg', q);
        }
        resolve(out);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
