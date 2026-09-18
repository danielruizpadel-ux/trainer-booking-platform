# Get Exact Table Schema - Step-by-Step

## 📸 Visual Steps

### Step 1: Open Supabase Console
```
1. Go to: https://app.supabase.com/
2. Sign in with your account
3. Select project: "jbhfwvxsetpalotezarq"
```

### Step 2: Navigate to SQL Editor
```
Left Sidebar:
├─ Project Settings
├─ Database
├─ SQL Editor ← CLICK HERE
└─ ...
```

### Step 3: Create New Query
```
Click: "+ New Query" button
A text editor will open
```

### Step 4: Paste Schema Inspection Query
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

### Step 5: Run Query
```
Click: "Run" button (or Ctrl+Enter)
Results appear below
```

### Step 6: Analyze Results
You'll see a table like:

```
┌──────────────────┬───────────┬────────────┬──────────────────────┐
│ column_name      │ data_type │ is_nullable│ column_default       │
├──────────────────┼───────────┼────────────┼──────────────────────┤
│ id               │ uuid      │ false      │ gen_random_uuid()    │
│ name             │ text      │ true       │ NULL                 │
│ email            │ text      │ true       │ NULL                 │
│ phone            │ text      │ true       │ NULL                 │
│ bio              │ text      │ true       │ NULL                 │
│ image_url        │ text      │ true       │ NULL                 │
│ status           │ text      │ true       │ NULL                 │
│ created_at       │ timestamp │ false      │ now()                │
│ updated_at       │ timestamp │ false      │ now()                │
└──────────────────┴───────────┴────────────┴──────────────────────┘
```

---

## ✅ What to Look For

**Column names matter:**
- `image_url` vs `photo_url` vs `image` vs `picture`
- `bio` vs `description` vs `about`
- `status` vs `active` vs `is_active`

**Data types matter:**
- `text` = string
- `uuid` = unique ID
- `timestamp` = date/time
- `numeric` = decimal number
- `integer` = whole number
- `boolean` = true/false
- `text[]` = array of strings

---

## 📋 Next: Match Your Schema

Once you have the results, match them to one of these patterns:

### Pattern A: Has image_url
```
✓ id (uuid)
✓ name (text)
✓ bio (text)
✓ email (text)
✓ phone (text)
✓ image_url (text)
✓ status (text)
✓ created_at (timestamp)
✓ updated_at (timestamp)
```
→ Use SQL Option A from FIX_SCHEMA_GUIDE.md

### Pattern B: Has photo_url
```
✓ id (uuid)
✓ name (text)
✓ photo_url (text)
✓ ... rest same as Pattern A
```
→ Use SQL Option B from FIX_SCHEMA_GUIDE.md

### Pattern C: Different column names
→ Adjust SQL to match your columns

---

## 🔍 Example Queries to Run

After getting schema, try these to verify table state:

### Count existing trainers
```sql
SELECT COUNT(*) as trainer_count FROM trainers;
```

### Check if slug column exists
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'trainers' AND column_name = 'slug';
```

### View first trainer (if exists)
```sql
SELECT * FROM trainers LIMIT 1;
```

### Check for daniel-ruiz
```sql
SELECT * FROM trainers WHERE name LIKE '%Daniel%' OR slug = 'daniel-ruiz';
```

---

## 💾 Common Table Structures

### Minimal (just core fields)
```
id, name, created_at, updated_at
```
→ Everything else needs to be added

### Medium (includes contact + photo)
```
id, name, email, phone, bio, image_url, status, created_at, updated_at
```
→ Add price, rating, slug

### Full (all fields)
```
id, name, email, phone, bio, image_url, price, rating, total_reviews, 
specializations, status, created_at, updated_at
```
→ Just add slug if missing

---

## 🎯 Action Items

1. ✅ Follow Steps 1-6 above
2. ✅ Copy the column_name results
3. ✅ Match to Pattern A, B, or C
4. ✅ Use SQL from FIX_SCHEMA_GUIDE.md
5. ✅ Replace column names as needed
6. ✅ Run the SQL
7. ✅ Verify with SELECT queries
8. ✅ Report back: "I see these columns: ..."

---

## ❓ Stuck?

If results are empty or error:
- Table might not exist → Create it
- Table might be in different schema → Check schema dropdown
- No data → That's OK, we'll create test data

**Share this info:**
```
1. Screenshot of query results
2. Column names you see (copy-paste)
3. Any error messages
4. Table name (is it really "trainers"?)
```

Then I can give you exact SQL to run.

