-- A component without a description holds an empty one, never NULL, so the
-- page renders nothing where a NULL would read as "null".
UPDATE components SET description = '' WHERE description IS NULL;
