CREATE TABLE booking_adjustments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  actor TEXT NOT NULL REFERENCES users(id),
  prior_total INTEGER NOT NULL CHECK(prior_total > 0),
  new_total INTEGER NOT NULL CHECK(new_total > 0),
  prior_advance INTEGER NOT NULL CHECK(prior_advance > 0 AND prior_advance <= prior_total),
  new_advance INTEGER NOT NULL CHECK(new_advance > 0 AND new_advance <= new_total),
  reason TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(prior_total <> new_total OR prior_advance <> new_advance)
) STRICT;
CREATE INDEX booking_adjustments_booking ON booking_adjustments(booking_id, created);
