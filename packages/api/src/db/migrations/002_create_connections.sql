CREATE TABLE IF NOT EXISTS connections (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_zone_id   UUID        NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  to_zone_id     UUID        NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  conn_type      TEXT        NOT NULL,
  duration_hours REAL,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connections_from_zone_idx  ON connections (from_zone_id);
CREATE INDEX IF NOT EXISTS connections_to_zone_idx    ON connections (to_zone_id);
CREATE INDEX IF NOT EXISTS connections_expires_at_idx ON connections (expires_at);
