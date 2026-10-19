CREATE TABLE IF NOT EXISTS booking_participants (
  booking_id integer NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  PRIMARY KEY (booking_id, user_id)
);

CREATE INDEX IF NOT EXISTS booking_participants_user_booking_idx
  ON booking_participants (user_id, booking_id);
