import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";

import { loadState, unreviewedActivity } from "../server/lib/store.js";

export default defineAction({
  description:
    "Read what the investigator is looking at: the open investigation, the active instrument, the selected item, and how many of their changes you have not reviewed. Basic navigation is already in <current-screen>; use this for a fresh read.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = (await readAppState("navigation")) as Record<string, unknown> | null;
    if (!navigation) return "No application state found. Is the app running?";
    const screen: Record<string, unknown> = { navigation };
    const investigationId = typeof navigation.investigationId === "string" ? navigation.investigationId : null;
    if (investigationId) {
      try {
        const state = await loadState(investigationId);
        const pending = await unreviewedActivity(investigationId);
        const find = (id: unknown) =>
          [...state.sources, ...state.artifacts, ...state.links, ...state.instruments].find((x) => x.id === id);
        const active = find(navigation.instrumentId);
        const selected = find(navigation.selectedId);
        screen.investigation = {
          id: state.investigation.id,
          title: state.investigation.title,
          question: state.investigation.question,
          sources: state.sources.length,
          artifacts: state.artifacts.length,
          instruments: state.instruments.map((i) => `${i.code} ${i.method}: ${i.title}`),
        };
        if (active) screen.activeInstrument = { id: active.id, code: active.code };
        if (selected) screen.selected = { id: selected.id, code: selected.code };
        screen.unreviewedChanges = pending.filter((p) => p.actor !== "agent").length;
      } catch {
        screen.investigation = null;
      }
    }
    return screen;
  },
});
