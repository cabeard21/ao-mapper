CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS zones (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  unique_name  TEXT        NOT NULL UNIQUE,
  display_name TEXT        NOT NULL,
  tier         INT         NOT NULL DEFAULT 0,
  zone_type    TEXT        NOT NULL DEFAULT 'unknown',
  city_distance JSONB      NOT NULL DEFAULT '[]',
  resources    JSONB        NOT NULL DEFAULT '[]',
  metadata     JSONB        NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zones_unique_name_idx ON zones (unique_name);
CREATE INDEX IF NOT EXISTS zones_zone_type_idx   ON zones (zone_type);
CREATE INDEX IF NOT EXISTS zones_tier_idx        ON zones (tier);
