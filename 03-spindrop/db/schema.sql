-- SpinDrop database schema (MySQL 8 / MariaDB 10.6+). Money in kobo (100 kobo = NGN 1).

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS booking_events;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS laundry_items;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS garment_types;
DROP TABLE IF EXISTS service_options;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role           ENUM('customer','rider','cleaner','mover','admin') NOT NULL,
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL UNIQUE,
  phone          VARCHAR(20)  NOT NULL UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,
  city           VARCHAR(80)  NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Laundry price list, graded by garment type.
CREATE TABLE garment_types (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  group_name  VARCHAR(40)  NOT NULL,          -- e.g. Everyday, Traditional, Household
  price_kobo  INT UNSIGNED NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fixed-price options for cleaning (priced per room) and moving (priced per move size).
CREATE TABLE service_options (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service     ENUM('cleaning','moving') NOT NULL,
  code        VARCHAR(40)  NOT NULL,
  label       VARCHAR(80)  NOT NULL,
  price_kobo  INT UNSIGNED NOT NULL,          -- cleaning: per room; moving: per move
  UNIQUE KEY uq_service_code (service, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bookings (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference      VARCHAR(20)  NOT NULL UNIQUE,
  customer_id    INT UNSIGNED NOT NULL,
  type           ENUM('laundry','cleaning','moving') NOT NULL,
  status         VARCHAR(30)  NOT NULL,
  city           VARCHAR(80)  NOT NULL,
  address        VARCHAR(255) NOT NULL,        -- pickup / service / moving-from address
  to_address     VARCHAR(255) NULL,            -- moving destination
  option_code    VARCHAR(40)  NULL,            -- cleaning type or move size
  rooms          TINYINT UNSIGNED NULL,
  is_express     TINYINT(1) NOT NULL DEFAULT 0,
  scheduled_for  DATETIME NOT NULL,
  notes          VARCHAR(500) NULL,
  subtotal_kobo  INT UNSIGNED NOT NULL,
  fee_kobo       INT UNSIGNED NOT NULL,        -- express surcharge + pickup/delivery fee
  total_kobo     INT UNSIGNED NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_id) REFERENCES users(id),
  INDEX idx_bookings_type_status (type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE laundry_items (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id        INT UNSIGNED NOT NULL,
  garment_type_id   INT UNSIGNED NOT NULL,
  name              VARCHAR(80)  NOT NULL,     -- price snapshot
  unit_price_kobo   INT UNSIGNED NOT NULL,
  quantity          SMALLINT UNSIGNED NOT NULL,
  line_total_kobo   INT UNSIGNED NOT NULL,
  CONSTRAINT fk_items_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_garment FOREIGN KEY (garment_type_id) REFERENCES garment_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Work offered to providers. A laundry order creates a pickup job, then a delivery job once it is ready.
CREATE TABLE jobs (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id     INT UNSIGNED NOT NULL,
  kind           ENUM('laundry_pickup','laundry_delivery','cleaning','moving') NOT NULL,
  provider_role  ENUM('rider','cleaner','mover') NOT NULL,
  status         ENUM('open','accepted','completed','cancelled') NOT NULL DEFAULT 'open',
  provider_id    INT UNSIGNED NULL,
  payout_kobo    INT UNSIGNED NOT NULL,
  accepted_at    DATETIME NULL,
  completed_at   DATETIME NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_job_booking_kind (booking_id, kind),
  CONSTRAINT fk_jobs_booking  FOREIGN KEY (booking_id)  REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_jobs_provider FOREIGN KEY (provider_id) REFERENCES users(id),
  INDEX idx_jobs_role_status (provider_role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tracking timeline shown to the customer.
CREATE TABLE booking_events (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id  INT UNSIGNED NOT NULL,
  status      VARCHAR(30)  NOT NULL,
  note        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
