/**
 * Genera los iconos PNG del PWA sin dependencias externas.
 *
 * Los manifests con iconos SVG tienen soporte irregular en Android, y sin
 * iconos PNG validos Chrome no ofrece "Instalar aplicacion". Escribir el PNG a
 * mano con zlib evita sumar una dependencia de imagen al proyecto.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = buffer => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
};

/** @param {(x:number,y:number)=>[number,number,number]} shade */
const png = (size, shade) => {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;

  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = shade(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const BG = [10, 12, 16];
const BARS = [
  { color: [88, 166, 255], alturaRel: 0.42 },
  { color: [63, 185, 80], alturaRel: 0.68 },
  { color: [249, 115, 22], alturaRel: 0.9 },
];

/** Tres barras ascendentes sobre fondo oscuro: un grafico de finanzas. */
const iconShader = size => (x, y) => {
  const ancho = size * 0.6;
  const anchoBarra = ancho / 5;
  const base = size * 0.79;

  // Las tres barras ocupan 2 separaciones + 1 ancho = 4 anchos de barra.
  // Se centra ese bloque en vez de anclarlo al margen izquierdo.
  const bloque = anchoBarra * (1.5 * (BARS.length - 1) + 1);
  const margenIzq = (size - bloque) / 2;

  for (let i = 0; i < BARS.length; i++) {
    const inicioX = margenIzq + i * (anchoBarra * 1.5);
    const finX = inicioX + anchoBarra;
    const topeY = base - ancho * BARS[i].alturaRel;

    if (x >= inicioX && x < finX && y >= topeY && y < base) {
      return BARS[i].color;
    }
  }

  return BG;
};

mkdirSync(resolve(ROOT, 'public'), { recursive: true });

for (const size of [192, 512]) {
  const file = resolve(ROOT, `public/icon-${size}.png`);
  writeFileSync(file, png(size, iconShader(size)));
  console.log(`✓ public/icon-${size}.png`);
}

// Icono maskable: Android recorta hasta un 20% de cada borde, asi que el
// contenido tiene que caber en el circulo seguro del centro.
const maskableShader = (() => {
  const size = 512;
  const inner = iconShader(size * 0.62);
  return (x, y) => {
    const pad = size * 0.19;
    const ix = Math.floor((x - pad) / 0.62);
    const iy = Math.floor((y - pad) / 0.62);
    if (ix < 0 || iy < 0 || ix >= size * 0.62 || iy >= size * 0.62) return BG;
    return inner(ix * 0.62, iy * 0.62);
  };
})();

writeFileSync(resolve(ROOT, 'public/icon-maskable-512.png'), png(512, maskableShader));
console.log('✓ public/icon-maskable-512.png');
