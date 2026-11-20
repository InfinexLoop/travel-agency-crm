CREATE TABLE settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
) STRICT;
CREATE TABLE roles (
  id TEXT PRIMARY KEY, label TEXT NOT NULL
) STRICT;
CREATE TABLE customers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE, email TEXT UNIQUE,
  instagram TEXT UNIQUE, whatsapp TEXT, preferences TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL, role TEXT NOT NULL REFERENCES roles(id),
  customer_id TEXT REFERENCES customers(id), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  CHECK((role='customer')=(customer_id IS NOT NULL))
) STRICT;
CREATE TABLE sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TEXT NOT NULL
) STRICT;
CREATE TABLE portal_links (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TEXT NOT NULL
) STRICT;
CREATE TABLE packages (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, destination TEXT NOT NULL, category TEXT NOT NULL,
  nights INTEGER NOT NULL CHECK(nights >= 0), overview TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '',
  hotel TEXT NOT NULL DEFAULT '', meals TEXT NOT NULL DEFAULT '', transfers TEXT NOT NULL DEFAULT '',
  activities TEXT NOT NULL DEFAULT '', flights INTEGER NOT NULL DEFAULT 0 CHECK(flights IN (0,1)),
  inclusions TEXT NOT NULL DEFAULT '', exclusions TEXT NOT NULL DEFAULT '', cancellation TEXT NOT NULL DEFAULT '',
  base INTEGER NOT NULL CHECK(base >= 0), markup INTEGER NOT NULL CHECK(markup >= 0),
  valid_until TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
) STRICT;
CREATE TABLE package_days (
  package_id TEXT REFERENCES packages(id) ON DELETE CASCADE, position INTEGER CHECK(position > 0),
  title TEXT NOT NULL, description TEXT NOT NULL, PRIMARY KEY(package_id, position)
) STRICT;
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, destination TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
  terms TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', rate INTEGER NOT NULL DEFAULT 0 CHECK(rate>=0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
) STRICT;
CREATE TABLE package_suppliers (
  package_id TEXT REFERENCES packages(id), supplier_id TEXT REFERENCES suppliers(id), PRIMARY KEY(package_id,supplier_id)
) STRICT;
CREATE TABLE leads (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
  source TEXT NOT NULL, owner TEXT REFERENCES users(id), stage TEXT NOT NULL DEFAULT 'New',
  destination TEXT NOT NULL DEFAULT '', package_id TEXT REFERENCES packages(id),
  city TEXT NOT NULL DEFAULT '', dates TEXT NOT NULL DEFAULT '', flexible INTEGER NOT NULL DEFAULT 0,
  adults INTEGER NOT NULL DEFAULT 1 CHECK(adults >= 1), children INTEGER NOT NULL DEFAULT 0 CHECK(children >= 0),
  ages TEXT NOT NULL DEFAULT '', budget INTEGER NOT NULL DEFAULT 0 CHECK(budget >= 0),
  purpose TEXT NOT NULL DEFAULT '', preferences TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'Normal',
  follow_up TEXT, touched TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  merged_into TEXT REFERENCES leads(id), CHECK(merged_into IS NULL OR merged_into<>id)
) STRICT;
CREATE INDEX leads_customer ON leads(customer_id);
CREATE INDEX leads_owner_stage ON leads(owner,stage);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY, channel TEXT NOT NULL, identity TEXT NOT NULL DEFAULT '',
  lead_id TEXT REFERENCES leads(id), customer_id TEXT REFERENCES customers(id),
  owner TEXT REFERENCES users(id), status TEXT NOT NULL DEFAULT 'Automation',
  state TEXT NOT NULL DEFAULT '{}', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX conversations_lead ON conversations(lead_id);
CREATE TABLE messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id),
  direction TEXT NOT NULL CHECK(direction IN ('Inbound','Outbound','Internal')),
  body TEXT NOT NULL, actor TEXT REFERENCES users(id), automated INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX messages_conversation ON messages(conversation_id,created);
CREATE TABLE submissions (
  id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id),
  conversation_id TEXT NOT NULL REFERENCES conversations(id), payload TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE quotes (
  id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), customer_id TEXT NOT NULL REFERENCES customers(id),
  package_id TEXT REFERENCES packages(id), status TEXT NOT NULL DEFAULT 'Draft',
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), destination TEXT NOT NULL,
  departure TEXT NOT NULL, return_date TEXT NOT NULL CHECK(return_date>=departure),
  adults INTEGER NOT NULL CHECK(adults>=1), children INTEGER NOT NULL CHECK(children>=0),
  itinerary TEXT NOT NULL, cost INTEGER NOT NULL CHECK(cost>=0), markup INTEGER NOT NULL CHECK(markup>=0),
  discount INTEGER NOT NULL CHECK(discount>=0), extras INTEGER NOT NULL CHECK(extras>=0),
  tax INTEGER NOT NULL CHECK(tax>=0), total INTEGER NOT NULL CHECK(total>0 AND total=cost+markup+extras+tax-discount),
  advance INTEGER NOT NULL CHECK(advance>0 AND advance<=total), schedule TEXT NOT NULL DEFAULT '',
  expiry TEXT NOT NULL, terms TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  internal TEXT NOT NULL DEFAULT '', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX quotes_customer ON quotes(customer_id);
CREATE INDEX quotes_lead ON quotes(lead_id);
CREATE TABLE quote_revisions (
  quote_id TEXT REFERENCES quotes(id), version INTEGER CHECK(version>0), snapshot TEXT NOT NULL,
  actor TEXT REFERENCES users(id), created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(quote_id,version)
) STRICT;
CREATE TABLE bookings (
  id TEXT PRIMARY KEY, quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id),
  customer_id TEXT NOT NULL REFERENCES customers(id), destination TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending Advance', departure TEXT NOT NULL, return_date TEXT NOT NULL CHECK(return_date>=departure),
  itinerary TEXT NOT NULL, total INTEGER NOT NULL CHECK(total>0), cost INTEGER NOT NULL CHECK(cost>=0),
  advance INTEGER NOT NULL CHECK(advance>0 AND advance<=total), notes TEXT NOT NULL DEFAULT '',
  hotel TEXT NOT NULL DEFAULT '', flight TEXT NOT NULL DEFAULT '', transfer TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX bookings_customer ON bookings(customer_id,departure);
CREATE TABLE travellers (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), name TEXT NOT NULL,
  nationality TEXT NOT NULL DEFAULT '', birthday TEXT NOT NULL DEFAULT '', document_ref TEXT NOT NULL DEFAULT '',
  emergency TEXT NOT NULL DEFAULT '', assistance TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE TABLE booking_travellers (
  booking_id TEXT REFERENCES bookings(id), traveller_id TEXT REFERENCES travellers(id),
  PRIMARY KEY(booking_id,traveller_id)
) STRICT;
CREATE TABLE supplier_jobs (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id), service TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Requested' CHECK(status IN ('Requested','Confirmed','Cancelled')),
  cost INTEGER NOT NULL CHECK(cost>0), due TEXT NOT NULL, UNIQUE(booking_id,supplier_id,service)
) STRICT;
CREATE TABLE settlements (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES supplier_jobs(id), amount INTEGER NOT NULL CHECK(amount>0),
  actor TEXT NOT NULL REFERENCES users(id), created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE invoices (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE payments (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id), amount INTEGER NOT NULL CHECK(amount>0),
  method TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('Paid','Pending','Failed','Refunded')),
  parent TEXT REFERENCES payments(id), actor TEXT NOT NULL REFERENCES users(id),
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK((status='Refunded')=(parent IS NOT NULL))
) STRICT;
CREATE INDEX payments_booking ON payments(booking_id,status);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, booking_id TEXT REFERENCES bookings(id), lead_id TEXT REFERENCES leads(id),
  owner TEXT REFERENCES users(id), title TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'Normal',
  due TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In progress','Done')),
  trigger_key TEXT UNIQUE, CHECK(booking_id IS NOT NULL OR lead_id IS NOT NULL)
) STRICT;
CREATE INDEX tasks_owner_due ON tasks(owner,due,status);
CREATE TABLE documents (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), booking_id TEXT REFERENCES bookings(id),
  lead_id TEXT REFERENCES leads(id), traveller_id TEXT REFERENCES travellers(id), kind TEXT NOT NULL,
  name TEXT NOT NULL, mime TEXT, file_key TEXT, size INTEGER CHECK(size>=0), status TEXT NOT NULL DEFAULT 'Missing',
  due TEXT, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX documents_customer ON documents(customer_id,booking_id);
CREATE TABLE visas (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id),
  traveller_id TEXT REFERENCES travellers(id), status TEXT NOT NULL, due TEXT, notes TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE TABLE feedback (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), notes TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE workflows (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, template TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE TABLE events (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, summary TEXT NOT NULL, outcome TEXT NOT NULL DEFAULT 'Success',
  lead_id TEXT REFERENCES leads(id), booking_id TEXT REFERENCES bookings(id),
  conversation_id TEXT REFERENCES conversations(id), actor TEXT REFERENCES users(id),
  event_key TEXT UNIQUE, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX events_link ON events(lead_id,booking_id,conversation_id);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
  href TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, event_id TEXT REFERENCES events(id),
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,event_id)
) STRICT;
CREATE TABLE requests (
  key TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
  fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(key,user_id,action)
) STRICT;
