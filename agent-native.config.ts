import { defineAgentNativeConfig } from "@agent-native/core/config";

export default defineAgentNativeConfig({
  changelog: { enabled: false },
  harness: true,
  instructions: { runtime: "AGENTS.md", development: "DEVELOPING.md" },
});
