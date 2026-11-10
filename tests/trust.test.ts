import type { ActionCaller } from "@agent-native/core/action";
import { describe, expect, it } from "vitest";

import { actorFrom, requireInvestigator, requireSignedInUser } from "../server/lib/actor";
import { assertAuthEnabledOutsideDevelopment } from "../server/plugins/auth";

const CALLERS: ActionCaller[] = ["tool", "http", "frontend", "mcp-widget", "mcp-widget-write", "cli", "mcp", "webmcp", "a2a", "automation"];

describe("caller classification", () => {
  it("treats only a signed-in app UI caller as the investigator", () => {
    const humans = CALLERS.filter((caller) => actorFrom({ caller, userEmail: "a@b.test" }) === "human");
    expect(humans).toEqual(["frontend"]);
    expect(actorFrom({ caller: "frontend" })).toBe("agent");
    expect(actorFrom(undefined)).toBe("agent");
    expect(actorFrom({ caller: "something-new" as ActionCaller, userEmail: "a@b.test" })).toBe("agent");
  });

  it("guards investigator-only and destructive actions", () => {
    expect(() => requireInvestigator({}, { caller: "frontend", userEmail: "a@b.test" })).not.toThrow();
    expect(() => requireInvestigator({}, { caller: "tool", userEmail: "a@b.test" })).toThrow(/Only the signed-in investigator/);
    expect(() => requireInvestigator({}, { caller: "cli" })).toThrow();
    expect(() => requireSignedInUser({}, { caller: "tool", userEmail: "a@b.test" })).not.toThrow();
    expect(() => requireSignedInUser({}, { caller: "cli" })).toThrow(/signed-in user/);
  });
});

describe("AUTH_DISABLED", () => {
  it("is refused outside development and test", () => {
    expect(() => assertAuthEnabledOutsideDevelopment({ AUTH_DISABLED: "true", NODE_ENV: "production" })).toThrow(/AUTH_DISABLED/);
    expect(() => assertAuthEnabledOutsideDevelopment({ AUTH_DISABLED: "1" })).toThrow();
    expect(() => assertAuthEnabledOutsideDevelopment({ AUTH_DISABLED: "true", NODE_ENV: "development" })).not.toThrow();
    expect(() => assertAuthEnabledOutsideDevelopment({ NODE_ENV: "production" })).not.toThrow();
  });
});
