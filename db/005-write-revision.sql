CREATE TABLE crm_write_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL CONSTRAINT crm_revision_nonnegative CHECK (version >= 0)
);
INSERT INTO crm_write_revision (id, version) VALUES (1, 0);
