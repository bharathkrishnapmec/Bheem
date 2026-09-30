/** Tiny indexed-colour raster used to author procedural pixel art at "art resolution". */
export class PixelCanvas {
  readonly px: Int32Array;
  constructor(
    public readonly w: number,
    public readonly h: number,
  ) {
    this.px = new Int32Array(w * h).fill(-1);
  }

  set(x: number, y: number, c: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    this.px[iy * this.w + ix] = c;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.px[y * this.w + x]!;
  }

  rect(x: number, y: number, w: number, h: number, c: number): this {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (let j = 0; j < Math.round(h); j++) for (let i = 0; i < Math.round(w); i++) this.set(x0 + i, y0 + j, c);
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number, th = 1): this {
    let ax = Math.round(x0);
    let ay = Math.round(y0);
    const bx = Math.round(x1);
    const by = Math.round(y1);
    const dx = Math.abs(bx - ax);
    const dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 512; guard++) {
      if (th <= 1) this.set(ax, ay, c);
      else this.rect(ax - Math.floor((th - 1) / 2), ay - Math.floor((th - 1) / 2), th, th, c);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ax += sx;
      }
      if (e2 <= dx) {
        err += dx;
        ay += sy;
      }
    }
    return this;
  }

  disc(cx: number, cy: number, r: number, c: number): this {
    return this.ellipse(cx, cy, r, r, c);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: number): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / (rx + 0.35);
        const ny = (y - cy) / (ry + 0.35);
        if (nx * nx + ny * ny <= 1) this.set(x, y, c);
      }
    return this;
  }

  ring(cx: number, cy: number, r: number, c: number, th = 1): this {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r + 0.3 && d >= r - th + 0.3) this.set(x, y, c);
      }
    return this;
  }

  /** Convex polygon fill (scanline). */
  poly(pts: [number, number][], c: number): this {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys));
    const y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) {
          xs.push(a[0] + ((y + 0.5 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]!); x < Math.round(xs[k + 1]!); x++) this.set(x, y, c);
    }
    return this;
  }

  /** Adds a 1px outline around opaque pixels (4-neighbourhood). */
  outline(c: number, diagonal = false): this {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== -1) continue;
        const n =
          this.get(x - 1, y) !== -1 ||
          this.get(x + 1, y) !== -1 ||
          this.get(x, y - 1) !== -1 ||
          this.get(x, y + 1) !== -1 ||
          (diagonal &&
            (this.get(x - 1, y - 1) !== -1 ||
              this.get(x + 1, y - 1) !== -1 ||
              this.get(x - 1, y + 1) !== -1 ||
              this.get(x + 1, y + 1) !== -1));
        if (n) add.push(y * this.w + x);
      }
    for (const i of add) this.px[i] = c;
    return this;
  }

  /** Replace every opaque pixel with `c` (silhouettes, flashes). */
  silhouette(c: number): PixelCanvas {
    const o = new PixelCanvas(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) if (this.px[i] !== -1) o.px[i] = c;
    return o;
  }

  blit(src: PixelCanvas, ox: number, oy: number): this {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (c !== -1) this.set(ox + x, oy + y, c);
      }
    return this;
  }

  /** Rotate 90° counter-clockwise into a canvas of the same size, anchored bottom-centre (for "lying" frames). */
  lying(): PixelCanvas {
    const o = new PixelCanvas(this.w, this.h);
    let minX = this.w;
    let maxX = 0;
    let minY = this.h;
    let maxY = 0;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.get(x, y) !== -1) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
    const bw = maxY - minY + 1;
    const ox = Math.round(this.w / 2 - bw / 2);
    const oy = this.h - (maxX - minX + 1);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const c = this.get(x, y);
        if (c === -1) continue;
        // (x,y) -> (y, -x): head (small y) ends up on the left
        o.set(ox + (y - minY), oy + (maxX - x), c);
      }
    return o;
  }

  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, scale: number): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.px[y * this.w + x]!;
        if (c === -1) continue;
        ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
        ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
  }

  toCanvas(scale: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w * scale;
    c.height = this.h * scale;
    this.draw(c.getContext('2d')!, 0, 0, scale);
    return c;
  }
}

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Deterministic hash noise for texture authoring (no RNG state). */
export function hash2(x: number, y: number, seed = 1): number {
  let h = (x * 374761393 + y * 668265263 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
