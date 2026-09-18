#!/bin/bash

# Setup Mauricio Martin en Supabase usando REST API
# Bash script compatible con cualquier versión de Node.js

SUPABASE_URL="https://vkriseshpcjvgsnwzqcs.supabase.co"
SUPABASE_KEY="sb_secret_7lHjpNNrrf4Llhgu1pTjRQ_rx-YUEHg"
HEADERS="Authorization: Bearer $SUPABASE_KEY"
CONTENT_TYPE="Content-Type: application/json"

echo "🚀 Iniciando setup de Mauricio Martin en Supabase..."
echo ""

# 1. Insertar trainer
echo "📝 Insertando trainer Mauricio Martin..."

TRAINER_JSON=$(cat <<'EOF'
{
  "slug": "mauri",
  "name": "Mauricio Martin",
  "bio": "The Padel Doctor | Especializado en técnica clínica, estrategia competitiva y mentalidad ganadora",
  "email": "mauri@padeldoctor.com",
  "phone": "+1234567890",
  "price": 99,
  "rating": 4.9,
  "total_reviews": 156,
  "specializations": ["Técnica Clínica", "Estrategia Competitiva", "Mentalidad Ganadora"],
  "image_url": "/trainers/mauri/hero.jpg",
  "status": "active"
}
EOF
)

TRAINER_RESPONSE=$(curl -s -X POST \
  "$SUPABASE_URL/rest/v1/trainers?select=id" \
  -H "$HEADERS" \
  -H "$CONTENT_TYPE" \
  -d "$TRAINER_JSON")

# Extract trainer ID
TRAINER_ID=$(echo "$TRAINER_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$TRAINER_ID" ]; then
  # Probablemente ya existe, intentar obtener el ID
  echo "⚠️  Trainer podría no haberse creado. Buscando existente..."

  SEARCH_RESPONSE=$(curl -s "$SUPABASE_URL/rest/v1/trainers?slug=eq.mauri&select=id" \
    -H "$HEADERS")

  TRAINER_ID=$(echo "$SEARCH_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

  if [ -z "$TRAINER_ID" ]; then
    echo "❌ No se pudo obtener el ID del trainer"
    echo "Respuesta: $TRAINER_RESPONSE"
    exit 1
  fi
fi

echo "✅ Trainer insertado (ID: $TRAINER_ID)"
echo ""

# 2. Insertar availability slots
echo "📅 Generando e insertando 154 availability slots..."

TODAY=$(date +%Y-%m-%d)

# Función para agregar días a una fecha
add_days() {
  local date="$1"
  local days="$2"
  date -d "$date + $days days" +%Y-%m-%d 2>/dev/null || date -v+${days}d -f %Y-%m-%d "$date" +%Y-%m-%d
}

# Array de horas disponibles
HOURS=(9 10 11 12 14 15 16 17 18 19 20)
BATCH=1
TOTAL_SLOTS=0

# Loop por 14 días
for DAY in {0..13}; do
  CURRENT_DATE=$(add_days "$TODAY" "$DAY")

  # Loop por cada hora
  for HOUR in "${HOURS[@]}"; do
    START_TIME=$(printf "%02d:00" $HOUR)
    END_TIME=$(printf "%02d:00" $((HOUR + 1)))

    # Construir JSON para cada slot
    if [ $TOTAL_SLOTS -eq 0 ]; then
      SLOTS_BATCH="["
    else
      SLOTS_BATCH="${SLOTS_BATCH},"
    fi

    SLOTS_BATCH="${SLOTS_BATCH}
    {
      \"trainer_id\": \"$TRAINER_ID\",
      \"session_date\": \"$CURRENT_DATE\",
      \"start_time\": \"$START_TIME\",
      \"end_time\": \"$END_TIME\",
      \"max_capacity\": 1,
      \"current_bookings\": 0,
      \"class_type\": \"individual\",
      \"is_available\": true
    }"

    TOTAL_SLOTS=$((TOTAL_SLOTS + 1))

    # Insertar en batches de 20
    if [ $((TOTAL_SLOTS % 20)) -eq 0 ] || [ $DAY -eq 13 ] && [ "$HOUR" == "${HOURS[-1]}" ]; then
      SLOTS_BATCH="${SLOTS_BATCH}]"

      # Insertar batch
      curl -s -X POST \
        "$SUPABASE_URL/rest/v1/availability_slots" \
        -H "$HEADERS" \
        -H "$CONTENT_TYPE" \
        -d "$SLOTS_BATCH" > /dev/null

      echo "  ✅ Lote $BATCH: 20 slots insertados"
      BATCH=$((BATCH + 1))
      SLOTS_BATCH=""
    fi
  done
done

echo "✅ Total: $TOTAL_SLOTS slots insertados"
echo ""

echo "📊 RESUMEN FINAL:"
echo "  ✅ Trainer: Mauricio Martin (ID: $TRAINER_ID)"
echo "  ✅ Slug: mauri"
echo "  ✅ Total Slots: $TOTAL_SLOTS"
echo ""
echo "🌐 Accesible en:"
echo "  → http://localhost:3000/mauri"
echo ""
echo "✨ ¡Setup completado!"
