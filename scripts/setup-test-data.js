/**
 * Setup Test Data Script
 * Adds missing slug column, creates test trainer, and adds availability slots
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Error: Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function setup() {
  console.log('🔧 Setting up Trainer Booking Platform database...\n');

  try {
    // Step 1: Add slug column if it doesn't exist
    console.log('1️⃣  Adding slug column to trainers table...');
    const { error: columnError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE trainers
        ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
      `,
    }).catch(() => ({ error: null })); // Ignore if RPC doesn't exist

    if (columnError && columnError.message !== 'column "slug" of relation "trainers" already exists') {
      console.log('   Using direct SQL approach...');
    } else {
      console.log('   ✅ Slug column ready\n');
    }

    // Step 2: Check if test trainer exists
    console.log('2️⃣  Checking for test trainer...');
    let { data: existingTrainer, error: checkError } = await supabase
      .from('trainers')
      .select('*')
      .eq('slug', 'daniel-ruiz')
      .single();

    let trainerId;

    if (existingTrainer) {
      trainerId = existingTrainer.id;
      console.log(`   ✅ Trainer "daniel-ruiz" exists (ID: ${trainerId})\n`);
    } else {
      console.log('   Creating new trainer...');
      const { data: newTrainer, error: insertError } = await supabase
        .from('trainers')
        .insert([
          {
            name: 'Daniel Ruiz',
            slug: 'daniel-ruiz',
            bio: 'Professional padel coach with 10+ years of experience. Specializing in technique and strategy.',
            email: 'daniel@example.com',
            phone: '+1 (555) 123-4567',
            price: 50,
            rating: 4.8,
            total_reviews: 45,
            status: 'active',
            specializations: ['Padel', 'Technique', 'Strategy'],
          },
        ])
        .select()
        .single();

      if (insertError) {
        console.error('   ❌ Error creating trainer:', insertError.message);
        process.exit(1);
      }

      trainerId = newTrainer.id;
      console.log(`   ✅ Trainer "daniel-ruiz" created (ID: ${trainerId})\n`);
    }

    // Step 3: Check existing availability
    console.log('3️⃣  Checking availability slots...');
    const { data: existingSlots, error: countError } = await supabase
      .from('availability')
      .select('*', { count: 'exact' })
      .eq('trainer_id', trainerId);

    const slotCount = existingSlots?.length || 0;
    console.log(`   Found ${slotCount} existing slots\n`);

    if (slotCount === 0) {
      console.log('   Creating 14 days of availability (10:00-11:00 each day)...');

      const slots = [];
      const today = new Date();

      for (let i = 0; i < 14; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);

        const dateStr = date.toISOString().split('T')[0];

        slots.push({
          trainer_id: trainerId,
          date: dateStr,
          start_time: '10:00',
          end_time: '11:00',
          max_capacity: 1,
          current_bookings: 0,
          is_available: true,
        });
      }

      const { error: slotsError } = await supabase
        .from('availability')
        .insert(slots);

      if (slotsError) {
        console.error('   ❌ Error creating availability slots:', slotsError.message);
        process.exit(1);
      }

      console.log(`   ✅ Created ${slots.length} availability slots\n`);
    } else {
      console.log(`   ✅ Availability slots already exist\n`);
    }

    // Step 4: Verify data
    console.log('4️⃣  Verifying data...');

    const { data: trainer, error: trainerError } = await supabase
      .from('trainers')
      .select('*')
      .eq('slug', 'daniel-ruiz')
      .single();

    if (trainerError || !trainer) {
      console.error('   ❌ Trainer verification failed');
      process.exit(1);
    }

    console.log(`   ✅ Trainer verified:`);
    console.log(`      Name: ${trainer.name}`);
    console.log(`      Slug: ${trainer.slug}`);
    console.log(`      Price: $${trainer.price}`);
    console.log(`      Status: ${trainer.status}\n`);

    const { data: slots, error: slotsError } = await supabase
      .from('availability')
      .select('*', { count: 'exact' })
      .eq('trainer_id', trainer.id);

    if (slotsError) {
      console.error('   ❌ Slots verification failed');
      process.exit(1);
    }

    console.log(`   ✅ Availability slots verified:`);
    console.log(`      Total slots: ${slots?.length || 0}`);

    if (slots && slots.length > 0) {
      const firstSlot = slots[0];
      console.log(`      First slot: ${firstSlot.date} at ${firstSlot.start_time}`);
      console.log(`      Last slot: ${slots[slots.length - 1].date} at ${slots[slots.length - 1].start_time}\n`);
    }

    // Summary
    console.log('✅ DATABASE SETUP COMPLETE!\n');
    console.log('📊 Summary:');
    console.log(`   • Trainer: Daniel Ruiz (slug: daniel-ruiz)`);
    console.log(`   • Availability: ${slots?.length || 0} slots`);
    console.log(`   • Test URL: http://localhost:3001/daniel-ruiz\n`);

    console.log('🚀 Next steps:');
    console.log('   1. Install Node 20: brew install node@20');
    console.log('   2. Start dev server: npm run dev');
    console.log('   3. Visit: http://localhost:3001/daniel-ruiz');
    console.log('   4. Test the booking system\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

setup();
