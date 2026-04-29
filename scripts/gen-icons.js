import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// Solid-color PNG generator. ~50 lines. No deps. RGB color, 8 bits per channel.
const SIZES = [16, 48, 128];
const COLOR = [0x2D, 0x8C, 0xFF]; // Zoom-ish blue

const CRC32_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (CRC32_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;     // bit depth
  ihdr[9] = 2;     // color type RGB
  ihdr[10] = 0;    // compression
  ihdr[11] = 0;    // filter
  ihdr[12] = 0;    // interlace

  // Raw image data: each row prefixed with filter byte (0 = none)
  const rowLen = 1 + size * 3;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    const off = y * rowLen;
    raw[off] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      raw[off + 1 + x * 3 + 0] = COLOR[0];
      raw[off + 1 + x * 3 + 1] = COLOR[1];
      raw[off + 1 + x * 3 + 2] = COLOR[2];
    }
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

for (const size of SIZES) {
  const png = makePng(size);
  writeFileSync(`icons/icon${size}.png`, png);
  console.log(`wrote icons/icon${size}.png (${png.length} bytes)`);
}
