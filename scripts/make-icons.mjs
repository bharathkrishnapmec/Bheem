// Generates placeholder PWA icons (pixel "B" on dusk background with a red scarf stripe).
// Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

const GLYPH = ['11110', '10001', '10001', '11110', '10001', '10001', '11110'];
function png(size) {
  const px = (x, y) => {
    const t = y / size;
    let col = [Math.round(20 + 40 * t), Math.round(16 + 10 * t), Math.round(31 + 60 * t)];
    const cell = Math.floor(size / 10);
    const gx = Math.floor((x - cell * 2.5) / cell);
    const gy = Math.floor((y - cell * 1.2) / cell);
    if (gy >= 0 && gy < 7 && gx >= 0 && gx < 5 && GLYPH[gy][gx] === '1') col = [255, 210, 90];
    if (y > size * 0.84 && y < size * 0.9) col = [216, 57, 43];
    return col;
  };
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [180, 192, 512]) writeFileSync(new URL(`../public/icons/icon-${s}.png`, import.meta.url), png(s));
console.info('icons written');
