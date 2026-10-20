const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

/**
 * Detect image MIME type from Buffer magic bytes
 */
const detectMimeFromBuffer = (buffer) => {
  if (!buffer || buffer.length < 4) return 'image/jpeg';

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }
  // WebP: RIFF ... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  // SVG: <?xml or <svg
  const header = buffer.slice(0, 100).toString('utf8').trim().toLowerCase();
  if (header.startsWith('<?xml') || header.startsWith('<svg') || header.includes('<svg')) {
    return 'image/svg+xml';
  }

  return 'image/jpeg';
};

/**
 * Detect image MIME type from file extension
 */
const detectMimeFromFilename = (filename) => {
  const ext = path.extname(filename || '').toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.bmp':
      return 'image/bmp';
    case '.jpg':
    case '.jpeg':
    default:
      return 'image/jpeg';
  }
};

/**
 * Convert any image representation (Buffer, file path, raw base64, SVG, or Data URL)
 * into a standard, self-contained Base64 Data URL (e.g. data:image/jpeg;base64,...)
 *
 * @param {Buffer|string} input - Image buffer, file path, SVG string, or existing base64 string
 * @param {string} [fallbackMime='image/jpeg'] - Fallback MIME type
 * @returns {string|null} Full base64 Data URL or null
 */
const toBase64DataUrl = (input, fallbackMime = 'image/jpeg') => {
  if (!input) return null;

  // 1. If it is already a Buffer
  if (Buffer.isBuffer(input)) {
    const mime = detectMimeFromBuffer(input) || fallbackMime;
    return `data:${mime};base64,${input.toString('base64')}`;
  }

  if (typeof input !== 'string') {
    return null;
  }

  const str = input.trim();
  if (!str) return null;

  // 2. Already a standard data:image/ Data URL with base64
  if (str.startsWith('data:image/') && str.includes(';base64,')) {
    return str;
  }

  // 3. Data URL with utf8/svg or application/octet-stream
  if (str.startsWith('data:')) {
    if (str.includes(';base64,')) {
      // Fix generic octet-stream MIME if base64 encoded
      if (str.startsWith('data:application/octet-stream;base64,')) {
        return str.replace('data:application/octet-stream;base64,', 'data:image/jpeg;base64,');
      }
      return str;
    }
    // Unencoded SVG Data URL (e.g., data:image/svg+xml;utf8,<svg...)
    if (str.startsWith('data:image/svg+xml')) {
      const parts = str.split(',');
      if (parts.length > 1) {
        const svgContent = decodeURIComponent(parts.slice(1).join(','));
        const b64 = Buffer.from(svgContent, 'utf8').toString('base64');
        return `data:image/svg+xml;base64,${b64}`;
      }
    }
  }

  // 4. Raw SVG XML string (<svg ... or <?xml ...)
  if (str.startsWith('<svg') || str.startsWith('<?xml') || (str.includes('<svg') && str.includes('</svg>'))) {
    const b64 = Buffer.from(str, 'utf8').toString('base64');
    return `data:image/svg+xml;base64,${b64}`;
  }

  // 5. Raw Base64 string without data: header (check common magic prefix)
  if (str.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${str}`;
  }
  if (str.startsWith('iVBORw0KGgo')) {
    return `data:image/png;base64,${str}`;
  }
  if (str.startsWith('UklGR')) {
    return `data:image/webp;base64,${str}`;
  }
  if (str.startsWith('R0lGOD')) {
    return `data:image/gif;base64,${str}`;
  }
  if (str.startsWith('PHN2Zy') || str.startsWith('PD94bW')) {
    return `data:image/svg+xml;base64,${str}`;
  }

  // 6. Check if it's a local file path (e.g., /uploads/xyz.jpg or uploads/xyz.png)
  const isUploadPath = str.startsWith('/uploads/') || str.startsWith('uploads/') || !str.includes('/');
  if (isUploadPath) {
    const filename = str.replace(/^\/?uploads\//, '');
    const diskPath = path.isAbsolute(str) ? str : path.join(UPLOADS_DIR, filename);

    if (fs.existsSync(diskPath)) {
      try {
        const fileBuf = fs.readFileSync(diskPath);
        const mime = detectMimeFromFilename(filename) || detectMimeFromBuffer(fileBuf);
        return `data:${mime};base64,${fileBuf.toString('base64')}`;
      } catch (err) {
        console.warn(`[base64Helper] Could not read disk file ${diskPath}:`, err.message);
      }
    }
  }

  // 7. Check if it is a local URL referencing /uploads/
  if (str.includes('/uploads/')) {
    const urlParts = str.split('/uploads/');
    const filename = urlParts[urlParts.length - 1].split('?')[0];
    const diskPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(diskPath)) {
      try {
        const fileBuf = fs.readFileSync(diskPath);
        const mime = detectMimeFromFilename(filename) || detectMimeFromBuffer(fileBuf);
        return `data:${mime};base64,${fileBuf.toString('base64')}`;
      } catch (err) {
        // ignore
      }
    }
  }

  // 8. If string looks like generic Base64 (alphanumeric, +, /, =)
  if (/^[A-Za-z0-9+/=]{50,}$/.test(str.replace(/\s+/g, ''))) {
    return `data:${fallbackMime};base64,${str.replace(/\s+/g, '')}`;
  }

  // Return input as fallback if unable to resolve
  return str;
};

/**
 * Check if a value is a valid Base64 image data URL
 */
const isBase64DataUrl = (val) => {
  return typeof val === 'string' && val.startsWith('data:image/') && val.includes(';base64,');
};

module.exports = {
  toBase64DataUrl,
  isBase64DataUrl,
  detectMimeFromBuffer,
  detectMimeFromFilename,
};
