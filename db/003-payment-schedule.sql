ALTER TABLE quotes ADD COLUMN balance_due TEXT CHECK(balance_due IS NULL OR length(balance_due)=10);
ALTER TABLE bookings ADD COLUMN balance_due TEXT CHECK(balance_due IS NULL OR length(balance_due)=10);

UPDATE quotes SET balance_due=date(departure,'-7 days');
UPDATE bookings SET balance_due=date(departure,'-7 days');
