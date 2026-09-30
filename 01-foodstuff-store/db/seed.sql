-- Sample data for local development and demos. Prices are illustrative, not live market prices.

INSERT INTO categories (id, name, slug) VALUES
  (1, 'Rice & Grains',       'rice-grains'),
  (2, 'Beans & Legumes',     'beans-legumes'),
  (3, 'Tubers & Swallow',    'tubers-swallow'),
  (4, 'Cooking Oils',        'cooking-oils'),
  (5, 'Soup Ingredients',    'soup-ingredients'),
  (6, 'Fresh Produce',       'fresh-produce'),
  (7, 'Pantry & Provisions', 'pantry-provisions');

-- price_kobo = naira x 100
INSERT INTO products (category_id, name, description, unit, price_kobo, stock) VALUES
  (1, 'Local Parboiled Rice',      'Stone-free, well-polished Nigerian rice.',                '50kg bag',       9500000, 25),
  (1, 'Local Parboiled Rice',      'Smaller bag of stone-free Nigerian rice.',                '25kg bag',       4900000, 40),
  (1, 'Yellow Maize (Corn)',       'Dry yellow maize for pap, tuwo or feed.',                 'paint bucket',    450000, 60),
  (1, 'Spaghetti',                 'Carton of 500g spaghetti packs.',                         'carton (20)',    1950000, 30),
  (2, 'Honey Beans (Oloyin)',      'Sweet brown beans, handpicked and clean.',                'paint bucket',    950000, 50),
  (2, 'White Beans (Olotu)',       'Clean white beans, ideal for moi moi and akara.',         'paint bucket',    850000, 45),
  (3, 'White Garri (Ijebu)',       'Crisp, sour Ijebu garri.',                                'paint bucket',    450000, 80),
  (3, 'Yellow Garri',              'Palm-oil garri, smooth for eba.',                         'paint bucket',    500000, 70),
  (3, 'Yam Tuber',                 'Large, fresh Abuja yam tuber.',                           '1 tuber',         350000, 100),
  (3, 'Semovita',                  'Semolina for swallow.',                                   '10kg bag',       1400000, 35),
  (4, 'Palm Oil',                  'Pure, fresh red palm oil.',                               '5 litres',       1200000, 40),
  (4, 'Groundnut Oil',             'Clean, double-refined groundnut oil.',                    '5 litres',       1650000, 40),
  (5, 'Ground Egusi',              'Peeled, ground melon seeds.',                             '1 kg',            600000, 50),
  (5, 'Crayfish',                  'Clean, dried crayfish.',                                  '1 kg',            850000, 30),
  (5, 'Stockfish Pieces',          'Dried stockfish, cut into pieces.',                       '500 g',           900000, 20),
  (6, 'Onions',                    'Fresh red onions.',                                       'small bag',       700000, 25),
  (6, 'Tatashe & Tomato Mix',      'Fresh peppers and tomatoes for stew.',                    'basket',          900000, 15),
  (6, 'Plantain',                  'Firm, ripening plantain.',                                'bunch',           650000, 20),
  (7, 'Tomato Paste',              'Carton of 210g tomato paste tins.',                       'carton (50)',    2600000, 20),
  (7, 'Instant Noodles',           'Carton of chicken-flavour instant noodles.',              'carton (40)',    1150000, 50),
  (7, 'Granulated Sugar',          'Fine granulated sugar.',                                  '1 kg',            180000, 90),
  (7, 'Eggs',                      'Fresh, medium-sized eggs.',                               'crate (30)',      550000, 40);
