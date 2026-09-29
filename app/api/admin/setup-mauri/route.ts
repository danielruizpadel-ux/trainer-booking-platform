/**
 * Admin API - Setup Mauricio Martin
 * POST /api/admin/setup-mauri
 *
 * Agrega trainer y availability slots a la base de datos
 */

import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireAdmin } from '@/lib/auth/current-admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // Escribe en `trainers` y `availability_slots`. Solo tiene sentido en local:
  // en producción no existe. Y aun en local, solo un administrador (tabla
  // `admins`, migración 020): sin sesión 401, jugador o entrenador sin
  // permiso 403. Falla cerrado antes de tocar nada.
  if (process.env.NODE_ENV === 'production') {
    return new Response(null, { status: 404 })
  }
  const admin = await requireAdmin()
  if (admin instanceof Response) return admin

  try {
    const supabase = getSupabaseServerClient()

    console.log('🚀 Iniciando setup de Mauricio Martin...')

    // 0. Antes de escribir NADA: ¿existe ya Mauri y cuántos huecos tiene?
    //    Si cualquiera de las dos lecturas falla, se aborta sin escribir
    //    (antes el error del recuento se ignoraba y se seguía escribiendo).
    const { data: existingTrainer, error: lookupError } = await supabase
      .from('trainers')
      .select('id')
      .eq('slug', 'mauri')
      .maybeSingle()
    if (lookupError) {
      console.error('❌ No se pudo comprobar si el trainer ya existe:', { code: lookupError.code ?? null })
      return NextResponse.json(
        { error: 'No se pudo comprobar si el entrenador ya existe; no se ha escrito nada' },
        { status: 500 }
      )
    }
    let existingSlots = 0
    if (existingTrainer) {
      const { count, error: countError } = await supabase
        .from('availability_slots')
        .select('*', { count: 'exact', head: true })
        .eq('trainer_id', existingTrainer.id)
      if (countError) {
        console.error('❌ No se pudieron contar los huecos existentes:', { code: countError.code ?? null })
        return NextResponse.json(
          { error: 'No se pudieron comprobar los huecos existentes; no se ha escrito nada' },
          { status: 500 }
        )
      }
      existingSlots = count ?? 0
    }

    // 1. Insertar o actualizar trainer
    console.log('📝 Insertando trainer Mauricio Martin...')

    const { data: trainer, error: trainerError } = await supabase
      .from('trainers')
      .upsert(
        [
          {
            slug: 'mauri',
            name: 'Mauricio Martin',
            bio: 'The Padel Doctor | Especializado en técnica clínica, estrategia competitiva y mentalidad ganadora',
            email: 'mauri@padeldoctor.com',
            phone: '+1234567890',
            price: 99,
            rating: 4.9,
            total_reviews: 156,
            specializations: [
              'Técnica Clínica',
              'Estrategia Competitiva',
              'Mentalidad Ganadora',
            ],
            image_url: '/trainers/mauri/hero.jpg',
            status: 'active',
          },
        ],
        { onConflict: 'slug' }
      )
      .select()
      .single()

    if (trainerError) {
      console.error('❌ Error al insertar trainer:', trainerError)
      return NextResponse.json(
        { error: 'Error al insertar trainer', details: trainerError },
        { status: 400 }
      )
    }

    const trainerId = trainer.id
    console.log(`✅ Trainer insertado (ID: ${trainerId})`)

    // 2. Si ya tenía huecos (recuento del paso 0), no se generan más.
    if (existingSlots > 0) {
      console.log(`⚠️  Trainer ya tiene ${existingSlots} slots`)
      return NextResponse.json(
        {
          success: true,
          message: 'Trainer ya existe con slots',
          trainer,
          totalSlots: existingSlots,
        },
        { status: 200 }
      )
    }

    // 3. Generar 14 días de availability slots
    console.log('📅 Generando 154 availability slots...')

    const today = new Date()
    const slots = []
    const hours = [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20]

    for (let day = 0; day < 14; day++) {
      const date = new Date(today)
      date.setDate(date.getDate() + day)
      const dateStr = date.toISOString().split('T')[0]

      for (const hour of hours) {
        const startTime = `${String(hour).padStart(2, '0')}:00`
        const endTime = `${String(hour + 1).padStart(2, '0')}:00`

        slots.push({
          trainer_id: trainerId,
          session_date: dateStr,
          start_time: startTime,
          end_time: endTime,
          max_capacity: 1,
          current_bookings: 0,
          class_type: 'individual',
          is_available: true,
        })
      }
    }

    console.log(`Total slots a insertar: ${slots.length}`)

    // 4. Insertar slots en batches
    let insertedCount = 0
    for (let i = 0; i < slots.length; i += 100) {
      const batch = slots.slice(i, i + 100)
      const { error: batchError, count } = await supabase
        .from('availability_slots')
        .insert(batch, { count: 'exact' })

      if (batchError) {
        console.error(`❌ Error al insertar lote ${i / 100 + 1}:`, batchError)
        return NextResponse.json(
          { error: `Error al insertar slots lote ${i / 100 + 1}`, details: batchError },
          { status: 400 }
        )
      }

      insertedCount += batch.length
      console.log(`  ✅ Lote ${Math.floor(i / 100) + 1}: ${batch.length} slots`)
    }

    console.log(`✅ Total: ${insertedCount} slots insertados\n`)

    // 5. Verificar final
    const { count: finalCount } = await supabase
      .from('availability_slots')
      .select('*', { count: 'exact', head: true })
      .eq('trainer_id', trainerId)

    console.log('📊 RESUMEN FINAL:')
    console.log(`  ✅ Trainer: ${trainer.name}`)
    console.log(`  ✅ Slug: ${trainer.slug}`)
    console.log(`  ✅ Email: ${trainer.email}`)
    console.log(`  ✅ Precio: $${trainer.price}`)
    console.log(`  ✅ Total Slots: ${finalCount}`)

    return NextResponse.json(
      {
        success: true,
        message: 'Setup completado exitosamente',
        trainer,
        totalSlots: finalCount,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('❌ Error no controlado:', error)
    return NextResponse.json(
      { error: 'Error no controlado', details: String(error) },
      { status: 500 }
    )
  }
}
