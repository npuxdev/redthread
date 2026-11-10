import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

const authPlugin = createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  rootAuth: true,
  marketing: false,
});

/** AUTH_DISABLED runs every request as one shared dev account, so it must never reach a deployed server. */
export function assertAuthEnabledOutsideDevelopment(env: NodeJS.ProcessEnv = process.env) {
  const disabled = ["1", "true"].includes(env.AUTH_DISABLED?.trim().toLowerCase() ?? "");
  const development = env.NODE_ENV === "development" || env.NODE_ENV === "test";
  if (disabled && !development) {
    throw new Error(
      "AUTH_DISABLED is set outside development. Every visitor would act as the same signed-in investigator. Remove AUTH_DISABLED from this environment.",
    );
  }
}

export default (nitroApp: unknown) => {
  assertAuthEnabledOutsideDevelopment();
  return authPlugin(nitroApp);
};
