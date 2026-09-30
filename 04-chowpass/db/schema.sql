-- ChowPass database schema (MySQL 8 / MariaDB 10.6+). Money in kobo (100 kobo = NGN 1).
-- Business model (like an HMO): companies pay a fixed monthly premium per active staff member;
-- restaurants are paid a fixed meal value for every meal they serve.

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS meal_codes;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS restaurants;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS packages;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE packages (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code                  VARCHAR(20)  NOT NULL UNIQUE,
  name                  VARCHAR(60)  NOT NULL,
  description           VARCHAR(255) NOT NULL,
  includes_dinner       TINYINT(1)   NOT NULL DEFAULT 0,
  meal_value_kobo       INT UNSIGNED NOT NULL,   -- what the restaurant receives per meal
  monthly_premium_kobo  INT UNSIGNED NOT NULL    -- what the company pays per staff per month
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE companies (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  city        VARCHAR(80)  NOT NULL,
  package_id  INT UNSIGNED NOT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_companies_package FOREIGN KEY (package_id) REFERENCES packages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE restaurants (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  address     VARCHAR(255) NOT NULL,
  city        VARCHAR(80)  NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role           ENUM('hr','staff','restaurant','admin') NOT NULL,
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL UNIQUE,
  phone          VARCHAR(20)  NOT NULL UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,
  company_id     INT UNSIGNED NULL,      -- hr and staff
  restaurant_id  INT UNSIGNED NULL,      -- restaurant users
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_company    FOREIGN KEY (company_id)    REFERENCES companies(id),
  CONSTRAINT fk_users_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  INDEX idx_users_company (company_id, role, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One code per staff member per meal per day. It becomes a "redemption" once a restaurant uses it.
CREATE TABLE meal_codes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code           CHAR(6)      NOT NULL,
  staff_id       INT UNSIGNED NOT NULL,
  company_id     INT UNSIGNED NOT NULL,
  meal_date      DATE         NOT NULL,
  meal_type      ENUM('lunch','dinner') NOT NULL,
  expires_at     DATETIME     NOT NULL,      -- UTC
  redeemed_at    DATETIME     NULL,          -- UTC
  restaurant_id  INT UNSIGNED NULL,
  value_kobo     INT UNSIGNED NULL,          -- meal value paid to the restaurant (set on redemption)
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_one_meal (staff_id, meal_date, meal_type),
  UNIQUE KEY uq_code_day (code, meal_date),
  CONSTRAINT fk_codes_staff      FOREIGN KEY (staff_id)      REFERENCES users(id),
  CONSTRAINT fk_codes_company    FOREIGN KEY (company_id)    REFERENCES companies(id),
  CONSTRAINT fk_codes_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  INDEX idx_codes_restaurant (restaurant_id, meal_date),
  INDEX idx_codes_company (company_id, meal_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
