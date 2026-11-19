// Flat isometric bricks, drawn from numbers rather than exported from a
// drawing tool, so every illustration on the site shares one geometry and one
// palette and stays a few hundred bytes of markup.

export const TONES = {
  yellow: { top: '#ffd43b', left: '#f5b800', right: '#d99b00' },
  red: { top: '#ff6b57', left: '#e5432d', right: '#bf2f1c' },
  blue: { top: '#5b8cff', left: '#2f6bff', right: '#1f4fd1' },
  green: { top: '#3dd69c', left: '#19b37b', right: '#0e8e5f' },
  ink: { top: '#3a3f52', left: '#23263a', right: '#14161f' },
  cream: { top: '#fffdf5', left: '#ede7d3', right: '#d6ceb4' }
};

const U = 40;            // one stud of grid, in SVG units
const AX = U * 0.866;    // screen x per grid unit
const AY = U * 0.5;      // screen y per grid unit
const HZ = U * 0.4;      // screen y per unit of height (a plate)
const STUD_R = 0.3;
const STUD_H = 7;

const point = (x, y, z) => [(x - y) * AX, (x + y) * AY - z * HZ];
const poly = (...pts) => pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

/**
 * One brick: `w` studs along x, `d` along y, `h` plates tall, sitting with its
 * near-top corner at grid position (x, y, z).
 */
export const brick = ({ x = 0, y = 0, z = 0, w = 2, d = 2, h = 3, color = 'yellow', studs = true }) => {
  const tone = TONES[color] || TONES.yellow;
  const top = z + h;
  const faces = [
    { fill: tone.left, points: poly(point(x, y + d, top), point(x + w, y + d, top), point(x + w, y + d, z), point(x, y + d, z)) },
    { fill: tone.right, points: poly(point(x + w, y, top), point(x + w, y + d, top), point(x + w, y + d, z), point(x + w, y, z)) },
    { fill: tone.top, points: poly(point(x, y, top), point(x + w, y, top), point(x + w, y + d, top), point(x, y + d, top)) }
  ];

  const studList = [];
  if (studs) {
    const rx = STUD_R * AX * Math.SQRT2;
    const ry = STUD_R * AY * Math.SQRT2;
    for (let s = 0; s < w + d - 1; s++) {
      for (let i = 0; i < w; i++) {
        const j = s - i;
        if (j < 0 || j >= d) continue;
        const [cx, cy] = point(x + i + 0.5, y + j + 0.5, top);
        studList.push({ cx, cy, rx, ry, h: STUD_H, side: tone.left, top: tone.top, rim: tone.right });
      }
    }
  }

  const corners = [
    point(x, y, top), point(x + w, y, top), point(x, y + d, top), point(x + w, y + d, top),
    point(x, y + d, z), point(x + w, y + d, z), point(x + w, y, z)
  ];
  return { faces, studs: studList, corners };
};

/** Lay out a list of bricks and work out a viewBox that fits them. */
export const scene = (bricks, pad = 10) => {
  const drawn = bricks.map(brick);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  drawn.forEach(b => b.corners.forEach(([px, py]) => {
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py - STUD_H - 6); maxY = Math.max(maxY, py);
  }));
  return {
    bricks: drawn,
    viewBox: `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${(maxX - minX + pad * 2).toFixed(1)} ${(maxY - minY + pad * 2).toFixed(1)}`
  };
};

/** The scene as an SVG string, for b-html. */
export const sceneSVG = (bricks, { animate = false, label = '' } = {}) => {
  const drawn = scene(bricks);
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const groups = drawn.bricks.map((item, index) => {
    const faces = item.faces.map(f => `<polygon points="${f.points}" fill="${f.fill}"/>`).join('');
    const studs = item.studs.map(s =>
      `<path d="M${(s.cx - s.rx).toFixed(1)},${(s.cy - s.h).toFixed(1)} v${s.h} a${s.rx.toFixed(1)},${s.ry.toFixed(1)} 0 0 0 ${(s.rx * 2).toFixed(1)},0 v${-s.h} z" fill="${s.side}"/>` +
      `<ellipse cx="${s.cx.toFixed(1)}" cy="${(s.cy - s.h).toFixed(1)}" rx="${s.rx.toFixed(1)}" ry="${s.ry.toFixed(1)}" fill="${s.top}" stroke="${s.rim}" stroke-width="1.2"/>`
    ).join('');
    return `<g class="lg-iso-brick" style="--i:${index}">${faces}${studs}</g>`;
  }).join('');
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg class="lg-iso${animate ? ' is-animated' : ''}" viewBox="${drawn.viewBox}" xmlns="http://www.w3.org/2000/svg" ${a11y}>${groups}</svg>`;
};
