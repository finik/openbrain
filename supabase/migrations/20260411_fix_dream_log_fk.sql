-- Drop foreign key on dream_log.thought_id
-- Dreaming deletes thoughts then logs the deletion — the FK blocks the insert.
-- The thought_id is an audit reference, not a live relationship.
ALTER TABLE dream_log DROP CONSTRAINT IF EXISTS dream_log_thought_id_fkey;
