import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorFrom } from "../server/lib/actor.js";
import { loadState, recordInspection, resolveRef } from "../server/lib/store.js";
import { renderForInspection } from "../server/lib/vision.js";

export default defineAction({
  description: `Look at the actual pixels of an image source. The image is attached to this result for you to view.
- Start with the full image (omit region), then zoom by passing a region to examine small details; zooming is how fine features become visible.
- The grid overlay is labelled in normalized source coordinates (0–1, origin top-left), whatever the zoom; use it to cite regions. Pass grid:false to see the area unobstructed.
- Describe only what is visible. A title, provenance note or filename is not a visual observation. When a feature is too small, faint or ambiguous to judge, say so, zoom further, or record it as an interpretation with a confidence.
- Absence is an observation too: if a feature is not visible in a region, record that, citing the region.
Record findings with record-artifacts, citing { sourceId, region } on each image. Image citations are rejected for any image you have not inspected.`,
  schema: z.object({
    investigationId: z.string(),
    source: z.string().describe("Image source id or code (e.g. S-11)"),
    region: z
      .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
      .optional()
      .describe("Normalized 0..1 region to zoom into; omit for the full image"),
    grid: z.boolean().optional().describe("Overlay a coordinate grid (default true)"),
  }),
  http: false,
  run: async ({ investigationId, source, region, grid }, ctx) => {
    const state = await loadState(investigationId);
    const id = resolveRef(state, source);
    const s = state.sources.find((x) => x.id === id);
    if (!s) throw new Error(`Source ${source} not found`);
    if (s.kind !== "image") throw new Error(`${s.code} is a ${s.kind} source; read it with get-source`);
    const view = await renderForInspection(s.content, { region, grid: grid ?? true });
    await recordInspection(investigationId, s, view.region, actorFrom(ctx));
    const full = view.region.w === 1 && view.region.h === 1;
    return {
      source: { id: s.id, code: s.code },
      view: {
        region: view.region,
        original: view.original,
        rendered: view.rendered,
        zoom: Math.round((view.rendered.width / (view.region.w * view.original.width)) * 100) / 100,
        grid: view.gridStep ? `lines every ${view.gridStep} in source coordinates` : "none",
      },
      ifNoImageAttached: "Your model did not receive the image. Do not describe it; tell the investigator that image inspection needs a vision-capable model.",
      cite: full ? `{ sourceId: "${s.id}", region: { x, y, w, h } } read from the grid` : `{ sourceId: "${s.id}", region: ${JSON.stringify(view.region)} } or a tighter box read from the grid`,
      _agentImages: [{ data: view.data, mediaType: view.mediaType, label: `${s.code} ${full ? "full image" : "zoomed region"}` }],
    };
  },
});
