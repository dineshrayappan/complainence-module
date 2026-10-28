/**
 * ISO/IEC 18004 Compliant Pure JavaScript QR Code Generator
 * Self-contained, zero dependencies, offline-capable, crisp vector SVG & high-res PNG export.
 */

// GF(256) Math tables with primitive polynomial 0x11d (285)
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_EXP[i + 255] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x >= 256) x ^= 0x11d;
  }
})();

function gfMultiply(x, y) {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGeneratorPolynomial(numEcc) {
  let poly = [1];
  for (let i = 0; i < numEcc; i++) {
    const root = GF256_EXP[i];
    const newPoly = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      newPoly[j] ^= gfMultiply(poly[j], root);
      newPoly[j + 1] ^= poly[j];
    }
    poly = newPoly;
  }
  return poly;
}

function rsComputeRemainder(data, numEcc) {
  const genPoly = rsGeneratorPolynomial(numEcc);
  const remainder = new Array(numEcc).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder.shift();
    remainder.push(0);
    for (let i = 0; i < numEcc; i++) {
      remainder[i] ^= gfMultiply(genPoly[numEcc - 1 - i], factor);
    }
  }
  return remainder;
}

// QR Code Specifications: Version 1 to 10 for EC level 'M' (15% error correction)
const QR_SPECS_M = [
  null,
  { version: 1, totalBytes: 26, dataBytes: 16, numBlocks: 1, eccPerBlock: 10, align: [] },
  { version: 2, totalBytes: 44, dataBytes: 28, numBlocks: 1, eccPerBlock: 16, align: [6, 18] },
  { version: 3, totalBytes: 70, dataBytes: 44, numBlocks: 1, eccPerBlock: 26, align: [6, 22] },
  { version: 4, totalBytes: 100, dataBytes: 64, numBlocks: 2, eccPerBlock: 18, align: [6, 26] },
  { version: 5, totalBytes: 134, dataBytes: 86, numBlocks: 2, eccPerBlock: 24, align: [6, 30] },
  { version: 6, totalBytes: 172, dataBytes: 108, numBlocks: 4, eccPerBlock: 16, align: [6, 34] },
  { version: 7, totalBytes: 196, dataBytes: 124, numBlocks: 4, eccPerBlock: 18, align: [6, 22, 38] },
  { version: 8, totalBytes: 242, dataBytes: 154, numBlocks: 4, eccPerBlock: 22, align: [6, 24, 42] },
  { version: 9, totalBytes: 292, dataBytes: 182, numBlocks: 5, eccPerBlock: 22, align: [6, 26, 46] },
  { version: 10, totalBytes: 346, dataBytes: 216, numBlocks: 5, eccPerBlock: 26, align: [6, 28, 50] },
];

function chooseVersion(dataLen) {
  for (let v = 1; v <= 10; v++) {
    const spec = QR_SPECS_M[v];
    const headerBits = 4 + (v < 10 ? 8 : 16);
    const maxCapacity = Math.floor((spec.dataBytes * 8 - headerBits) / 8);
    if (dataLen <= maxCapacity) {
      return spec;
    }
  }
  return QR_SPECS_M[10];
}

class BitBuffer {
  constructor() {
    this.buffer = [];
    this.length = 0;
  }
  put(num, length) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }
  putBit(bit) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    }
    this.length++;
  }
  getBytes() {
    return this.buffer;
  }
}

function encodeData(text, spec) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else if (code < 2048) {
      bytes.push((code >> 6) | 192, (code & 63) | 128);
    } else {
      bytes.push((code >> 12) | 224, ((code >> 6) & 63) | 128, (code & 63) | 128);
    }
  }

  const bb = new BitBuffer();
  // Mode: 8-bit byte (0100)
  bb.put(4, 4);
  // Character count indicator
  const countBits = spec.version < 10 ? 8 : 16;
  bb.put(bytes.length, countBits);
  // Data bytes
  for (const b of bytes) {
    bb.put(b, 8);
  }

  // Terminator (up to 4 zeroes)
  const totalDataBits = spec.dataBytes * 8;
  const remBits = totalDataBits - bb.length;
  bb.put(0, Math.min(4, Math.max(0, remBits)));

  // Align to byte boundary
  while (bb.length % 8 !== 0) {
    bb.putBit(false);
  }

  // Pad bytes: 0xEC, 0x11
  const rawBytes = bb.getBytes();
  let padToggle = true;
  while (rawBytes.length < spec.dataBytes) {
    rawBytes.push(padToggle ? 0xec : 0x11);
    padToggle = !padToggle;
  }

  // Split into blocks and compute Reed-Solomon Error Correction
  const numBlocks = spec.numBlocks;
  const totalDataBytes = spec.dataBytes;
  const baseBlockDataLen = Math.floor(totalDataBytes / numBlocks);
  const extraBlocks = totalDataBytes % numBlocks;

  const dataBlocks = [];
  const ecBlocks = [];

  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const blockLen = baseBlockDataLen + (i >= numBlocks - extraBlocks ? 1 : 0);
    const blockData = rawBytes.slice(offset, offset + blockLen);
    offset += blockLen;
    dataBlocks.push(blockData);
    ecBlocks.push(rsComputeRemainder(blockData, spec.eccPerBlock));
  }

  // Interleave data blocks
  const finalSequence = [];
  const maxBlockLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxBlockLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < dataBlocks[b].length) {
        finalSequence.push(dataBlocks[b][i]);
      }
    }
  }

  // Interleave EC blocks
  for (let i = 0; i < spec.eccPerBlock; i++) {
    for (let b = 0; b < numBlocks; b++) {
      finalSequence.push(ecBlocks[b][i]);
    }
  }

  return finalSequence;
}

/**
 * Generate 2D Matrix of QR modules
 */
export function generateQrMatrix(text) {
  // Approximate UTF-8 length
  let utf8Len = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    utf8Len += c < 128 ? 1 : c < 2048 ? 2 : 3;
  }

  const spec = chooseVersion(utf8Len);
  const dataBytes = encodeData(text, spec);
  const size = spec.version * 4 + 17;

  const matrix = Array.from({ length: size }, () => Array(size).fill(null));
  const isReserved = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r, c, val, reserved = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      if (reserved) isReserved[r][c] = true;
    }
  };

  // 1. Finder Patterns (7x7) + Separators (8x8)
  const addFinder = (startR, startC) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = startR + r;
        const nc = startC + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isBlack = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
            setModule(nr, nc, isBlack);
          } else {
            setModule(nr, nc, false);
          }
        }
      }
    }
  };

  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // 2. Alignment Patterns
  const alignCoords = spec.align;
  if (alignCoords.length > 0) {
    for (const r of alignCoords) {
      for (const c of alignCoords) {
        if ((r < 9 && c < 9) || (r < 9 && c >= size - 8) || (r >= size - 8 && c < 9)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setModule(r + dr, c + dc, isBlack);
          }
        }
      }
    }
  }

  // 3. Timing Patterns (Row 6 & Col 6)
  for (let i = 8; i < size - 8; i++) {
    if (!isReserved[6][i]) setModule(6, i, i % 2 === 0);
    if (!isReserved[i][6]) setModule(i, 6, i % 2 === 0);
  }

  // 4. Dark Module
  setModule(size - 8, 8, true);

  // 5. Reserve Format Info areas
  for (let i = 0; i < 9; i++) {
    if (!isReserved[8][i]) isReserved[8][i] = true;
    if (!isReserved[i][8]) isReserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    if (!isReserved[8][size - 1 - i]) isReserved[8][size - 1 - i] = true;
    if (!isReserved[size - 1 - i][8]) isReserved[size - 1 - i][8] = true;
  }

  // 6. Place Data Bits using 2-column zig-zag
  let bitIndex = 0;
  const totalBits = dataBytes.length * 8;
  let upwards = true;

  for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--;
    const cols = [rightCol, rightCol - 1];

    const rows = [];
    for (let r = 0; r < size; r++) rows.push(upwards ? size - 1 - r : r);

    for (const r of rows) {
      for (const c of cols) {
        if (!isReserved[r][c]) {
          let bit = false;
          if (bitIndex < totalBits) {
            const byteVal = dataBytes[Math.floor(bitIndex / 8)];
            bit = ((byteVal >>> (7 - (bitIndex % 8))) & 1) === 1;
          }
          matrix[r][c] = bit;
          bitIndex++;
        }
      }
    }
    upwards = !upwards;
  }

  // 7. Apply standard Mask Pattern (Pattern 0: (r + c) % 2 === 0)
  const FORMAT_BITS_M_MASK0 = 0x5412;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isReserved[r][c]) {
        if ((r + c) % 2 === 0) {
          matrix[r][c] = !matrix[r][c];
        }
      }
    }
  }

  // 8. Place Format Information
  for (let i = 0; i < 15; i++) {
    const bit = ((FORMAT_BITS_M_MASK0 >>> (14 - i)) & 1) === 1;
    if (i < 6) setModule(8, i, bit);
    else if (i === 6) setModule(8, 7, bit);
    else if (i === 7) setModule(8, 8, bit);
    else if (i === 8) setModule(7, 8, bit);
    else setModule(14 - i, 8, bit);

    if (i < 8) {
      setModule(size - 1 - i, 8, bit);
    } else {
      setModule(8, size - 15 + i, bit);
    }
  }

  return { matrix, size };
}

/**
 * Generate standalone SVG string
 */
export function generateQrSvg(text, options = {}) {
  const {
    size: svgSize = 256,
    margin = 4,
    darkColor = '#0f172a',
    lightColor = '#ffffff',
  } = options;

  const { matrix, size } = generateQrMatrix(text);
  const totalSize = size + margin * 2;

  let paths = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        const x = c + margin;
        const y = r + margin;
        paths += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${svgSize}" height="${svgSize}" shape-rendering="crispEdges">
  <rect width="${totalSize}" height="${totalSize}" fill="${lightColor}"/>
  <path d="${paths}" fill="${darkColor}"/>
</svg>`;
}

/**
 * Generate Data URL string for <img> tags
 */
export function generateQrDataUrl(text, options = {}) {
  const svg = generateQrSvg(text, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Download high-resolution PNG image
 */
export function downloadQrPng(text, filename = 'Compliance_QR_Code.png', options = {}) {
  const {
    size = 1024,
    margin = 4,
    darkColor = '#0f172a',
    lightColor = '#ffffff',
    title = 'Scan to Raise Compliance',
  } = options;

  const svgStr = generateQrSvg(text, { size, margin, darkColor, lightColor });
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);

    const a = document.createElement('a');
    a.download = filename;
    a.href = canvas.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

/**
 * Open factory floor printable poster window
 */
export function printQrPoster(text, options = {}) {
  const {
    companyName = 'Garment Manufacturing Plant',
    unitName = 'Factory Floor',
    portalUrl = text,
  } = options;

  const svgStr = generateQrSvg(text, { size: 400, margin: 4, darkColor: '#0f172a' });

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Compliance Raising QR Poster - ${companyName}</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #0f172a;
            margin: 0;
            padding: 24px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
          }
          .poster-frame {
            border: 4px solid #4f46e5;
            border-radius: 24px;
            padding: 36px 28px;
            max-width: 580px;
            width: 100%;
            box-sizing: border-box;
            background: #fafafa;
          }
          .badge {
            display: inline-block;
            background: #e0e7ff;
            color: #3730a3;
            font-size: 13px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            padding: 6px 16px;
            border-radius: 9999px;
            margin-bottom: 16px;
          }
          h1 {
            font-size: 28px;
            margin: 0 0 8px 0;
            font-weight: 900;
            color: #1e1b4b;
            letter-spacing: -0.5px;
          }
          h2 {
            font-size: 18px;
            margin: 0 0 20px 0;
            color: #4f46e5;
            font-weight: 700;
          }
          .qr-box {
            background: #ffffff;
            padding: 16px;
            border-radius: 20px;
            border: 2px solid #e2e8f0;
            display: inline-block;
            margin: 12px 0;
            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);
          }
          .instructions {
            margin-top: 20px;
            text-align: left;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 16px 20px;
          }
          .instructions ol {
            margin: 0;
            padding-left: 20px;
            color: #334155;
            font-size: 14px;
            line-height: 1.6;
            font-weight: 600;
          }
          .url-text {
            font-family: monospace;
            font-size: 11px;
            color: #64748b;
            margin-top: 14px;
            word-break: break-all;
          }
          .footer-note {
            font-size: 11px;
            color: #94a3b8;
            margin-top: 24px;
            font-weight: 500;
          }
          @media print {
            body { padding: 0; background: none; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="poster-frame">
          <div class="badge">Official QMS Safety & Compliance Portal</div>
          <h1>SCAN TO REPORT NON-CONFORMANCE</h1>
          <h2>${companyName} • ${unitName}</h2>
          
          <div class="qr-box">
            ${svgStr}
          </div>

          <div class="instructions">
            <ol>
              <li>Open your smartphone camera or scanner.</li>
              <li>Point at the QR code above.</li>
              <li>Select department, snap photo evidence & submit defect.</li>
              <li>Report will be immediately routed to the Floor Supervisor.</li>
            </ol>
          </div>

          <div class="url-text">Direct Portal: ${portalUrl}</div>
          <div class="footer-note">Zero Login Required • Open Floor Access • Confidential Reporting</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
