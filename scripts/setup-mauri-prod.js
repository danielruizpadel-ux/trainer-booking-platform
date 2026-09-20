#!/usr/bin/env node
/* ###################################################################
 *  AVISO: este script lleva la SERVICE ROLE KEY escrita en claro.
 *  Esa clave se salta el RLS: acceso total a la base de datos.
 *  NO subir este archivo a GitHub sin rotar la clave y limpiar el
 *  historial de git. Ver docs/ANTES_DE_PUBLICAR.md (bloqueante 1).
 * ################################################################### */

/**
 * Setup Mauricio Martin en Supabase
 * Verifica estructura, inserta trainer y availability slots
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://vkriseshpcjvgsnwzqcs.supabase.co';
const SUPABASE_KEY = 'sb_secret_7lHjpNNrrf4Llhgu1pTjRQ_rx-YUEHg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setupMauri() {
  try {
    console.log('🚀 Iniciando setup de Mauricio Martin en Supabase...\n');

    // 1. Verificar estructura de tabla trainers
    console.log('📋 Verificando estructura de tabla trainers...');
    const { data: trainersInfo, error: trainersError } = await supabase
      .from('trainers')
      .select('*')
      .limit(1);

    if (trainersError && trainersError.code !== 'PGRST116') {
      console.error('❌ Error al verificar tabla trainers:', trainersError);
      return;
    }

    console.log('✅ Tabla trainers accesible\n');

    // 2. Verificar estructura de tabla availability_slots
    console.log('📋 Verificando estructura de tabla availability_slots...');
    const { data: slotsInfo, error: slotsError } = await supabase
      .from('availability_slots')
      .select('*')
      .limit(1);

    if (slotsError && slotsError.code !== 'PGRST116') {
      console.error('❌ Error al verificar tabla availability_slots:', slotsError);
      return;
    }

    console.log('✅ Tabla availability_slots accesible\n');

    // 3. Verificar si Mauricio Martin ya existe
    console.log('🔍 Verificando si Mauricio Martin ya existe...');
    const { data: existingTrainer } = await supabase
      .from('trainers')
      .select('id')
      .eq('slug', 'mauri')
      .single();

    let trainerId;

    if (existingTrainer) {
      console.log(`⚠️  Mauricio Martin ya existe (ID: ${existingTrainer.id})`);
      trainerId = existingTrainer.id;
    } else {
      // 4. Insertar trainer
      console.log('📝 Insertando Mauricio Martin...');
      const { data: newTrainer, error: trainerError } = await supabase
        .from('trainers')
        .insert([
          {
            slug: 'mauri',
            name: 'Mauricio Martin',
            bio: 'The Padel Doctor | Especializado en técnica clínica, estrategia competitiva y mentalidad ganadora',
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
        console.error('❌ Error al insertar trainer:', trainerError);
        return;
      }

      trainerId = newTrainer.id;
      console.log(`✅ Trainer insertado (ID: ${trainerId})\n`);
    }

    // 5. Verificar si ya tiene availability slots
    console.log('🔍 Verificando availability slots existentes...');
    const { count: existingSlots } = await supabase
      .from('availability_slots')
      .select('id', { count: 'exact' })
      .eq('trainer_id', trainerId);

    if (existingSlots && existingSlots > 0) {
      console.log(`⚠️  Mauricio Martin ya tiene ${existingSlots} slots`);
      console.log('ℹ️  Continuando sin insertar nuevos slots...\n');
    } else {
      // 6. Generar 14 días de availability slots
      console.log('📅 Generando 154 availability slots...');
      const today = new Date();
      const slots = [];
      const hours = [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20];

      for (let day = 0; day < 14; day++) {
        const date = new Date(today);
        date.setDate(date.getDate() + day);
        const dateStr = date.toISOString().split('T')[0];

        for (const hour of hours) {
          const startTime = `${String(hour).padStart(2, '0')}:00`;
          const endTime = `${String(hour + 1).padStart(2, '0')}:00`;

          slots.push({
            trainer_id: trainerId,
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

      console.log(`  Total slots a insertar: ${slots.length}`);

      // Insertar en batches de 100
      for (let i = 0; i < slots.length; i += 100) {
        const batch = slots.slice(i, i + 100);
        const { error: slotsInsertError } = await supabase
          .from('availability_slots')
          .insert(batch);

        if (slotsInsertError) {
          console.error(
            `❌ Error al insertar slots [${i}-${i + batch.length}]:`,
            slotsInsertError
          );
          return;
        }

        console.log(`  ✅ Lote ${Math.floor(i / 100) + 1}: ${batch.length} slots insertados`);
      }

      console.log(`✅ Total: ${slots.length} slots insertados\n`);
    }

    // 7. Verificar final
    console.log('✅ Verificación final...');
    const { data: finalTrainer } = await supabase
      .from('trainers')
      .select('*')
      .eq('slug', 'mauri')
      .single();

    const { count: totalSlots } = await supabase
      .from('availability_slots')
      .select('*', { count: 'exact' })
      .eq('trainer_id', trainerId);

    console.log('\n📊 RESUMEN FINAL:');
    console.log(`  ✅ Trainer: ${finalTrainer.name}`);
    console.log(`  ✅ Slug: ${finalTrainer.slug}`);
    console.log(`  ✅ Email: ${finalTrainer.email}`);
    console.log(`  ✅ Precio: $${finalTrainer.price}`);
    console.log(`  ✅ Rating: ${finalTrainer.rating} ⭐ (${finalTrainer.total_reviews} reviews)`);
    console.log(`  ✅ Imagen: ${finalTrainer.image_url}`);
    console.log(`  ✅ Total Slots: ${totalSlots || 0}`);

    console.log('\n🌐 Accesible en:');
    console.log('  → http://localhost:3000/mauri');
    console.log('  → http://localhost:3000/mauricio-martin');

    console.log('\n✨ ¡Setup completado exitosamente!');
  } catch (error) {
    console.error('❌ Error no controlado:', error);
  }
}

setupMauri();
