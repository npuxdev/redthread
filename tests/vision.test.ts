import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { clampRegion, renderForInspection } from "../server/lib/vision";

async function dataUrl(width: number, height: number) {
  const png = await sharp({ create: { width, height, channels: 3, background: { r: 40, g: 80, b: 120 } } })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

describe("image inspection rendering", () => {
  it("returns real pixels of the full image with its true dimensions", async () => {
    const view = await renderForInspection(await dataUrl(400, 300), { grid: true });
    expect(view.original).toEqual({ width: 400, height: 300 });
    expect(view.region).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    const meta = await sharp(Buffer.from(view.data, "base64")).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([view.rendered.width, view.rendered.height]);
    expect(view.gridStep).toBe(0.2);
  });

  it("zooms a region to a larger rendering with a finer grid", async () => {
    const view = await renderForInspection(await dataUrl(400, 300), { region: { x: 0.25, y: 0.25, w: 0.1, h: 0.1 }, grid: true });
    expect(view.rendered.width).toBe(160);
    expect(view.gridStep).toBeLessThan(0.05);
  });

  it("clamps regions to the image", () => {
    expect(clampRegion({ x: -1, y: 0.9, w: 5, h: 5 })).toEqual({ x: 0, y: 0.9, w: 1, h: expect.closeTo(0.1, 6) });
  });
});
