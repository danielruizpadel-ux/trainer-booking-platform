/**
 * Setup script para agregar Mauricio Martin (The Padel Doctor) a la base de datos
 * Ejecutar: node scripts/setup-mauri.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupMauri() {
  try {
    console.log('🚀 Iniciando setup de Mauricio Martin...\n');

    // 1. Insertar trainer
    console.log('📝 Agregando trainer Mauricio Martin...');
    const { data: trainer, error: trainerError } = await supabase
      .from('trainers')
      .insert([
        {
          slug: 'mauricio-martin',
          name: 'Mauricio Martin',
          bio: 'The Padel Doctor | Especializado en técnica clínica, estrategia competitiva y mentalidad ganadora. Llevo más de 10 años transformando jugadores en competidores.',
          email: 'mauri@padeldoctor.com',
          phone: '+1234567890',
          price: 99,
          rating: 4.9,
          total_reviews: 156,
          specializations: ['Técnica Clínica', 'Estrategia Competitiva', 'Mentalidad Ganadora'],
          image_url: '/trainers/mauri/hero.jpg',
          status: 'active',
        },
      ])
      .select()
      .single();

    if (trainerError) {
      console.error('❌ Error al agregar trainer:', trainerError);
      return;
    }

    console.log(`✅ Trainer agregado: ${trainer.name} (ID: ${trainer.id})\n`);

    // 2. Generar 14 días de availability slots
    console.log('📅 Generando availability slots para 14 días...');
    const today = new Date();
    const slots = [];

    for (let day = 0; day < 14; day++) {
      const date = new Date(today);
      date.setDate(date.getDate() + day);
      const dateStr = date.toISOString().split('T')[0];

      // Generar slots de 1 hora desde 9:00 a 20:00
      for (let hour = 9; hour < 20; hour++) {
        const startTime = `${String(hour).padStart(2, '0')}:00`;
        const endTime = `${String(hour + 1).padStart(2, '0')}:00`;

        slots.push({
          trainer_id: trainer.id,
          session_date: dateStr,
          start_time: startTime,
          end_time: endTime,
          max_capacity: 1,
          current_bookings: 0,
          class_type: 'individual',
          is_available: true,
        });
      }
    }

    // Insertar slots en batches de 100
    for (let i = 0; i < slots.length; i += 100) {
      const batch = slots.slice(i, i + 100);
      const { error: slotsError } = await supabase
        .from('availability_slots')
        .insert(batch);

      if (slotsError) {
        console.error(`❌ Error al agregar slots [${i}-${i + batch.length}]:`, slotsError);
        return;
      }

      console.log(`  ✅ Agregados ${batch.length} slots [${i + 1}-${i + batch.length}]`);
    }

    console.log(`\n✅ Setup completado! Total de slots: ${slots.length}`);
    console.log(`🌐 Landing page disponible en: /mauricio-martin`);
  } catch (error) {
    console.error('❌ Error durante setup:', error);
  }
}

setupMauri();
