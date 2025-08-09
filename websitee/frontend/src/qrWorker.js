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
  const makeImageData = (bmp) => bitmapToImageData(bmp);
  const decodeImg = (imageData) => {
    try { return decodeBitmapWithZXing(mod, imageData); } catch { return null; }
  };

  // Multi-scale center ROI pyramid to enlarge small QRs
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  const attempt = (sx, sy, sw, sh, scale) => {
    const roi = ctx.getImageData(sx, sy, sw, sh);
    const c = new OffscreenCanvas(sw * scale, sh * scale);
    const cx = c.getContext('2d');
    // Nearest-neighbor upscale to preserve module edges
    cx.imageSmoothingEnabled = false;
    cx.putImageData(roi, 0, 0);
    const upscaled = new OffscreenCanvas(c.width, c.height);
    const ux = upscaled.getContext('2d');
    ux.imageSmoothingEnabled = false;
    ux.drawImage(c, 0, 0, c.width, c.height);
    return ux.getImageData(0, 0, upscaled.width, upscaled.height);
  };

  const W = canvas.width, H = canvas.height;
  const sizes = [0.5, 0.7, 0.9, 1.0];
  const scales = [1.5, 2.0, 2.5];
  const rotations = [0, 90, 180, 270];

  for (const r of rotations) {
    let bmp = bitmap;
    if (r !== 0) {
      const rc = new OffscreenCanvas(W, H);
      const rx = rc.getContext('2d');
      rx.translate(W / 2, H / 2);
      rx.rotate((r * Math.PI) / 180);
      rx.drawImage(bitmap, -W / 2, -H / 2);
      bmp = rc.transferToImageBitmap();
    }
    const id = makeImageData(bmp);
    const baseText = decodeImg(id);
    if (baseText) return baseText;

    for (const sz of sizes) {
      const sw = Math.floor(W * sz);
      const sh = Math.floor(H * sz);
      const sx = Math.max(0, Math.floor((W - sw) / 2));
      const sy = Math.max(0, Math.floor((H - sh) / 2));
      for (const sc of scales) {
        const roiUpscaled = attempt(sx, sy, sw, sh, sc);
        const t = decodeImg(roiUpscaled);
        if (t) return t;
      }
    }
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


