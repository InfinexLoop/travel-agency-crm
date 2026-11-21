CREATE TABLE customer_sales_assignments (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id),
  salesperson_id TEXT NOT NULL REFERENCES users(id)
) STRICT;

CREATE INDEX customer_sales_assignments_salesperson ON customer_sales_assignments(salesperson_id);

-- Legacy lead ownership cannot establish authority over a customer profile.
-- Existing portal sessions and links may have originated from such ownership.
DELETE FROM portal_links;
DELETE FROM requests WHERE action='portal.link';
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role='customer');
