-- Open Brain schema enhancement: title, FTS, indexes, hybrid search
-- Run via Supabase SQL editor or supabase db push
-- Backup thoughts table before running: see ~/.jarvis/backups/

-- Ensure pgvector extension is available in this context
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
SET search_path TO public, extensions;

-- 1. Title column for progressive disclosure
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS title TEXT;

-- 2. Full-text search vector column
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Auto-populate search_vector from title + content
CREATE OR REPLACE FUNCTION thoughts_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS thoughts_search_vector_trigger ON thoughts;
CREATE TRIGGER thoughts_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, content ON thoughts
  FOR EACH ROW EXECUTE FUNCTION thoughts_search_vector_update();

-- GIN index on search_vector for FTS queries
CREATE INDEX IF NOT EXISTS idx_thoughts_search_vector ON thoughts USING GIN (search_vector);

-- 3. GIN index on metadata for JSONB containment queries (type, topics, people filters)
CREATE INDEX IF NOT EXISTS idx_thoughts_metadata ON thoughts USING GIN (metadata);

-- 4. B-tree indexes on timestamps
CREATE INDEX IF NOT EXISTS idx_thoughts_created_at ON thoughts (created_at);
CREATE INDEX IF NOT EXISTS idx_thoughts_updated_at ON thoughts (updated_at);

-- 5. Vector index on embedding — skipped for now.
-- pgvector operator class not available on this Supabase instance.
-- At <200 thoughts sequential scan is fine. Revisit at ~1000+.

-- 6. FTS search RPC
CREATE OR REPLACE FUNCTION fts_thoughts(
  query_text text,
  match_count int DEFAULT 10,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (id uuid, title text, content text, metadata jsonb, created_at timestamptz, rank real)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.title, t.content, t.metadata, t.created_at,
         ts_rank(t.search_vector, websearch_to_tsquery('english', query_text)) AS rank
  FROM thoughts t
  WHERE t.search_vector @@ websearch_to_tsquery('english', query_text)
    AND (filter = '{}'::jsonb OR t.metadata @> filter)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;

-- 7. Updated match_thoughts: now uses filter param and returns title
-- Must DROP first because return type changed (added title column)
DROP FUNCTION IF EXISTS match_thoughts(vector(1536), float, int, jsonb);
CREATE OR REPLACE FUNCTION match_thoughts(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (id uuid, title text, content text, metadata jsonb, similarity float, created_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.title, t.content, t.metadata,
         (1 - (t.embedding <=> query_embedding))::float AS similarity,
         t.created_at
  FROM thoughts t
  WHERE (1 - (t.embedding <=> query_embedding)) > match_threshold
    AND (filter = '{}'::jsonb OR t.metadata @> filter)
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 8. Backfill search_vector for existing rows
UPDATE thoughts SET search_vector = to_tsvector('english',
  coalesce(title, '') || ' ' || coalesce(content, ''));
