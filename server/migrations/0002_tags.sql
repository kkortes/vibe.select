-- The auto tags of each component's latest revision, one row per tag. They are
-- read off the markup once, at publish time, so component lists can count and
-- filter them through an index instead of reading every revision.
CREATE TABLE tags (
  namespace TEXT NOT NULL,
  slug TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (namespace, slug, tag),
  FOREIGN KEY (namespace, slug) REFERENCES components(namespace, slug) ON DELETE CASCADE
);

CREATE INDEX tags_by_tag ON tags (tag);

CREATE INDEX components_by_category ON components (category);
