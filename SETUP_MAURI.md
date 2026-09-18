# Setup Mauricio Martin - The Padel Doctor

Guía para agregar Mauricio Martin y sus 154 availability slots a Supabase.

## 🚀 Opción 1: Usando API Endpoint (Recomendado)

La forma más fácil - ejecuta el endpoint desde tu navegador o curl:

### 1. Inicia el servidor dev

```bash
npm run dev
```

### 2. Ejecuta el setup en otra terminal

**Opción A: curl**
```bash
curl -X POST http://localhost:3000/api/admin/setup-mauri \
  -H "Content-Type: application/json"
```

**Opción B: Navegador**
```
http://localhost:3000/api/admin/setup-mauri (POST request)
```

### 3. Verifica la respuesta

```json
{
  "success": true,
  "message": "Setup completado exitosamente",
  "trainer": {
    "id": "...",
    "slug": "mauri",
    "name": "Mauricio Martin",
    "email": "mauri@padeldoctor.com",
    "price": 99,
    "rating": 4.9,
    "total_reviews": 156
  },
  "totalSlots": 154
}
```

---

## 📋 Opción 2: SQL Directo en Supabase

Si prefieres ejecutar SQL manualmente en Supabase.

### 1. Abre Supabase Dashboard
- Ve a: https://supabase.com/dashboard/project/vkriseshpcjvgsnwzqcs
- Abre SQL Editor

### 2. Copia y ejecuta el script

Ve a `scripts/seed-mauri.sql` y copia el contenido completo.

Pégalo en Supabase SQL Editor y ejecuta.

---

## 🧪 Test Después del Setup

1. Inicia el servidor:
   ```bash
   npm run dev
   ```

2. Abre en tu navegador:
   ```
   http://localhost:3000/mauri
   ```

3. Deberías ver:
   - ✅ Calendario con 14 días
   - ✅ Horarios: 9:00-12:00, 14:00-20:00 (11 horarios por día)
   - ✅ Todo clickeable (azul #0066CC)
   - ✅ Formulario de reserva a la derecha

---

## 📊 Datos que se Agregan

### Trainer
```javascript
{
  slug: "mauri",
  name: "Mauricio Martin",
  bio: "The Padel Doctor | Especializado en técnica clínica...",
  email: "mauri@padeldoctor.com",
  phone: "+1234567890",
  price: 99,
  rating: 4.9,
  total_reviews: 156,
  specializations: ["Técnica Clínica", "Estrategia Competitiva", "Mentalidad Ganadora"],
  image_url: "/trainers/mauri/hero.jpg",
  status: "active"
}
```

### Availability Slots
- **Fechas**: Hoy + próximos 13 días (14 días totales)
- **Horarios**: 9:00, 10:00, 11:00, 12:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00
- **Sin almuerzo**: 13:00 está excluido
- **Total slots**: 14 días × 11 horarios = **154 slots**
- **Estado**: Todos disponibles (no booked)

---

## ✅ URLs Después

Ambas rutas funcionan igual:
- `http://localhost:3000/mauri` ← Alias corto
- `http://localhost:3000/mauricio-martin` ← URL completa

---

## 🔧 Troubleshooting

### "No se ve el calendario"
- Verifica que Supabase está en línea
- Revisa que la DB tiene los availability_slots
- Abre la consola del navegador (F12) para ver errores

### "Error al insertar slots"
- Verifica que el trainer fue creado exitosamente
- Comprueba que tienes permiso para escribir en availability_slots
- Intenta el setup nuevamente

### "Slots no aparecen en el calendario"
- Verifica en Supabase que existan los slots
- Recarga la página (Ctrl+R)
- Revisa que las fechas son válidas (YYYY-MM-DD)

---

## 📝 Notas

- El script verifica si el trainer ya existe (por slug)
- Si ya tiene slots, no inserta duplicados
- Los slots son para 1 persona cada uno (max_capacity: 1)
- Todos los slots comienzan como disponibles (is_available: true)

---

## 🎯 Próximos Pasos

1. ✅ Ejecutar setup (Opción 1 o 2)
2. ✅ Visitar http://localhost:3000/mauri
3. ✅ Seleccionar fecha y hora
4. ✅ Completar formulario de reserva
5. ✅ Recibir confirmación

---

¡Listo! Mauricio Martin está activado y listo para recibir reservas. 🎾✨
