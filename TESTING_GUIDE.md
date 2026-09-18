# Trainer Booking System - Testing Guide

## 📋 Current Status

**Build Status**: ✅ Ready (TypeScript compilation passing)
**Dev Server**: ⏳ Requires Node.js 20+ (currently on 16.20.2)

---

## 🔧 Environment Setup Required

### Step 1: Install Node.js 20+

You have two options:

**Option A: Using Homebrew (Recommended)**
```bash
# Update Xcode Command Line Tools first
sudo xcode-select --install

# Then install Node 20
brew install node@20

# Link it
brew link node@20 --force
```

**Option B: Using NVM**
```bash
# Install Node 20
nvm install 20

# Use it in project
nvm use 20
```

**Option C: Download from nodejs.org**
- Visit https://nodejs.org/
- Download LTS (v20.x)
- Install and verify: `node --version`

### Step 2: Verify Installation

```bash
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

---

## 🚀 Start Development Server

Once Node 20 is installed:

```bash
cd /Users/dani/Desktop/trainer-booking-platform

# Activate Node 20 (if using nvm)
nvm use 20

# Start dev server
npm run dev

# Server should start on http://localhost:3001
```

---

## 🧪 Testing Checklist

### 1. Database Preparation

Before testing, ensure your Supabase has:

#### Add Test Trainer
```sql
INSERT INTO trainers (slug, name, bio, email, phone, price, rating, total_reviews, status)
VALUES (
  'daniel-ruiz',
  'Daniel Ruiz',
  'Professional fitness trainer specializing in strength training and functional fitness.',
  'daniel@example.com',
  '+1 (555) 123-4567',
  99.00,
  4.8,
  45,
  'active'
);
```

#### Add Availability Slots
```sql
INSERT INTO availability (trainer_id, date, start_time, end_time, max_capacity, current_bookings, is_available)
VALUES 
  ('trainer-uuid-here', '2026-09-20', '09:00', '10:00', 1, 0, true),
  ('trainer-uuid-here', '2026-09-20', '10:00', '11:00', 1, 0, true),
  ('trainer-uuid-here', '2026-09-21', '14:00', '15:00', 1, 0, true),
  ('trainer-uuid-here', '2026-09-22', '15:00', '16:00', 1, 0, true);
```

### 2. Route Testing

#### Test Home → Trainers Flow
```
1. Visit: http://localhost:3001/
2. Should redirect to: http://localhost:3001/web
3. Click "View Our Trainers" button
4. Should navigate to: http://localhost:3001/trainers
```

#### Test Trainer Listing
```
1. At: http://localhost:3001/trainers
2. Should show trainer cards with:
   - Trainer photo/avatar
   - Name: "Daniel Ruiz"
   - Bio snippet
   - Rating: 4.8 ★
   - 45 reviews
   - Contact info
3. Click "Book Session" button
```

#### Test Dynamic Trainer Landing Page
```
1. Should navigate to: http://localhost:3001/daniel-ruiz
2. Should show:
   ✅ TrainerHero section (photo, name, rating, bio)
   ✅ "About" section with stats
   ✅ "Availability" calendar section
   ✅ Right sidebar with:
      - Session Price ($99)
      - Booking Form
      - Contact Information
```

### 3. Availability Calendar Testing

```
At: http://localhost:3001/daniel-ruiz

1. Calendar should load (shows "Loading availability...")
2. After ~1 second, should display:
   - Date selection buttons (Sep 20, 21, 22, etc.)
   - Each date shows day and date
3. Click on a date (e.g., Sep 20)
   - Should highlight in blue
   - Time slots should appear below
   - Show available times: 9:00 AM, 10:00 AM, etc.
4. Click on a time slot
   - Should highlight in blue
   - Summary box should appear:
     "Selected: Saturday, September 20 at 09:00"
```

### 4. Booking Form Testing

```
At: http://localhost:3001/daniel-ruiz (after selecting date/time)

1. Form should show all fields:
   - Your Name * (required)
   - Email * (required)
   - Phone (optional)
   - Selected Session display
   - Notes (optional)
   - "Book with Daniel Ruiz" button

2. Test Validation:
   a. Click Submit without entering data
      ✅ Should show errors:
         - "Name is required"
         - "Email is required"
         - "Please select a date"
         - "Please select a time"
   
   b. Enter invalid email (e.g., "john@")
      ✅ Should show: "Invalid email address"
   
   c. Clear the invalid email
      ✅ Error should disappear

3. Fill Valid Data:
   - Name: John Doe
   - Email: john.doe@example.com
   - Phone: +1 (555) 987-6543
   - Notes: Looking forward to working with you!
   - Date/Time: Already selected (Sep 20, 9:00 AM)

4. Submit Form:
   - Button should show "Booking..."
   - Form should be disabled
   - After 1-2 seconds, should show:
     ✅ Green success box:
        "Booking confirmed! A confirmation email has been sent 
         to john.doe@example.com. Your session with Daniel Ruiz 
         is scheduled for 9/20/2026 at 09:00."
   - Form should reset (all fields cleared)
```

### 5. Database Verification

After successful booking, check Supabase:

```sql
-- Check if reservation was created
SELECT * FROM reservations 
WHERE client_email = 'john.doe@example.com'
ORDER BY created_at DESC LIMIT 1;

-- Should return:
-- id: (UUID)
-- trainer_id: (UUID)
-- client_name: John Doe
-- client_email: john.doe@example.com
-- client_phone: +1 (555) 987-6543
-- date: 2026-09-20
-- time: 09:00
-- notes: Looking forward to working with you!
-- status: pending
-- created_at: (current timestamp)
```

### 6. Email Notification Testing (Phase 3)

```
⏳ This feature is not yet implemented.
Expected in Phase 3:

1. After booking, email should be sent to john.doe@example.com
2. Email should contain:
   - Confirmation message
   - Trainer name: Daniel Ruiz
   - Date: September 20, 2026
   - Time: 9:00 AM
   - Trainer contact info
   - Session details
3. Check email inbox (or check Supabase email logs)
```

### 7. Error Cases Testing

#### Test Invalid Trainer Slug
```
1. Visit: http://localhost:3001/nonexistent-trainer
2. Should show: 404 Page Not Found
```

#### Test API Errors
```
1. Open browser DevTools (F12)
2. Go to Network tab
3. Book a session
4. Check requests:
   - GET /api/availability?trainer_id=...&start_date=...&end_date=...
     Should return: 200 OK with array of slots
   - POST /api/reservations
     Should return: 201 Created
```

### 8. Responsive Design Testing

Test on different screen sizes:

```
Mobile (375px):
- Calendar fits in single column
- Time slots display vertically
- Form spans full width
- Booking form text is readable

Tablet (768px):
- Grid layout with 1-2 columns
- Calendar shows more slots
- Form still responsive

Desktop (1024px+):
- 2-column layout:
  - Left: Calendar (2/3)
  - Right: Form (1/3, sticky)
- Side-by-side layout optimal
```

---

## 📸 What You Should See

### Landing Page (Hero Section)
```
┌─────────────────────────────────────────┐
│                                         │
│  [Trainer Photo]  Daniel Ruiz          │
│                   ⭐ 4.8 (45 reviews)   │
│                                         │
│  Professional fitness trainer with      │
│  years of experience...                 │
│                                         │
│  Specializations: Strength • Cardio     │
│                                         │
│  [Book Now]  [Back to Trainers]        │
└─────────────────────────────────────────┘
```

### Availability Calendar
```
Select Date
┌─────────────────┐
│ Sep 20  Sep 21  │
│ Sep 22  Sep 23  │
└─────────────────┘

Select Time (after date selection)
┌──────────────────┐
│ 09:00  ✓ Selected │
│ 10:00            │
│ 11:00  Full      │
└──────────────────┘

Selected: Saturday, September 20 at 09:00
```

### Booking Form
```
Your Name *
[_____________________]

Email *
[_____________________]

Phone (Optional)
[_____________________]

Selected Session
Saturday, September 20 at 09:00

Notes (Optional)
[_____________________________
_____________________________]

[Book with Daniel Ruiz]
```

### Success Message
```
✅ Booking confirmed! A confirmation email 
   has been sent to john.doe@example.com. 
   Your session with Daniel Ruiz is 
   scheduled for 9/20/2026 at 09:00.
```

---

## 🐛 Troubleshooting

### Dev Server Won't Start
- Check Node version: `node --version`
- Should be v20.x.x or higher
- If not, install Node 20

### Trainer Page Shows 404
- Ensure trainer slug is in database
- Check slug is lowercase without spaces
- Verify trainer status is 'active'

### Calendar Shows "No available times"
- Check availability records in Supabase
- Ensure dates are after today
- Verify is_available column is true

### Form Submission Fails
- Open browser Console (F12)
- Check for error messages
- Verify Supabase connection
- Check reservations table exists

### Email Not Received
- Phase 3 (not implemented yet)
- Check Supabase email settings
- Verify SMTP configuration

---

## 📊 API Endpoints Reference

### Get Availability Slots
```bash
curl "http://localhost:3001/api/availability?trainer_id=123&start_date=2026-09-20&end_date=2026-09-30"

# Response
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "trainer_id": "uuid",
      "date": "2026-09-20",
      "start_time": "09:00",
      "end_time": "10:00",
      "max_capacity": 1,
      "current_bookings": 0
    }
  ]
}
```

### Create Reservation
```bash
curl -X POST http://localhost:3001/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "trainer_id": "uuid",
    "client_name": "John Doe",
    "client_email": "john@example.com",
    "client_phone": "+1 (555) 123-4567",
    "date": "2026-09-20",
    "time": "09:00",
    "notes": "Optional notes here"
  }'

# Response
{
  "success": true,
  "message": "Reservation created successfully"
}
```

### Get Reservations
```bash
curl "http://localhost:3001/api/reservations?client_email=john@example.com"

# Response
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "trainer_id": "uuid",
      "client_name": "John Doe",
      "client_email": "john@example.com",
      "date": "2026-09-20",
      "time": "09:00",
      "status": "pending",
      "created_at": "2026-09-18T22:30:00Z"
    }
  ]
}
```

---

## ✅ Success Criteria

The booking system is working when you can:

- ✅ Navigate to dynamic trainer page (/:trainerSlug)
- ✅ Calendar loads and displays available dates
- ✅ Select date → time slots appear
- ✅ Fill booking form with validation
- ✅ Submit → reservation created in Supabase
- ✅ Success message displays
- ✅ No TypeScript errors
- ✅ Responsive on mobile/tablet/desktop

---

## 🎯 Next Steps (After Verification)

1. **Phase 3: Email Notifications**
   - Setup Supabase Email API
   - Send confirmation emails
   - Add email templates

2. **Phase 4: Styling & Polish**
   - Apply trainer-specific colors
   - Add loading animations
   - Mobile optimizations

3. **Phase 5: Admin Dashboard**
   - View reservations
   - Manage availability
   - Edit trainer profiles

---

**Generated**: 2026-09-18
**Status**: Ready for testing (once Node 20 is installed)

