-- Demo data. Every demo account's password is: Password123!
SET @pw = '$2b$10$B/ZgoifLFlBbfl5MazXpPuHW0n.UmDTTcs24GMNl3zMnhW7vvOp6a';

INSERT INTO users (id, role, full_name, email, phone, password_hash, city) VALUES
  (1, 'admin',    'SpinDrop Staff',  'admin@spindrop.ng',  '+2348030000000', @pw, 'Abuja'),
  (2, 'customer', 'Ada Obi',         'ada@demo.ng',        '+2348031111111', @pw, 'Abuja'),
  (3, 'rider',    'Musa Ibrahim',    'musa@demo.ng',       '+2348032222222', @pw, 'Abuja'),
  (4, 'cleaner',  'Grace Eze',       'grace@demo.ng',      '+2348033333333', @pw, 'Abuja'),
  (5, 'mover',    'Kunle Adebayo',   'kunle@demo.ng',      '+2348034444444', @pw, 'Abuja');

-- Laundry price list (wash + iron), in kobo.
INSERT INTO garment_types (name, group_name, price_kobo) VALUES
  ('Jeans',                    'Everyday',    500000),
  ('Shirt / Blouse (cotton)',  'Everyday',    200000),
  ('Skirt (cotton)',           'Everyday',    200000),
  ('Trousers / Pants (cotton)','Everyday',    200000),
  ('T-shirt / Polo',           'Everyday',    150000),
  ('Dress',                    'Everyday',    300000),
  ('Suit (2-piece)',           'Formal',      700000),
  ('Senator / Kaftan',         'Traditional', 400000),
  ('Agbada (3-piece)',         'Traditional', 800000),
  ('Bedsheet / Duvet cover',   'Household',   350000),
  ('Duvet / Blanket',          'Household',   600000),
  ('Curtain (per panel)',      'Household',   350000),
  ('Towel',                    'Household',   100000);

INSERT INTO service_options (service, code, label, price_kobo) VALUES
  ('cleaning', 'standard', 'Standard clean (per room)', 400000),
  ('cleaning', 'deep',     'Deep clean (per room)',     700000),
  ('moving',   'items',    'A few items',              1500000),
  ('moving',   'studio',   'Self-contain / studio',    3500000),
  ('moving',   '1bed',     '1-bedroom flat',           6000000),
  ('moving',   '2bed',     '2-bedroom flat',           9500000),
  ('moving',   '3bed',     '3-bedroom flat',          14000000);
