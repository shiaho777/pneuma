import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 1024;
const ACCENT = [232, 131, 74];
const PAPER = [250, 247, 242];

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    let c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
const cx = SIZE / 2;
const cy = SIZE / 2;
const r = SIZE * 0.42;
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0;
  for (let x = 0; x < SIZE; x++) {
    const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    const [rr, gg, bb] = inside ? ACCENT : PAPER;
    const alpha = inside ? 255 : 0;
    const p = rowStart + 1 + x * 4;
    raw[p] = rr;
    raw[p + 1] = gg;
    raw[p + 2] = bb;
    raw[p + 3] = alpha;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

const target = join(root, "apps", "desktop");
mkdirSync(target, { recursive: true });
writeFileSync(join(target, "app-icon.png"), png);
console.log("已生成图标源图 app-icon.png");