ALTER TABLE sessions ADD COLUMN sign_in TEXT NOT NULL DEFAULT 'password'
  CHECK(sign_in IN ('password','quick','portal-link','demo-portal-link'));

-- Existing demo installations already have the admin role. Fresh databases
-- provision the preview account when seeding the rest of their demo users.
INSERT INTO users (id,name,email,hash,role)
SELECT 'USR-DEMO-OWNER','Demo Owner','demo-owner@zuri.demo',
  lower(hex(randomblob(16)))||':'||lower(hex(randomblob(64))),'admin'
WHERE EXISTS (SELECT 1 FROM roles WHERE id='admin')
  AND EXISTS (SELECT 1 FROM settings WHERE key='seed_version' AND value='1');
