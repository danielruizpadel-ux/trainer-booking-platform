-- ============================================================================
-- Seed script para Mauricio Martin - The Padel Doctor
-- Ejecutar en Supabase SQL Editor
-- ============================================================================

-- 1. Insertar trainer
INSERT INTO trainers (
  slug,
  name,
  bio,
  email,
  phone,
  price,
  rating,
  total_reviews,
  specializations,
  image_url,
  status,
  created_at,
  updated_at
) VALUES (
  'mauri',
  'Mauricio Martin',
  'The Padel Doctor | Especializado en técnica clínica, estrategia competitiva y mentalidad ganadora. Llevo más de 10 años transformando jugadores en competidores.',
  'mauri@padeldoctor.com',
  '+1234567890',
  99,
  4.9,
  156,
  '["Técnica Clínica", "Estrategia Competitiva", "Mentalidad Ganadora"]'::jsonb,
  '/trainers/mauri/hero.jpg',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Obtener el ID del trainer (reemplazar después con el valor real)
-- Nota: Ejecutar esto para obtener el ID
-- SELECT id FROM trainers WHERE slug = 'mauri';

-- 3. Insertar availability slots para 14 días
-- Horarios: 9-12, 14-20 (sin 13:00) = 11 slots por día × 14 días = 154 slots
DO $$
DECLARE
  trainer_id UUID;
  v_date DATE;
  v_hours INT[] := ARRAY[9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20];
  v_hour INT;
  v_day INT := 0;
BEGIN
  -- Obtener ID del trainer
  SELECT id INTO trainer_id FROM trainers WHERE slug = 'mauri' LIMIT 1;

  IF trainer_id IS NULL THEN
    RAISE NOTICE 'Trainer no encontrado. Ejecuta primero el INSERT del trainer.';
    RETURN;
  END IF;

  -- Loop por 14 días
  LOOP
    EXIT WHEN v_day >= 14;

    v_date := CURRENT_DATE + v_day;

    -- Loop por cada hora disponible
    FOREACH v_hour IN ARRAY v_hours LOOP
      INSERT INTO availability_slots (
        trainer_id,
        session_date,
        start_time,
        end_time,
        max_capacity,
        current_bookings,
        class_type,
        is_available,
        created_at,
        updated_at
      ) VALUES (
        trainer_id,
        v_date,
        LPAD(v_hour::TEXT, 2, '0') || ':00',
        LPAD((v_hour + 1)::TEXT, 2, '0') || ':00',
        1,
        0,
        'individual',
        true,
        NOW(),
        NOW()
      );
    END LOOP;

    v_day := v_day + 1;
  END LOOP;

  RAISE NOTICE 'Agregados % slots de disponibilidad para Mauricio Martin', v_day * array_length(v_hours, 1);
END $$;

-- 4. Verificar datos insertados
SELECT
  COUNT(*) as total_slots,
  MIN(session_date) as primera_fecha,
  MAX(session_date) as ultima_fecha
FROM availability_slots
WHERE trainer_id = (SELECT id FROM trainers WHERE slug = 'mauri');
