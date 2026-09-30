-- Demo data. Every demo account's password is: Password123!
SET @pw = '$2b$10$B/ZgoifLFlBbfl5MazXpPuHW0n.UmDTTcs24GMNl3zMnhW7vvOp6a';

-- Fixed-price packages. Premium = 22 working days x meals per day x meal value.
INSERT INTO packages (id, code, name, description, includes_dinner, meal_value_kobo, monthly_premium_kobo) VALUES
  (1, 'basic',    'Basic Lunch',          'One lunch a day worth NGN 2,500',                0, 250000,  5500000),
  (2, 'standard', 'Standard Lunch',       'One lunch a day worth NGN 3,500',                0, 350000,  7700000),
  (3, 'premium',  'Premium Lunch + Dinner','Lunch and dinner every working day, NGN 3,500 each', 1, 350000, 15400000);

INSERT INTO companies (id, name, city, package_id) VALUES
  (1, 'Kora Tech Ltd',        'Abuja', 2),
  (2, 'Greenleaf Logistics',  'Abuja', 3);

INSERT INTO restaurants (id, name, address, city) VALUES
  (1, 'Jollof Junction',        '21 Aminu Kano Crescent, Wuse 2', 'Abuja'),
  (2, 'Mama Nkechi''s Kitchen', 'Plot 5, Ademola Adetokunbo Crescent', 'Abuja');

INSERT INTO users (id, role, full_name, email, phone, password_hash, company_id, restaurant_id) VALUES
  (1, 'admin',      'ChowPass Ops',     'admin@chowpass.ng',  '+2348030000000', @pw, NULL, NULL),
  (2, 'hr',         'Ngozi Eze',        'hr@demo.ng',         '+2348031111111', @pw, 1, NULL),
  (3, 'staff',      'Ada Obi',          'ada@demo.ng',        '+2348032222222', @pw, 1, NULL),
  (4, 'staff',      'Tunde Bello',      'tunde@demo.ng',      '+2348033333333', @pw, 1, NULL),
  (5, 'staff',      'Zainab Musa',      'zainab@demo.ng',     '+2348034444444', @pw, 1, NULL),
  (6, 'restaurant', 'Chika Okafor',     'kitchen@demo.ng',    '+2348035555555', @pw, NULL, 1),
  (7, 'restaurant', 'Nkechi Ibe',       'nkechi@demo.ng',     '+2348036666666', @pw, NULL, 2),
  (8, 'hr',         'Bola Ade',         'hr@greenleaf.demo',  '+2348037777777', @pw, 2, NULL),
  (9, 'staff',      'Emeka Nwosu',      'emeka@greenleaf.demo','+2348038888888', @pw, 2, NULL);

-- A few meals already served earlier this month (for the dashboards).
INSERT INTO meal_codes (code, staff_id, company_id, meal_date, meal_type, expires_at, redeemed_at, restaurant_id, value_kobo)
SELECT c.code, c.staff_id, c.company_id, c.meal_date, c.meal_type,
       ADDTIME(CAST(c.meal_date AS DATETIME), IF(c.meal_type = 'lunch', '15:00:00', '20:00:00')),
       ADDTIME(CAST(c.meal_date AS DATETIME), IF(c.meal_type = 'lunch', '12:15:00', '18:40:00')),
       c.restaurant_id, c.value_kobo
FROM (
  SELECT 'HIST01' AS code, 3 AS staff_id, 1 AS company_id, DATE_SUB(CURDATE(), INTERVAL 1 DAY) AS meal_date, 'lunch' AS meal_type, 1 AS restaurant_id, 350000 AS value_kobo
  UNION ALL SELECT 'HIST02', 4, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'lunch', 2, 350000
  UNION ALL SELECT 'HIST03', 3, 1, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'lunch', 1, 350000
  UNION ALL SELECT 'HIST04', 9, 2, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'lunch', 1, 350000
  UNION ALL SELECT 'HIST05', 9, 2, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'dinner', 1, 350000
) c
WHERE MONTH(c.meal_date) = MONTH(CURDATE());
