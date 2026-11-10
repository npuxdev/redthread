import { type ActionRunContext, fail } from "@agent-native/core/action";

import type { Actor } from "../../shared/investigation.js";

type CallerContext = Pick<ActionRunContext, "caller" | "userEmail"> | undefined;

/**
 * The investigator is a signed-in user acting through the app UI. Every other
 * caller (agent tools, MCP, A2A, automations, the CLI, direct HTTP clients, and
 * any caller type added later) is treated as the agent, so its work stays
 * proposed until the investigator accepts it.
 */
export function isInvestigator(ctx: CallerContext): boolean {
  return ctx?.caller === "frontend" && !!ctx.userEmail;
}

export function actorFrom(ctx: CallerContext): Actor {
  return isInvestigator(ctx) ? "human" : "agent";
}

/** `authorize` guard for decisions reserved to the investigator, such as accepting findings. */
export function requireInvestigator(_args: unknown, ctx?: ActionRunContext) {
  if (!isInvestigator(ctx)) {
    fail("Only the signed-in investigator can make this decision, from the app.", { errorCode: "investigator_only", statusCode: 403 });
  }
}

/** `authorize` guard for destructive actions: some authenticated person must be behind the call. */
export function requireSignedInUser(_args: unknown, ctx?: ActionRunContext) {
  if (!ctx?.userEmail) fail("A signed-in user is required.", { errorCode: "sign_in_required", statusCode: 401 });
}
