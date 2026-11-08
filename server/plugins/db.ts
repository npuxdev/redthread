import { runMigrations } from "@agent-native/core/db";

import { INVESTIGATION_MIGRATION_SQL } from "../db/migrations.js";

export default runMigrations(
  [{ version: 1, name: "investigation-model", sql: INVESTIGATION_MIGRATION_SQL }],
  { table: "redthread_app_migrations" },
);
