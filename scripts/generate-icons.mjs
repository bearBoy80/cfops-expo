/**
 * Renders every launcher asset from one vector definition.
 *
 *   node scripts/generate-icons.mjs            # write assets/images
 *   node scripts/generate-icons.mjs --preview  # also write QA sheets
 *
 * The mark is authored as geometry rather than kept as a flat export so the
 * weight, proportions and palette stay adjustable: the numbers below are the
 * source of truth, and the six PNGs are disposable output.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const IMAGES = path.join(ROOT, 'assets/images');
const PREVIEW = path.join(ROOT, 'scripts/.preview');

// Graphite plate, so the orange reads as the brand colour rather than as the
// whole icon. `ORANGE` is `accent.orange` from src/theme/tokens.ts; the other
// two straddle it to give the ring some depth.
const ORANGE = '#f6821f';
const ORANGE_LIGHT = '#f9a03c';
const ORANGE_DEEP = '#e2650c';
const GRAPHITE_TOP = '#262b33';
const GRAPHITE_BOTTOM = '#14171c';
// app.json needs a single colour where this gradient cannot reach: the splash
// background and the adaptive icon's fallback. Keep #1d2128 there in step with
// the two stops above.

/*
 * An "O" broken at the upper right, with a flare sitting in the break: the
 * letter opens the name, the flare closes it.
 *
 * Everything is derived from the centre, radius and gap angle so the break and
 * the flare cannot drift out of alignment, which is the flaw that makes this
 * kind of mark look hand-assembled.
 */
const C = 360;
const RADIUS = 250;
const STROKE = 76;
const GAP_CENTRE_DEG = -45;
const GAP_HALF_DEG = 26;

const polar = (deg, r = RADIUS) => {
  const rad = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
};

const RING = (() => {
  // Drawn the long way round the circle, leaving the gap: start at the lower
  // edge of the break and sweep clockwise back to its upper edge.
  const from = polar(GAP_CENTRE_DEG + GAP_HALF_DEG);
  const to = polar(GAP_CENTRE_DEG - GAP_HALF_DEG + 360);
  return [
    `M ${from.x.toFixed(2)} ${from.y.toFixed(2)}`,
    `A ${RADIUS} ${RADIUS} 0 1 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`,
  ].join(' ');
})();

// Four-point sparkle seated on the ring's path inside the break. Control points
// pulled close to the centre make the arms concave; the vertical arms run
// longer than the horizontal ones so it reads as a flare rather than a plus.
const FLARE_R = { x: 74, y: 106 };

const FLARE = (() => {
  const { x: cx, y: cy } = polar(GAP_CENTRE_DEG);
  const { x: rx, y: ry } = FLARE_R;
  const k = 22;
  return [
    `M ${cx.toFixed(2)} ${(cy - ry).toFixed(2)}`,
    `Q ${(cx + k).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + rx).toFixed(2)} ${cy.toFixed(2)}`,
    `Q ${(cx + k).toFixed(2)} ${(cy + k).toFixed(2)} ${cx.toFixed(2)} ${(cy + ry).toFixed(2)}`,
    `Q ${(cx - k).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - rx).toFixed(2)} ${cy.toFixed(2)}`,
    `Q ${(cx - k).toFixed(2)} ${(cy - k).toFixed(2)} ${cx.toFixed(2)} ${(cy - ry).toFixed(2)}`,
    'Z',
  ].join(' ');
})();

// The ring's painted extent contains the flare's, so the mark is a true square
// centred on C and needs no optical nudge.
const INK = {
  x: C - RADIUS - STROKE / 2,
  y: C - RADIUS - STROKE / 2,
  size: (RADIUS + STROKE / 2) * 2,
};

/** Mark centred on a square canvas, taking `fraction` of the canvas. */
function mark(size, fraction, paint) {
  const scale = (size * fraction) / INK.size;
  const offset = (size - INK.size * scale) / 2 - INK.x * scale;
  return `
    <g transform="translate(${offset} ${offset}) scale(${scale})">
      <path d="${RING}" fill="none" stroke="${paint}" stroke-width="${STROKE}"
            stroke-linecap="round" />
      <path d="${FLARE}" fill="${paint}" />
    </g>`;
}

const defs = `
  <defs>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GRAPHITE_TOP}" />
      <stop offset="1" stop-color="${GRAPHITE_BOTTOM}" />
    </linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ORANGE_LIGHT}" />
      <stop offset="0.55" stop-color="${ORANGE}" />
      <stop offset="1" stop-color="${ORANGE_DEEP}" />
    </linearGradient>
  </defs>`;

const svg = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
     viewBox="0 0 ${size} ${size}">${defs}${body}</svg>`;

/** Full icon: opaque graphite plate carrying the orange mark. */
const plate = (size, fraction = 0.7) =>
  svg(
    size,
    `<rect width="${size}" height="${size}" fill="url(#plate)" />
     ${mark(size, fraction, 'url(#ring)')}`,
  );

const write = (source, dir, file, { opaque = false } = {}) => {
  const pipeline = sharp(Buffer.from(source));
  return (opaque ? pipeline.removeAlpha() : pipeline)
    .png()
    .toFile(path.join(dir, file));
};

await mkdir(IMAGES, { recursive: true });

// App Store upload validation rejects an alpha channel on the marketing icon,
// and the plate is opaque anyway, so drop the channel explicitly.
await write(plate(1024), IMAGES, 'icon.png', { opaque: true });
await write(plate(48, 0.76), IMAGES, 'favicon.png', { opaque: true });

// The Android adaptive icon ships as separate layers and the launcher masks
// the outer edge, so the mark stays inside the guaranteed-visible circle
// (72 of the 108 canvas units) instead of filling the canvas.
const ADAPTIVE_FRACTION = 0.56;
await write(
  svg(512, `<rect width="512" height="512" fill="url(#plate)" />`),
  IMAGES,
  'android-icon-background.png',
);
await write(
  svg(512, mark(512, ADAPTIVE_FRACTION, 'url(#ring)')),
  IMAGES,
  'android-icon-foreground.png',
);
// Themed icons are tinted from this layer's alpha; only the shape matters.
await write(
  svg(432, mark(432, ADAPTIVE_FRACTION, '#ffffff')),
  IMAGES,
  'android-icon-monochrome.png',
);

// expo-splash-screen scales this down to `imageWidth`, so it is the bare mark
// on the graphite background configured in app.json.
await write(svg(512, mark(512, 0.9, 'url(#ring)')), IMAGES, 'splash-icon.png');

console.log(`icons written to ${path.relative(ROOT, IMAGES)}`);

if (!process.argv.includes('--preview')) {
  process.exit(0);
}

await mkdir(PREVIEW, { recursive: true });

const maskWith = (size, shape) => ({
  input: Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${shape}</svg>`,
  ),
  blend: 'dest-in',
});

// Small sizes are where an icon fails, so lay the real downscales out side by
// side rather than trusting the 1024 master.
{
  const sizes = [40, 60, 80, 120, 180];
  const pad = 24;
  const width = sizes.reduce((sum, size) => sum + size + pad, pad);
  const height = Math.max(...sizes) + pad * 2;

  let left = pad;
  const tiles = [];
  for (const size of sizes) {
    tiles.push({
      input: await sharp(path.join(IMAGES, 'icon.png'))
        .resize(size, size)
        .composite([
          maskWith(
            size,
            `<rect width="${size}" height="${size}" rx="${size * 0.2237}" />`,
          ),
        ])
        .png()
        .toBuffer(),
      left,
      top: Math.round((height - size) / 2),
    });
    left += size + pad;
  }

  await sharp({
    create: { width, height, channels: 4, background: '#ebecf0' },
  })
    .composite(tiles)
    .resize(width * 3, height * 3, { kernel: 'nearest' })
    .png()
    .toFile(path.join(PREVIEW, 'sizes.png'));
}

// The Android layers only tell the truth once composited and masked: a circle
// is the tightest common launcher shape, so it is what the safe area must
// survive.
{
  const size = 512;
  const flat = await sharp(path.join(IMAGES, 'android-icon-background.png'))
    .composite([{ input: path.join(IMAGES, 'android-icon-foreground.png') }])
    .png()
    .toBuffer();

  const shapes = [
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" />`,
    `<rect width="${size}" height="${size}" rx="${size * 0.28}" />`,
  ];
  const tiles = [];
  for (const [index, shape] of shapes.entries()) {
    tiles.push({
      input: await sharp(flat)
        .composite([maskWith(size, shape)])
        .png()
        .toBuffer(),
      left: 32 + index * (size + 32),
      top: 32,
    });
  }

  await sharp({
    create: {
      width: size * 2 + 96,
      height: size + 64,
      channels: 4,
      background: '#ebecf0',
    },
  })
    .composite(tiles)
    .png()
    .toFile(path.join(PREVIEW, 'android.png'));
}

console.log(`previews written to ${path.relative(ROOT, PREVIEW)}`);
