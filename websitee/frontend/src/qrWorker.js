/* eslint-disable no-restricted-globals */

// ZXing module cache
let zxingModule = null;

async function loadZXing() {
  if (zxingModule) return zxingModule;
  try {
    // ESM module over CDN; worker is created with type: 'module'
    zxingModule = await import('https://unpkg.com/@zxing/library@latest?module');
    return zxingModule;
  } catch (e) {
    postMessage({ type: 'log', level: 'warn', message: 'Failed to load ZXing module', error: String(e) });
    return null;
  }
}

function decodeBitmapWithZXing(mod, imageData) {
  const { RGBLuminanceSource, BinaryBitmap, HybridBinarizer, MultiFormatReader, DecodeHintType, BarcodeFormat } = mod;
  const luminance = new RGBLuminanceSource(imageData.data, imageData.width, imageData.height);
  const binarizer = new HybridBinarizer(luminance);
  const bitmap = new BinaryBitmap(binarizer);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.ALSO_INVERTED, true);
  const reader = new MultiFormatReader();
  reader.setHints(hints);
  const result = reader.decode(bitmap);
  return result?.getText?.() || result?.text || null;
}

function bitmapToImageData(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function tryDecode(bitmap) {
  const mod = await loadZXing();
  if (!mod) return null;
  let img = bitmapToImageData(bitmap);
  // Try direct
  try {
    const text = decodeBitmapWithZXing(mod, img);
    if (text) return text;
  } catch {}
  // Try rotations
  const rotations = [90, 180, 270];
  for (const rot of rotations) {
    try {
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const text = decodeBitmapWithZXing(mod, img);
      if (text) return text;
    } catch {}
  }
  return null;
}

onmessage = async (e) => {
  const { type, bitmap } = e.data || {};
  if (type === 'decode' && bitmap) {
    try {
      const text = await tryDecode(bitmap);
      if (text) {
        postMessage({ type: 'result', text });
      } else {
        postMessage({ type: 'none' });
      }
    } catch (err) {
      postMessage({ type: 'error', error: String(err) });
    } finally {
      try { bitmap.close && bitmap.close(); } catch {}
    }
  }
};


