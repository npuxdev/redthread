import sharp from "sharp";

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InspectionView {
  data: string;
  mediaType: "image/jpeg";
  region: Region;
  gridStep: number | null;
  original: { width: number; height: number };
  rendered: { width: number; height: number };
}

const MAX_EDGE = 1568;

function decodeDataUrl(content: string): Buffer {
  const m = /^data:[^;,]+;base64,(.*)$/s.exec(content);
  if (!m) throw new Error("Image source content is not a base64 data URL");
  return Buffer.from(m[1]!, "base64");
}

export function clampRegion(r: Region | undefined): Region {
  if (!r) return { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.min(Math.max(r.x, 0), 1);
  const y = Math.min(Math.max(r.y, 0), 1);
  const w = Math.min(Math.max(r.w, 0.01), 1 - x);
  const h = Math.min(Math.max(r.h, 0.01), 1 - y);
  return { x, y, w, h };
}

function niceStep(span: number): number {
  const target = span / 6;
  return [0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2].find((s) => s >= target) ?? 0.2;
}

/** Grid lines and edge labels in normalized source coordinates, drawn over the rendered view. */
function gridSvg(region: Region, width: number, height: number, step: number): Buffer {
  const lines: string[] = [];
  const labels: string[] = [];
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : 1;
  const fmt = (v: number) => v.toFixed(decimals);
  const size = Math.max(14, Math.round(Math.max(width, height) / 70));
  const start = (from: number) => Math.ceil((from + 1e-9) / step) * step;
  for (let v = start(region.x); v < region.x + region.w - 1e-9; v += step) {
    const px = ((v - region.x) / region.w) * width;
    lines.push(`<line x1="${px}" y1="0" x2="${px}" y2="${height}"/>`);
    labels.push(`<text x="${px + 4}" y="${size + 2}">x ${fmt(v)}</text>`);
  }
  for (let v = start(region.y); v < region.y + region.h - 1e-9; v += step) {
    const py = ((v - region.y) / region.h) * height;
    lines.push(`<line x1="0" y1="${py}" x2="${width}" y2="${py}"/>`);
    labels.push(`<text x="4" y="${py - 4}">y ${fmt(v)}</text>`);
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <g stroke="#00e5ff" stroke-opacity="0.5" stroke-width="1" stroke-dasharray="6 8">${lines.join("")}</g>
      <g fill="#00e5ff" stroke="#000" stroke-width="3" paint-order="stroke" font-family="monospace" font-weight="bold" font-size="${size}">${labels.join("")}</g>
    </svg>`,
  );
}

/** Render the actual pixels of an image source, optionally cropped to a region, for a vision model. */
export async function renderForInspection(content: string, opts: { region?: Region | undefined; grid: boolean }): Promise<InspectionView> {
  const input = decodeDataUrl(content);
  const meta = await sharp(input, { failOn: "none" }).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error("Could not read image dimensions");
  const region = clampRegion(opts.region);
  const left = Math.floor(region.x * W);
  const top = Math.floor(region.y * H);
  const cw = Math.max(1, Math.min(W - left, Math.round(region.w * W)));
  const ch = Math.max(1, Math.min(H - top, Math.round(region.h * H)));
  const scale = Math.min(MAX_EDGE / Math.max(cw, ch), 4);
  const width = Math.max(1, Math.round(cw * scale));
  const height = Math.max(1, Math.round(ch * scale));
  let pipeline = sharp(input, { failOn: "none" })
    .extract({ left, top, width: cw, height: ch })
    .resize(width, height, { kernel: scale > 1 ? "lanczos3" : "mitchell" });
  const step = opts.grid ? niceStep(Math.max(region.w, region.h)) : null;
  if (step) pipeline = pipeline.composite([{ input: gridSvg(region, width, height, step), top: 0, left: 0 }]);
  const out = await pipeline.jpeg({ quality: 90 }).toBuffer();
  return {
    data: out.toString("base64"),
    mediaType: "image/jpeg",
    region,
    gridStep: step,
    original: { width: W, height: H },
    rendered: { width, height },
  };
}
