# SQL: Crear Entrenador y Disponibilidad

Las tablas `trainers` y `availability_slots` están vacías.

## Paso 1: Crear Entrenador de Prueba

Copia y pega esto en Supabase SQL Editor:

```sql
INSERT INTO trainers (id, name, bio, email, phone, status)
VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479'::uuid,
  'Daniel Ruiz',
  'Entrenador profesional con 10+ años de experiencia',
  'daniel@example.com',
  '+1 (555) 123-4567',
  'active'
);
```

## Paso 2: Crear 14 Slots de Disponibilidad

```sql
INSERT INTO availability_slots (trainer_id, session_date, start_time, end_time, class_type, max_capacity, current_bookings, status)
SELECT 
  'f47ac10b-58cc-4372-a567-0e02b2c3d479'::uuid as trainer_id,
  CURRENT_DATE + (i || ' days')::interval as session_date,
  '10:00'::time as start_time,
  '11:00'::time as end_time,
  'padel' as class_type,
  1 as max_capacity,
  0 as current_bookings,
  'available' as status
FROM generate_series(0, 13) AS i;
```

## Verificar Datos

```sql
-- Ver trainer
SELECT * FROM trainers WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'::uuid;

-- Ver availability_slots
SELECT COUNT(*) as total_slots FROM availability_slots 
WHERE trainer_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'::uuid;

-- Ver slots de un día específico
SELECT * FROM availability_slots
WHERE trainer_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'::uuid
AND session_date = '2026-09-18'
ORDER BY start_time;
```

---

## 🚀 Próximos Pasos

1. Copia y pega **PASO 1** en Supabase SQL Editor
2. Copia y pega **PASO 2** en Supabase SQL Editor
3. Ejecuta el SQL de **Verificar Datos**
4. Luego la API debería funcionar:
   ```
   GET /api/availability?trainer_id=f47ac10b-58cc-4372-a567-0e02b2c3d479&date=2026-09-18
   ```

