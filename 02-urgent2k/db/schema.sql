-- Urgent2k database schema (MySQL 8 / MariaDB 10.6+)
-- Money is stored as integers in kobo (100 kobo = NGN 1).

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS tasker_categories;
DROP TABLE IF EXISTS tasker_profiles;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role           ENUM('customer','tasker') NOT NULL,
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL UNIQUE,
  phone          VARCHAR(20)  NOT NULL UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,
  city           VARCHAR(80)  NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE categories (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(80) NOT NULL,
  slug  VARCHAR(80) NOT NULL UNIQUE,
  icon  VARCHAR(8)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tasker_profiles (
  user_id         INT UNSIGNED PRIMARY KEY,
  bio             VARCHAR(500) NULL,
  rating_total    INT UNSIGNED NOT NULL DEFAULT 0,   -- sum of star ratings
  rating_count    INT UNSIGNED NOT NULL DEFAULT 0,
  jobs_completed  INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tasker_categories (
  user_id      INT UNSIGNED NOT NULL,
  category_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, category_id),
  CONSTRAINT fk_tc_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tc_category FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tasks (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id         INT UNSIGNED NOT NULL,
  category_id         INT UNSIGNED NOT NULL,
  title               VARCHAR(120) NOT NULL,
  description         VARCHAR(1000) NOT NULL,
  city                VARCHAR(80)  NOT NULL,
  area                VARCHAR(80)  NOT NULL,           -- shown publicly, e.g. "Wuse 2"
  address             VARCHAR(255) NOT NULL,           -- only shown to the assigned tasker
  budget_kobo         INT UNSIGNED NOT NULL,
  is_urgent           TINYINT(1) NOT NULL DEFAULT 0,
  scheduled_for       DATETIME NULL,
  status              ENUM('open','assigned','completed','confirmed','cancelled') NOT NULL DEFAULT 'open',
  assigned_tasker_id  INT UNSIGNED NULL,
  agreed_price_kobo   INT UNSIGNED NULL,
  platform_fee_kobo   INT UNSIGNED NULL,
  tasker_payout_kobo  INT UNSIGNED NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tasks_customer FOREIGN KEY (customer_id) REFERENCES users(id),
  CONSTRAINT fk_tasks_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_tasks_tasker   FOREIGN KEY (assigned_tasker_id) REFERENCES users(id),
  INDEX idx_tasks_status_city (status, city),
  INDEX idx_tasks_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE offers (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id     INT UNSIGNED NOT NULL,
  tasker_id   INT UNSIGNED NOT NULL,
  price_kobo  INT UNSIGNED NOT NULL,
  message     VARCHAR(500) NOT NULL,
  status      ENUM('pending','accepted','declined','withdrawn') NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_offer_task_tasker (task_id, tasker_id),
  CONSTRAINT fk_offers_task   FOREIGN KEY (task_id)   REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_offers_tasker FOREIGN KEY (tasker_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Simulated escrow: money is "held" when an offer is accepted and "released" to the tasker
-- when the customer confirms the job, or "refunded" if the task is cancelled.
CREATE TABLE payments (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id      INT UNSIGNED NOT NULL UNIQUE,
  amount_kobo  INT UNSIGNED NOT NULL,
  status       ENUM('held','released','refunded') NOT NULL DEFAULT 'held',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reviews (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id      INT UNSIGNED NOT NULL UNIQUE,
  customer_id  INT UNSIGNED NOT NULL,
  tasker_id    INT UNSIGNED NOT NULL,
  rating       TINYINT UNSIGNED NOT NULL,
  comment      VARCHAR(500) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reviews_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_tasker FOREIGN KEY (tasker_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
