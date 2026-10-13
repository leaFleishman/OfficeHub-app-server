CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role AS ENUM ('Employee', 'Manager', 'Admin');
CREATE TYPE booking_status AS ENUM ('Active', 'Cancelled');
CREATE TYPE inquiry_status AS ENUM ('Open', 'InProgress', 'Closed');

CREATE TABLE companies (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  floor       integer,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id     integer REFERENCES companies(id) ON DELETE RESTRICT,
  name           text NOT NULL,
  email          text NOT NULL,
  phone          text,
  password_hash  text NOT NULL,
  role           user_role NOT NULL DEFAULT 'Employee',
  is_blocked     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_company_required CHECK (role = 'Admin' OR company_id IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));
CREATE INDEX users_company_idx ON users (company_id);

CREATE TABLE rooms (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  capacity    integer NOT NULL CHECK (capacity > 0),
  floor       integer NOT NULL DEFAULT 0,
  equipment   text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The exclusion constraint is what makes double-booking impossible, even
-- under concurrent requests: the database itself rejects overlapping ranges.
CREATE TABLE bookings (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id       integer NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject       text NOT NULL,
  start_time    timestamptz NOT NULL,
  end_time      timestamptz NOT NULL,
  status        booking_status NOT NULL DEFAULT 'Active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  cancelled_at  timestamptz,
  CONSTRAINT bookings_time_order CHECK (end_time > start_time),
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status = 'Active')
);
CREATE INDEX bookings_user_start_idx ON bookings (user_id, start_time);
CREATE INDEX bookings_start_idx ON bookings (start_time);

CREATE TABLE inquiries (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject     text NOT NULL,
  content     text NOT NULL,
  status      inquiry_status NOT NULL DEFAULT 'Open',
  reply       text,
  handled_by  integer REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inquiries_user_idx ON inquiries (user_id, created_at DESC);
CREATE INDEX inquiries_status_idx ON inquiries (status, created_at);
