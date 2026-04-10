-- Dream log table: structured dreaming process history
-- Each row = one action dreaming took on a thought (or a run-level summary)

CREATE TABLE IF NOT EXISTS dream_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date    date NOT NULL,
  step        smallint NOT NULL,        -- 0-4 for dreaming steps, -1 for run summary
  thought_id  uuid REFERENCES thoughts(id) ON DELETE SET NULL,
  action      text NOT NULL,            -- delete, merge, augment, keep, bump, create, insight, stale, promote, evict
  detail      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dream_log_run ON dream_log(run_date);
CREATE INDEX IF NOT EXISTS idx_dream_log_thought ON dream_log(thought_id);
CREATE INDEX IF NOT EXISTS idx_dream_log_action ON dream_log(action);
