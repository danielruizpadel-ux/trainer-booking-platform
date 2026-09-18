# 🚀 Quick Start Guide - Trainer Booking Platform

## 📋 What's Ready

- ✅ Complete Next.js 16 + React 19 app structure
- ✅ Dynamic trainer landing pages (/:trainerSlug)
- ✅ Availability calendar with date/time selection
- ✅ Booking form with real-time validation
- ✅ API routes for availability and reservations
- ✅ Database services for Supabase integration
- ✅ TypeScript compilation passing
- ✅ Responsive design (mobile-first)
- ✅ Comprehensive documentation

## 🔧 What You Need to Do

### 1. Setup Supabase Database (5 minutes)

**Open Supabase Console**: https://app.supabase.com/

**Run SQL in SQL Editor**:
```sql
-- Add missing columns to trainers table
ALTER TABLE trainers 
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 50;
ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 0;
ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;
ADD COLUMN IF NOT EXISTS specializations TEXT[] DEFAULT '{"Fitness","Coaching"}';

-- Create test trainer
INSERT INTO trainers (name, slug, bio, email, phone, price, rating, total_reviews, status)
VALUES (
  'Daniel Ruiz',
  'daniel-ruiz',
  'Professional coach with 10+ years of experience.',
  'daniel@example.com',
  '+1 (555) 123-4567',
  50,
  4.8,
  45,
  'active'
);

-- Create 14 days of availability
INSERT INTO availability (trainer_id, date, start_time, end_time, max_capacity, current_bookings, is_available)
SELECT 
  trainers.id,
  CURRENT_DATE + (i || ' days')::interval,
  '10:00'::time,
  '11:00'::time,
  1, 0, true
FROM trainers, generate_series(0, 13) AS i
WHERE trainers.slug = 'daniel-ruiz';
```

**See**: `DATABASE_SETUP.md` for detailed instructions

### 2. Install Node.js 20+ (5 minutes)

```bash
# Option A: Using Homebrew (Recommended)
brew install node@20
brew link node@20 --force

# Verify
node --version  # Should be v20.x.x
```

### 3. Start Development Server (2 minutes)

```bash
cd /Users/dani/Desktop/trainer-booking-platform
npm run dev

# Server runs on http://localhost:3001
```

### 4. Test the Booking System (5 minutes)

**Visit the trainer landing page**:
```
http://localhost:3001/daniel-ruiz
```

**You should see**:
- ✅ Trainer hero section (photo, name, rating)
- ✅ About section
- ✅ Availability calendar (14 dates)
- ✅ Booking form with fields
- ✅ Contact information
- ✅ Session price ($50)

**Test the booking flow**:
1. Click on a date in the calendar
2. Select a time slot (should show 10:00)
3. Fill in booking form:
   - Name: John Doe
   - Email: john@example.com
   - Phone: +1 (555) 987-6543
   - Notes: Test booking
4. Click "Book with Daniel Ruiz"
5. Should see success message
6. Check Supabase: new reservation created

---

## 📊 Project Structure

```
/app
  /[trainerSlug]
    page.tsx ..................... Dynamic trainer landing page
  /api
    /availability
      route.ts ................... GET available slots
    /reservations
      route.ts ................... POST create, GET list
    
/components
  /trainer
    TrainerHero.tsx .............. Hero section
    AvailabilityCalendar.tsx ...... Calendar with date/time selection
    BookingForm.tsx .............. Form with validation
    BookingSection.tsx ........... Layout wrapper
    
/lib
  /services
    trainers-data.service.ts ..... Fetch trainers from Supabase
    reservations.service.ts ...... Database operations
```

---

## 🧪 Testing Checklist

### Database
- [ ] Supabase project connected
- [ ] Slug column added to trainers
- [ ] Test trainer created (daniel-ruiz)
- [ ] 14 availability slots created
- [ ] Verified with SELECT queries

### Frontend
- [ ] Node 20+ installed
- [ ] Dev server running (`npm run dev`)
- [ ] Page loads at http://localhost:3001/daniel-ruiz
- [ ] Hero section displays trainer info
- [ ] Calendar loads and shows dates
- [ ] Form renders with all fields

### Form Validation
- [ ] Name field required
- [ ] Email field required + format validation
- [ ] Phone field optional
- [ ] Date/time required from calendar
- [ ] Error messages display
- [ ] Errors clear on edit

### Booking Flow
- [ ] Select date → slots appear
- [ ] Select time → form updates
- [ ] Fill form with test data
- [ ] Submit → loading state shows
- [ ] Success message displays
- [ ] Form resets
- [ ] Reservation appears in Supabase

### API
- [ ] GET /api/availability returns slots
- [ ] POST /api/reservations creates booking
- [ ] Proper error handling
- [ ] Validation on all inputs

---

## 📝 Documentation Files

| File | Purpose |
|------|---------|
| `DATABASE_SETUP.md` | Supabase setup instructions with SQL |
| `TESTING_GUIDE.md` | Complete testing checklist (300+ lines) |
| `IMPLEMENTATION_SUMMARY.md` | Project overview and architecture |
| `PHASE2_BOOKING_COMPLETE.md` | Technical details for Phase 2 |
| `LANDING_PAGE_PHASE1_COMPLETE.md` | Phase 1 implementation details |

---

## 🎯 Success Criteria

- ✅ Trainer page loads at http://localhost:3001/daniel-ruiz
- ✅ Calendar displays 14 available dates
- ✅ Booking form validates input in real-time
- ✅ Submit creates reservation in Supabase
- ✅ Success message confirms booking
- ✅ No TypeScript errors
- ✅ Responsive on mobile/tablet/desktop

---

## ⏳ Next Steps (After Testing)

1. **Phase 3: Email Notifications**
   - Setup email service
   - Send confirmation emails
   - ~20-30 minutes

2. **Phase 4: Styling & Polish**
   - Add animations
   - Mobile optimizations
   - ~40-60 minutes

3. **Phase 5: Admin Dashboard**
   - View reservations
   - Manage availability
   - Edit profiles

---

## 🐛 Common Issues

### "Cannot find trainers table"
- Check Supabase project is connected
- Verify credentials in .env.local
- Check trainers table exists

### "404 on /daniel-ruiz"
- Ensure trainer status is 'active'
- Check slug is lowercase
- Clear browser cache

### "Dev server won't start"
- Verify Node version: `node --version`
- Should be v20.x.x or higher
- Try `npm install` again

### "No availability shown"
- Check availability records exist
- Verify dates are after today
- Check is_available column is true

---

## 💻 Commands Reference

```bash
# Check Node version
node --version

# Install dependencies
npm install

# Type checking
npm run type-check

# Build
npm run build

# Development server
npm run dev

# Stop server
Ctrl+C
```

---

## 📞 Support Resources

- Supabase Docs: https://supabase.com/docs
- Next.js Docs: https://nextjs.org/docs
- React Docs: https://react.dev
- Tailwind Docs: https://tailwindcss.com/docs

---

## 🎉 You're Ready!

Follow these steps and you'll have a fully functional trainer booking system in ~20 minutes.

**Total time**:
- Database setup: 5 min
- Node.js install: 5 min
- Dev server: 2 min
- Testing: 5-10 min

**Start with Step 1 ⬇️**

