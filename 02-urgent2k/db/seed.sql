-- Demo data. Every demo account's password is: Password123!
SET @pw = '$2b$10$B/ZgoifLFlBbfl5MazXpPuHW0n.UmDTTcs24GMNl3zMnhW7vvOp6a';

INSERT INTO categories (id, name, slug, icon) VALUES
  (1, 'Cleaning',               'cleaning',  '🧹'),
  (2, 'Errands & Deliveries',   'errands',   '🛵'),
  (3, 'Handyman & Repairs',     'handyman',  '🔧'),
  (4, 'Moving Help',            'moving',    '📦'),
  (5, 'Laundry & Ironing',      'laundry',   '👕'),
  (6, 'Generator & Electrical', 'electrical','⚡'),
  (7, 'Event Help',             'events',    '🎉'),
  (8, 'Queue & Pickup Service', 'queue',     '🧾');

INSERT INTO users (id, role, full_name, email, phone, password_hash, city) VALUES
  (1, 'customer', 'Ada Obi',         'ada@demo.ng',     '+2348031111111', @pw, 'Abuja'),
  (2, 'customer', 'Tunde Bello',     'tunde@demo.ng',   '+2348032222222', @pw, 'Lagos'),
  (3, 'tasker',   'Emeka Nwosu',     'emeka@demo.ng',   '+2348033333333', @pw, 'Abuja'),
  (4, 'tasker',   'Zainab Musa',     'zainab@demo.ng',  '+2348034444444', @pw, 'Abuja'),
  (5, 'tasker',   'Chidi Okafor',    'chidi@demo.ng',   '+2348035555555', @pw, 'Lagos');

INSERT INTO tasker_profiles (user_id, bio, rating_total, rating_count, jobs_completed) VALUES
  (3, 'Electrician and generator repairer with 6 years experience. Fast and neat.', 23, 5, 5),
  (4, 'Reliable cleaner and errand runner. I treat your home like mine.',          28, 6, 6),
  (5, 'Strong and careful mover. I also help with event setup.',                   13, 3, 3);

INSERT INTO tasker_categories (user_id, category_id) VALUES
  (3, 3), (3, 6),
  (4, 1), (4, 2), (4, 5), (4, 8),
  (5, 4), (5, 7), (5, 2);

INSERT INTO tasks (customer_id, category_id, title, description, city, area, address, budget_kobo, is_urgent) VALUES
  (1, 6, 'Generator not starting',       'My 3.5kVA generator refuses to start since yesterday. Need someone to check it today.', 'Abuja', 'Wuse 2',   '14 Adetokunbo Ademola Crescent', 1000000, 1),
  (1, 1, 'Deep clean 2-bedroom flat',    'End-of-tenancy deep clean: kitchen, 2 bathrooms, windows.',                             'Abuja', 'Gwarinpa', '3rd Avenue, House 21',            2500000, 0),
  (2, 4, 'Help moving a few items',      'Need two strong hands to move a fridge, bed and boxes to the next street.',            'Lagos', 'Yaba',     '12 Herbert Macaulay Way',         1500000, 0),
  (1, 8, 'Collect passport at office',   'Please queue and collect my document at the office and bring it to me.',              'Abuja', 'Garki',    'Area 11, Garki',                  500000,  1);
