# Fix Supabase Schema - Correct SQL Guide

## 🔍 Step 1: Check Actual Table Structure

1. **Go to Supabase Console**
   - URL: https://app.supabase.com/
   - Project: jbhfwvxsetpalotezarq

2. **Open SQL Editor**
   - Click "SQL Editor" in left sidebar
   - Click "New Query"

3. **Run This Query to See All Columns**

```sql
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'trainers'
ORDER BY ordinal_position;
```

**This will show:**
```
column_name    | data_type | is_nullable | column_default
─────────────────────────────────────────────────────────
id             | uuid      | NO          | gen_random_uuid()
name           | text      | YES         | NULL
...
```

---

## 📝 Likely Column Names (Based on Code)

From looking at the codebase, the trainers table probably has:

| Column | Type | Required |
|--------|------|----------|
| id | UUID | Auto-generated |
| name | TEXT | Yes |
| bio | TEXT | Optional |
| email | TEXT | Optional |
| phone | TEXT | Optional |
| image_url or photo_url | TEXT | Optional |
| status | ENUM or TEXT | Optional |
| created_at | TIMESTAMP | Auto-generated |
| updated_at | TIMESTAMP | Auto-generated |

**Missing columns that need to be added:**
- slug (TEXT, UNIQUE)
- price (NUMERIC)
- rating (NUMERIC)
- total_reviews (INTEGER)
- specializations (TEXT[])

---

## ⚠️ Common Column Name Variations

The table might use:
- `photo_url` OR `image_url` OR `image` OR `picture`
- `bio` OR `description` OR `about`
- `status` OR `active` OR `is_active`

---

## ✅ Corrected SQL Template

Once you know the exact columns, use this template:

### Option A: If table has `image_url`
```sql
-- 1. Add missing columns
ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 50;

ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 4.8;

ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS specializations TEXT[] DEFAULT ARRAY['Fitness', 'Coaching'];

-- 2. Create test trainer
INSERT INTO trainers (name, slug, bio, email, phone, image_url, price, rating, total_reviews, status)
VALUES (
  'Daniel Ruiz',
  'daniel-ruiz',
  'Professional padel coach with 10+ years of experience. Specializing in technique and strategy.',
  'daniel@example.com',
  '+1 (555) 123-4567',
  'https://via.placeholder.com/400',
  50,
  4.8,
  45,
  'active'
);

-- 3. Verify
SELECT * FROM trainers WHERE slug = 'daniel-ruiz';
```

### Option B: If table has `photo_url`
```sql
-- 1. Add missing columns
ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 50;

ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 4.8;

ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS specializations TEXT[] DEFAULT ARRAY['Fitness', 'Coaching'];

-- 2. Create test trainer
INSERT INTO trainers (name, slug, bio, email, phone, photo_url, price, rating, total_reviews, status)
VALUES (
  'Daniel Ruiz',
  'daniel-ruiz',
  'Professional padel coach with 10+ years of experience. Specializing in technique and strategy.',
  'daniel@example.com',
  '+1 (555) 123-4567',
  'https://via.placeholder.com/400',
  50,
  4.8,
  45,
  'active'
);

-- 3. Verify
SELECT * FROM trainers WHERE slug = 'daniel-ruiz';
```

### Option C: If columns are different
```sql
-- First, check what columns exist:
SELECT * FROM trainers LIMIT 0;

-- Then use only the columns that exist
-- For example, if only name, bio, email exist:
INSERT INTO trainers (name, slug, bio, email)
VALUES (
  'Daniel Ruiz',
  'daniel-ruiz',
  'Professional padel coach with 10+ years of experience.',
  'daniel@example.com'
);
```

---

## 🔧 How to Fix Schema

**Step-by-step:**

1. **Run schema inspection query** (from Step 1 above)
2. **Copy the column names** from the results
3. **Choose the correct SQL template** (Option A, B, or C)
4. **Replace column names** as needed
5. **Run the SQL**
6. **Verify with:**
   ```sql
   SELECT COUNT(*) as trainer_count FROM trainers WHERE slug = 'daniel-ruiz';
   ```

---

## ❌ Error Messages & Solutions

### "column 'X' does not exist"
- Replace `X` with the correct column name from Step 1
- Check data type: might need CAST or different format

### "constraint 'slug_unique' already exists"
- Remove `UNIQUE` from ADD COLUMN for slug
- Or use `ALTER TABLE UNIQUE` instead

### "duplicate key value violates unique constraint"
- You already created the trainer
- Check with: `SELECT * FROM trainers WHERE slug = 'daniel-ruiz';`

### "type 'status' does not exist"
- Status might be TEXT, not ENUM
- Change from `'active'` to just `'active'`

---

## 📋 After Adding Trainer

Once trainer is created, add availability:

```sql
-- Create 14 days of availability
INSERT INTO availability (trainer_id, date, start_time, end_time, max_capacity, current_bookings, is_available)
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

-- Verify
SELECT COUNT(*) as slot_count
FROM availability 
WHERE trainer_id = (SELECT id FROM trainers WHERE slug = 'daniel-ruiz');
```

---

## 🎯 What To Do Now

1. ✅ Go to https://app.supabase.com/
2. ✅ Run the schema inspection query
3. ✅ Copy the column names you see
4. ✅ Choose the correct SQL template above
5. ✅ Replace column names as needed
6. ✅ Run the SQL in Supabase SQL Editor
7. ✅ Verify with SELECT queries
8. ✅ Come back and tell me the results

---

## 📞 Need Help?

If you get errors:
1. Copy the exact error message
2. Share the column names from Step 1
3. I'll provide the exact SQL to fix it

**Don't guess column names - check the schema first!**

