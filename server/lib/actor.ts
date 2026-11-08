import type { ActionRunContext } from "@agent-native/core/action";

import type { Actor } from "../../shared/investigation.js";

const AGENT_CALLERS = new Set(["tool", "mcp", "a2a", "automation"]);

export function actorFrom(ctx: Pick<ActionRunContext, "caller"> | undefined): Actor {
  return ctx && AGENT_CALLERS.has(ctx.caller) ? "agent" : "human";
}
