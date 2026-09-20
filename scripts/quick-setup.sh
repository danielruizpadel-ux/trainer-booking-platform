#!/bin/bash
# ###################################################################
#  AVISO: este script lleva la SERVICE ROLE KEY escrita en claro.
#  Esa clave se salta el RLS: acceso total a la base de datos.
#  NO subir este archivo a GitHub sin rotar la clave y limpiar el
#  historial de git. Ver docs/ANTES_DE_PUBLICAR.md (bloqueante 1).
# ###################################################################

# Quick setup para agregar Mauricio Martin a Supabase
# Requiere: curl

SUPABASE_URL="https://vkriseshpcjvgsnwzqcs.supabase.co"
SUPABASE_KEY="sb_secret_7lHjpNNrrf4Llhgu1pTjRQ_rx-YUEHg"

echo "🚀 Setup Rápido - Mauricio Martin"
echo ""

# 1. Insertar trainer
echo "📝 Paso 1: Insertar trainer..."

TRAINER=$(curl -s -X POST "$SUPABASE_URL/rest/v1/trainers" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "mauri",
    "name": "Mauricio Martin",
    "bio": "The Padel Doctor | Especializado en técnica clínica, estrategia competitiva y mentalidad ganadora",
    "email": "mauri@padeldoctor.com",
    "phone": "+1234567890",
    "rating": 4.9,
    "total_reviews": 156,
    "specializations": ["Técnica Clínica", "Estrategia Competitiva", "Mentalidad Ganadora"],
    "image_url": "/trainers/mauri/hero.jpg",
    "status": "active"
  }')

# Extract ID (simple parsing)
TRAINER_ID=$(echo "$TRAINER" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$TRAINER_ID" ]; then
  echo "⚠️  Trainer podría existir. Buscando..."

  SEARCH=$(curl -s "$SUPABASE_URL/rest/v1/trainers?slug=eq.mauri" \
    -H "apikey: $SUPABASE_KEY")

  TRAINER_ID=$(echo "$SEARCH" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
fi

if [ -z "$TRAINER_ID" ]; then
  echo "❌ Error: No se pudo obtener ID del trainer"
  echo "Respuesta: $TRAINER"
  exit 1
fi

echo "✅ Trainer ID: $TRAINER_ID"
echo ""

# 2. Insertar slots
echo "📅 Paso 2: Insertar 154 availability slots..."
echo "  Esto toma ~30 segundos..."

TODAY=$(date +%Y-%m-%d)
BATCH_NUM=1
TOTAL=0

for DAY in {0..13}; do
  # Calcular fecha (macOS y Linux compatible)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    CURRENT_DATE=$(date -v+${DAY}d -f %Y-%m-%d "$TODAY" +%Y-%m-%d 2>/dev/null || echo "$TODAY")
  else
    CURRENT_DATE=$(date -d "$TODAY + $DAY days" +%Y-%m-%d 2>/dev/null || echo "$TODAY")
  fi

  # Crear JSON para los slots del día
  SLOTS="["

  for HOUR in 9 10 11 12 14 15 16 17 18 19 20; do
    if [ $TOTAL -gt 0 ] || [ $HOUR -gt 9 ]; then
      SLOTS="$SLOTS,"
    fi

    START_TIME=$(printf "%02d:00" $HOUR)
    END_TIME=$(printf "%02d:00" $((HOUR + 1)))

    SLOTS="$SLOTS{\"trainer_id\":\"$TRAINER_ID\",\"session_date\":\"$CURRENT_DATE\",\"start_time\":\"$START_TIME\",\"end_time\":\"$END_TIME\",\"max_capacity\":1,\"current_bookings\":0,\"class_type\":\"individual\",\"is_available\":true}"

    TOTAL=$((TOTAL + 1))
  done

  SLOTS="$SLOTS]"

  # Insertar batch
  curl -s -X POST "$SUPABASE_URL/rest/v1/availability_slots" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Content-Type: application/json" \
    -d "$SLOTS" > /dev/null

  echo "  ✅ Día $((DAY + 1))/14: 11 slots"
done

echo ""
echo "✅ COMPLETADO!"
echo ""
echo "📊 Resumen:"
echo "  Trainer: Mauricio Martin"
echo "  ID: $TRAINER_ID"
echo "  Email: mauri@padeldoctor.com"
echo "  Total Slots: $TOTAL"
echo ""
echo "🌐 Abre: http://localhost:3000/mauri"
echo ""
