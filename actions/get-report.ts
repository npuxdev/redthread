import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { assembleReport } from "../server/lib/report.js";
import { loadState } from "../server/lib/store.js";

export default defineAction({
  description:
    "The current evidence-grounded reconstruction, assembled from investigation state: established observations, interpretations, disputed and disproven items, open questions, active assumptions, violated orderings and recommendations.",
  schema: z.object({ investigationId: z.string() }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ investigationId }) => assembleReport(await loadState(investigationId)),
});
