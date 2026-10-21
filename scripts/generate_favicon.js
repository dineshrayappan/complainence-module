const fs = require('fs');
const path = require('path');

function createIco(width = 32, height = 32) {
  const pixelCount = width * height;
  const xorSize = pixelCount * 4;
  const andSize = Math.ceil(pixelCount / 8);
  const dibHeaderSize = 40;
  const imageSize = dibHeaderSize + xorSize + andSize;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(1, 4); // 1 image

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(width === 256 ? 0 : width, 0);
  dirEntry.writeUInt8(height === 256 ? 0 : height, 1);
  dirEntry.writeUInt8(0, 2); // colors
  dirEntry.writeUInt8(0, 3); // reserved
  dirEntry.writeUInt16LE(1, 4); // color planes
  dirEntry.writeUInt16LE(32, 6); // bits per pixel
  dirEntry.writeUInt32LE(imageSize, 8); // image size
  dirEntry.writeUInt32LE(22, 12); // offset (6 + 16)

  const dibHeader = Buffer.alloc(40);
  dibHeader.writeUInt32LE(40, 0); // header size
  dibHeader.writeInt32LE(width, 4); // width
  dibHeader.writeInt32LE(height * 2, 8); // height * 2 for ICO
  dibHeader.writeUInt16LE(1, 12); // planes
  dibHeader.writeUInt16LE(32, 14); // bpp
  dibHeader.writeUInt32LE(0, 16); // BI_RGB
  dibHeader.writeUInt32LE(xorSize + andSize, 20);
  dibHeader.writeInt32LE(0, 24);
  dibHeader.writeInt32LE(0, 28);
  dibHeader.writeUInt32LE(0, 32);
  dibHeader.writeUInt32LE(0, 36);

  const xorPixels = Buffer.alloc(xorSize);
  // Fill with a stylish rounded gradient logo: dark navy slate background + indigo/cyan check
  const cx = width / 2;
  const cy = height / 2;
  const radius = width / 2 - 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Flip vertically for BMP
      const actualY = height - 1 - y;
      const dx = x - cx;
      const dy = actualY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Checkmark drawing coordinates
        const isCheck =
          (x >= 10 && x <= 16 && actualY >= 14 && actualY <= 20 && Math.abs(x - 10 - (actualY - 14)) <= 1.5) ||
          (x >= 14 && x <= 24 && actualY >= 14 && actualY <= 24 && Math.abs((actualY - 14) + (x - 24)) <= 1.5);

        if (isCheck) {
          // Pure white checkmark
          xorPixels[idx] = 255; // B
          xorPixels[idx + 1] = 255; // G
          xorPixels[idx + 2] = 255; // R
          xorPixels[idx + 3] = 255; // A
        } else {
          // Indigo gradient
          const factor = (x + actualY) / (width * 2);
          xorPixels[idx] = Math.round(230 * (1 - factor) + 210 * factor); // B
          xorPixels[idx + 1] = Math.round(70 * (1 - factor) + 180 * factor); // G
          xorPixels[idx + 2] = Math.round(80 * (1 - factor) + 6 * factor); // R
          xorPixels[idx + 3] = 255; // A
        }
      } else {
        // Transparent
        xorPixels[idx] = 0;
        xorPixels[idx + 1] = 0;
        xorPixels[idx + 2] = 0;
        xorPixels[idx + 3] = 0;
      }
    }
  }

  const andMask = Buffer.alloc(andSize, 0);

  return Buffer.concat([header, dirEntry, dibHeader, xorPixels, andMask]);
}

const outputPath = path.join(__dirname, '../client/public/favicon.ico');
const icoBuffer = createIco(32, 32);
fs.writeFileSync(outputPath, icoBuffer);
console.log('✅ Successfully created favicon.ico at:', outputPath);
