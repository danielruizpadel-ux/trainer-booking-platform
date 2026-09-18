# 🔧 Arreglo de la API de Disponibilidad

## Problema Encontrado

La API `/api/availability` no funcionaba por dos razones:

1. ❌ **Nombre de tabla incorrecto**: El archivo usaba `availability` pero la tabla real es `availability_slots`
2. ❌ **Nombres de columnas desconocidas**: No sabemos los nombres exactos de las columnas

## ✅ Arreglado (Parcialmente)

He actualizado los siguientes archivos para usar `availability_slots`:

- ✅ `app/api/availability/route.ts`
- ✅ `app/api/disponibilidad/route.ts`
- ✅ `lib/services/availability.service.ts`
- ✅ `app/api/reservations/route.ts` (comentario)

## ⏳ Falta: Verificar Estructura de Columnas

Necesito que **verifiques** qué columnas tiene realmente la tabla `availability_slots`:

### Opción 1: Supabase Console (Recomendado)

1. Ve a: https://app.supabase.com/
2. Selecciona proyecto: `vkriseshpcjvgsnwzqcs`
3. Haz clic en **Table Editor**
4. Haz clic en tabla **availability_slots**
5. Verás todas las columnas y sus tipos

**Escribe exactamente los nombres de las columnas que ves:**

Ejemplo:
```
Veo estas columnas:
- id (UUID)
- trainer_id (UUID)
- session_date (date)
- session_start_time (time)
- session_end_time (time)
- capacity (integer)
- booked (integer)
- available (boolean)
- created_at (timestamp)
- updated_at (timestamp)
```

### Opción 2: SQL Query

En Supabase SQL Editor, ejecuta:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'availability_slots'
ORDER BY ordinal_position;
```

---

## 🚀 Próximo Paso

Una vez que **me digas los nombres de las columnas**, voy a:

1. Actualizar la API para usar los nombres correctos
2. Probar que funciona
3. Generar SQL para crear los 14 slots si no existen

---

## Archivos Actualizados

| Archivo | Cambio |
|---------|--------|
| `app/api/availability/route.ts` | `availability` → `availability_slots` |
| `app/api/disponibilidad/route.ts` | `availability` → `availability_slots` |
| `lib/services/availability.service.ts` | `availability` → `availability_slots` (5 referencias) |
| `app/api/reservations/route.ts` | Comentario actualizado |

---

## Status Actual

```
❌ API no funciona todavía
📊 Tabla encontrada: availability_slots
⏳ Esperando: Nombres de columnas reales
```

**Comparte los nombres de las columnas y lo arreglo en 2 minutos.**

