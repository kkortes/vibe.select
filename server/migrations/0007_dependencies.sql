-- A component keeps its id wherever it lives, so whatever points at it by id
-- still finds it after it moves to another namespace.
ALTER TABLE components ADD COLUMN id TEXT;

UPDATE components SET id = lower(hex(randomblob(16)));

CREATE UNIQUE INDEX components_by_id ON components (id);

-- The components a revision renders inside it, a JSON array of their ids. It is
-- frozen with the revision, and read back as wherever those components are now.
ALTER TABLE revisions ADD COLUMN dependencies TEXT NOT NULL DEFAULT '[]';
