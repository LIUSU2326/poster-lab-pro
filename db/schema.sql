-- Poster Lab Pro local workspace persistence schema.
-- The app currently uses a typed repository boundary; this SQL file documents the
-- intended table shape for database-backed implementations.

create table if not exists workspaces (
  workspace_id text primary key,
  project_id text not null,
  active_mode text not null,
  revision integer not null,
  snapshot_json text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists workspace_assets (
  asset_id text primary key,
  workspace_id text not null references workspaces(workspace_id) on delete cascade,
  project_id text not null,
  role text not null,
  label text not null,
  preview_url text,
  metadata_json text not null default '{}',
  created_at text not null,
  updated_at text not null
);

create table if not exists workspace_results (
  result_id text primary key,
  workspace_id text not null references workspaces(workspace_id) on delete cascade,
  project_id text not null,
  scheme_id text not null,
  mode text not null,
  status text not null,
  result_file_json text not null default '{}',
  metadata_json text not null default '{}',
  created_at text not null,
  updated_at text not null
);

create table if not exists provider_configs (
  provider_id text not null,
  workspace_id text not null references workspaces(workspace_id) on delete cascade,
  enabled integer not null default 0,
  status text not null,
  api_key_masked text,
  base_url text,
  default_model text,
  model_slots_json text not null default '{}',
  updated_at text not null,
  primary key (workspace_id, provider_id)
);

create table if not exists archive_rows (
  archive_row_id text primary key,
  workspace_id text not null references workspaces(workspace_id) on delete cascade,
  project_id text not null,
  result_asset_id text not null,
  mode text not null,
  state text not null,
  metadata_json text not null default '{}',
  created_at text not null,
  updated_at text not null
);
