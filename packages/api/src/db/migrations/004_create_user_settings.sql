CREATE TABLE IF NOT EXISTS user_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  home_zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enforce singleton: only one row ever allowed (id must be TRUE)
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_singleton ON user_settings (id);

-- Seed the single row so GET always returns something
INSERT INTO user_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;
