CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS zones_display_name_trgm ON zones USING GIN (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS zones_unique_name_trgm   ON zones USING GIN (unique_name  gin_trgm_ops);
