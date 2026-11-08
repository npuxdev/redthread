export const INVESTIGATION_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS rt_investigations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  case_slug TEXT,
  reconstruction TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rt_sources (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  code TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  media_type TEXT,
  provenance TEXT NOT NULL DEFAULT '{}',
  content_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rt_sources_inv_idx ON rt_sources (investigation_id);
CREATE TABLE IF NOT EXISTS rt_artifacts (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  epistemic TEXT NOT NULL,
  confidence INTEGER,
  status TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]',
  attrs TEXT NOT NULL DEFAULT '{}',
  review_flag TEXT,
  created_by TEXT NOT NULL,
  supersedes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rt_artifacts_inv_idx ON rt_artifacts (investigation_id);
CREATE TABLE IF NOT EXISTS rt_links (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  code TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  rationale TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  review_flag TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rt_links_inv_idx ON rt_links (investigation_id);
CREATE TABLE IF NOT EXISTS rt_assumptions (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  code TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '{}',
  rationale TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rt_assumptions_inv_idx ON rt_assumptions (investigation_id);
CREATE TABLE IF NOT EXISTS rt_instruments (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  code TEXT NOT NULL,
  method TEXT NOT NULL,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  rationale TEXT NOT NULL,
  bound_source_ids TEXT NOT NULL DEFAULT '[]',
  bound_artifact_ids TEXT NOT NULL DEFAULT '[]',
  assumption_ids TEXT NOT NULL DEFAULT '[]',
  params TEXT NOT NULL DEFAULT '{}',
  user_state TEXT NOT NULL DEFAULT '{}',
  agent_snapshot TEXT,
  extension_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rt_instruments_inv_idx ON rt_instruments (investigation_id);
CREATE TABLE IF NOT EXISTS rt_activity (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  target_ids TEXT NOT NULL DEFAULT '[]',
  before TEXT,
  after TEXT,
  reason TEXT,
  impact TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rt_activity_inv_idx ON rt_activity (investigation_id);
`;
