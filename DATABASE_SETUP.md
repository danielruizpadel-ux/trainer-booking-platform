# Database Setup Instructions

## 🔴 PROBLEM
The `trainers` table is missing the `slug` column required for dynamic routes.

## ✅ SOLUTION

### Step 1: Add Missing Columns to Trainers Table

1. Go to Supabase Console: https://app.supabase.com/
2. Select your project: `trainer-booking-platform`
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**
5. Paste and run this SQL:

```sql
-- Add slug column (if doesn't exist)
ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Add other missing columns
ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 50;

ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 0;

ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS specializations TEXT[] DEFAULT '{"Fitness","Coaching"}';

-- Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'trainers' 
ORDER BY ordinal_position;
```

✅ Expected result: Shows all columns including `slug`, `price`, `rating`, etc.

---

### Step 2: Create Test Trainer

In the same SQL Editor, run:

```sql
-- Insert test trainer
INSERT INTO trainers (
  name, 
  slug, 
  bio, 
  email, 
  phone, 
  price, 
  rating, 
  total_reviews, 
  specializations, 
  status
) VALUES (
  'Daniel Ruiz',
  'daniel-ruiz',
  'Professional padel coach with 10+ years of experience. Specializing in technique and strategy.',
  'daniel@example.com',
  '+1 (555) 123-4567',
  50,
  4.8,
  45,
  ARRAY['Padel', 'Technique', 'Strategy'],
  'active'
);

-- Verify trainer was created
SELECT * FROM trainers WHERE slug = 'daniel-ruiz';
```

✅ Expected result: Shows 1 row with Daniel Ruiz

---

### Step 3: Create Availability Slots

In the same SQL Editor, run:

```sql
-- Create 14 days of availability (10:00-11:00 each day)
INSERT INTO availability (
  trainer_id, 
  date, 
  start_time, 
  end_time, 
  max_capacity, 
  current_bookings, 
  is_available
)
SELECT 
  trainers.id,
  CURRENT_DATE + (i || ' days')::interval,
  '10:00'::time,
  '11:00'::time,
  1,
  0,
  true
FROM trainers, generate_series(0, 13) AS i
WHERE trainers.slug = 'daniel-ruiz';

-- Verify slots were created
SELECT COUNT(*) as slot_count
FROM availability 
WHERE trainer_id = (SELECT id FROM trainers WHERE slug = 'daniel-ruiz');
```

✅ Expected result: Shows `slot_count: 14`

---

### Step 4: Verify Everything

Run this query to verify all data:

```sql
-- Check trainer
SELECT 
  name, 
  slug, 
  email, 
  price, 
  rating, 
  status 
FROM trainers 
WHERE slug = 'daniel-ruiz';

-- Check availability
SELECT 
  date, 
  start_time, 
  end_time, 
  max_capacity, 
  current_bookings, 
  is_available 
FROM availability 
WHERE trainer_id = (SELECT id FROM trainers WHERE slug = 'daniel-ruiz')
ORDER BY date;
```

✅ Expected results:
- 1 trainer row with all correct data
- 14 availability rows with dates from today onwards

---

## 🚀 After Database Setup

Once your Supabase database is configured:

1. **Install Node.js 20+**
   ```bash
   brew install node@20
   brew link node@20 --force
   ```

2. **Verify Node version**
   ```bash
   node --version  # Should show v20.x.x
   ```

3. **Start the dev server**
   ```bash
   cd /Users/dani/Desktop/trainer-booking-platform
   npm run dev
   ```

4. **Test the booking system**
   - Visit: http://localhost:3001/daniel-ruiz
   - You should see:
     ✅ Trainer hero section (Daniel Ruiz)
     ✅ Availability calendar (14 dates)
     ✅ Booking form
     ✅ Contact information

5. **Test booking flow**
   - Select a date from calendar
   - Select a time slot
   - Fill in booking form
   - Submit
   - Verify in Supabase: New reservation created

---

## 🐛 Troubleshooting

### "Table trainers doesn't have column slug"
- Run the ALTER TABLE commands from Step 1

### "No trainer found"
- Verify trainer was inserted correctly
- Check slug is lowercase: `daniel-ruiz`
- Check status is `active`

### "No availability shown"
- Check availability records exist in database
- Verify dates are after today
- Check is_available column is true

### "404 on /daniel-ruiz"
- Ensure trainer status is 'active'
- Clear browser cache
- Restart dev server

---

## 📋 SQL Quick Reference

```sql
-- View all trainers
SELECT id, name, slug, status FROM trainers;

-- View trainer by slug
SELECT * FROM trainers WHERE slug = 'daniel-ruiz';

-- Count availability for trainer
SELECT COUNT(*) FROM availability 
WHERE trainer_id = (SELECT id FROM trainers WHERE slug = 'daniel-ruiz');

-- View all reservations
SELECT * FROM reservations ORDER BY created_at DESC;

-- Delete test data (if needed)
DELETE FROM availability WHERE trainer_id = (SELECT id FROM trainers WHERE slug = 'daniel-ruiz');
DELETE FROM trainers WHERE slug = 'daniel-ruiz';
```

---

**Status**: Ready for manual setup via Supabase Console
**Next**: Run SQL commands above, then start dev server

