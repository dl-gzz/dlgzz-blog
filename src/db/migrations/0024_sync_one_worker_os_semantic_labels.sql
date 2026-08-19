-- Normalize legacy brand text embedded in semantic-model display metadata.
-- Model IDs, keys, source tables, dimensions, metrics, and query contracts stay unchanged.

UPDATE "semantic_model"
SET
  "definition" = replace(replace(replace("definition"::text, 'OneWork OS', 'one-worker-os'), 'OneWorkOS', 'one-worker-os'), 'OneWorkerOS', 'one-worker-os')::jsonb,
  "updated_at" = now()
WHERE "definition"::text LIKE '%OneWork OS%'
   OR "definition"::text LIKE '%OneWorkOS%'
   OR "definition"::text LIKE '%OneWorkerOS%';
