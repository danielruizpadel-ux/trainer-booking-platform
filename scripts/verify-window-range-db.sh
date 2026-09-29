#!/usr/bin/env bash
# Migración 015: una reserva viva no puede quedar fuera del horario de su
# ventana. Postgres aislado (Docker, contenedor desechable). No toca Supabase.
#
# Esquema desplegado de referencia + 008, 011, 012, 013, 014 y 015.
#
#   M. Se aplica; es idempotente; se niega (sin tocar nada) si ya hay
#      reservas vivas fuera de su ventana.
#   P. Caminos: web pública, reserva manual, clase puntual (012), mover
#      (reprogramar), propuesta de nueva hora, paquete; reservas no vivas;
#      acortar una ventana a mano.
#   C. Concurrencia: reserva → acortamiento y acortamiento → reserva, con
#      apply_window_plan (014) y con un UPDATE directo.
#
#   bash scripts/verify-window-range-db.sh
set -uo pipefail
cd "$(dirname "$0")/.."

NAME="verify-window-range-db-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test postgres:16-alpine >/dev/null || exit 1
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do
  docker exec "$NAME" psql -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done

fail=0
pass() { echo "ok   - $1"; }
bad() { echo "FAIL - $1"; fail=1; }
qd() { docker exec -i "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -qtA -c "$2" 2>&1; }
rund() { docker exec -i "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q 2>&1; }
DB=rng
q() { qd $DB "$1"; }
check() { if [[ "$3" == "$2" ]]; then pass "$1 ($3)"; else bad "$1: esperado «$2», obtenido «$3»"; fi; }
checkre() { if [[ "$3" =~ $2 ]]; then pass "$1"; else bad "$1: no casa /$2/ con «$3»"; fi; }

setup() { # setup <db> <hasta>: esquema desplegado + migraciones 008, 011.. hasta <hasta> (sin la 015 si hasta=014)
  qd postgres "create database $1" >/dev/null
  rund "$1" < scripts/db/deployed-schema.sql >/dev/null
  for f in 008_reservations_no_overlap 011_schema_compat 012_one_off_reservation 013_reservations_slot_fk_restrict 014_apply_window_plan 015_reservations_within_window 016_availability_revision; do
    [[ "$f" > "$2" ]] && break
    out=$(rund "$1" < migrations/$f.sql) || { bad "$1: $f: $out"; return 1; }
  done
}

T=11111111-1111-4111-8111-111111111111
D=2099-07-01
id() { printf '00000000-0000-4000-8000-%012d' "$1"; }
W=$(id 1); W2=$(id 2); W3=$(id 3); W4=$(id 4); W5=$(id 5); W6=$(id 6)

# ─── M. Migración ────────────────────────────────────────────────────────────
setup legacy 014_zzz
qd legacy "insert into trainers (id, slug) values ('$T', 't');
           insert into availability_slots (id, trainer_id, session_date, start_time, end_time, generated_by_pattern) values ('$W', '$T', '$D', '09:00', '10:00', true);
           insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$W', '$T', 'Fuera', 'f@x', 'confirmed', '09:30', '10:30')" >/dev/null
before=$(qd legacy "select md5(string_agg(r::text, '|')) from reservations r")
checkre "M1 con una reserva viva ya fuera de su ventana, la 015 se niega" "015: hay reservas vivas fuera del horario de su ventana" "$(rund legacy < migrations/015_reservations_within_window.sql)"
check "M1 y no toca nada (ni datos ni triggers)" "$before|0" "$(qd legacy "select md5(string_agg(r::text, '|')) from reservations r")|$(qd legacy "select count(*) from pg_trigger where tgname = 'reservations_within_window'")"
qd legacy "update reservations set status = 'cancelled'" >/dev/null
out=$(rund legacy < migrations/015_reservations_within_window.sql); [[ $? -eq 0 ]] && pass "M1 una cancelada fuera de la ventana no impide aplicarla" || bad "M1: $out"

setup $DB 016_zzz && pass "M2 esquema desplegado + 008, 011 … 016"
out=$(rund $DB < migrations/015_reservations_within_window.sql); [[ $? -eq 0 ]] && pass "M2 idempotente" || bad "M2: $out"

q "insert into trainers (id, slug) values ('$T', 't');
   insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values
     ('$W',  '$T', '$D', '09:00', '13:00', 'available', true),
     ('$W2', '$T', '$D', '15:00', '17:00', 'available', true),
     ('$W3', '$T', '$D', '11:00', '15:00', 'available', true),
     ('$W4', '$T', '2099-07-02', '09:00', '17:00', 'available', true),
     ('$W5', '$T', '2099-07-03', '09:00', '17:00', 'available', true),
     ('$W6', '$T', '2099-07-04', '09:00', '17:00', 'available', true)" >/dev/null
ins() { # ins <ventana> <ini> <fin> <quien> [estado]
  q "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$1', '$T', '$4', 'x@x', '${5:-pending_confirmation}', '$2', '$3') returning 'ok'"
}

# ─── P. Caminos ──────────────────────────────────────────────────────────────
checkre "P1 web pública (pending_confirmation) fuera de la ventana → 23514" "reservations_within_window" "$(ins $W 12:30 13:30 Web)"
check   "P1 dentro → ok" "ok" "$(ins $W 09:00 10:00 Web)"
checkre "P2 manual (confirmed) que empieza antes de la ventana → 23514" "reservations_within_window" "$(ins $W 08:30 09:30 Manual confirmed)"
checkre "P3 propuesta de nueva hora (reschedule_proposed) fuera → 23514" "reservations_within_window" "$(ins $W2 16:30 17:30 Prop reschedule_proposed)"
check   "P4 una no viva (cancelada) fuera no se comprueba" "ok" "$(ins $W2 16:30 17:30 Hist cancelled)"
checkre "P5 mover (reprogramar) a otra ventana donde no cabe → 23514" "reservations_within_window" \
  "$(q "update reservations set availability_slot_id = '$W2', start_time = '16:30', end_time = '17:30' where client_name = 'Web'")"
check   "P5 mover a una hora que sí cabe → ok" "UPDATE 1" "$(docker exec -i "$NAME" psql -U postgres -d $DB -tA -c "update reservations set availability_slot_id = '$W2', start_time = '15:00', end_time = '16:00' where client_name = 'Web'")"
checkre "P6 reactivar (cancelada → confirmada) una que está fuera → 23514" "reservations_within_window" "$(q "update reservations set status = 'confirmed' where client_name = 'Hist'")"
check   "P7 clase puntual (012): su ventana exacta, dentro → ok" "1" \
  "$(q "select count(*) from create_one_off_reservation('$T', '$D', '20:00', '21:00', 60, 'Puntual', 'p@x', null, null, 300, 'confirmed')")"
# Paquete: la función schedule_package_session es de otra rama; el insert es un insert normal en reservations.
checkre "P8 insert de paquete (confirmed) fuera → 23514" "reservations_within_window" "$(ins $W2 14:30 15:30 Paquete confirmed)"
checkre "P9 acortar a mano una ventana dejando fuera una reserva viva → 23514" "reservations_within_window" \
  "$(q "update availability_slots set end_time = '15:30' where id = '$W2'")"
q "update reservations set status = 'cancelled' where client_name = 'Web'" >/dev/null
check   "P9 con solo canceladas fuera, sí se puede acortar" "UPDATE 1" "$(docker exec -i "$NAME" psql -U postgres -d $DB -tA -c "update availability_slots set end_time = '15:30' where id = '$W2'")"

# ─── C. Concurrencia ─────────────────────────────────────────────────────────
hold() { # hold <sql> <commit|rollback>: transacción abierta 2 s en segundo plano
  docker exec -i "$NAME" psql -U postgres -d $DB -qtA >/dev/null 2>&1 <<SQL &
begin;
$1;
select pg_sleep(2);
$2;
SQL
  sleep 0.7
}
ms() { sed -nE 's/.*waited_ms=([0-9]+).*/\1/p' <<<"$1"; }
timed() { # timed <sql>: resultado + waited_ms
  q "do \$\$ declare t0 timestamptz := clock_timestamp(); begin $1; raise notice 'ok waited_ms=%', (extract(epoch from clock_timestamp() - t0) * 1000)::int; exception when others then raise notice '% % waited_ms=%', sqlstate, sqlerrm, (extract(epoch from clock_timestamp() - t0) * 1000)::int; end \$\$" 2>&1 | sed -E 's/^NOTICE: +//'
}

# Reserva → acortamiento (sincronización 014): el plan espera y, al ver la reserva, cierra en vez de acortar.
hold "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$W3', '$T', 'C1', 'x@x', 'pending_confirmation', '13:00', '14:00')" commit
r=$(timed "perform apply_window_plan('$T', '{\"update_end\":[{\"id\":\"$W3\",\"end_time\":\"12:00\"}]}'::jsonb, (select availability_revision from trainers where id = '$T'))"); wait
checkre "C1 reserva → acortamiento (014): el plan espera a la reserva" "^ok" "$r"
[[ $(ms "$r") -ge 800 ]] && pass "C1 esperó $(ms "$r") ms" || bad "C1 no esperó ($(ms "$r") ms)"
check "C1 la ventana no se acorta: se cierra; la reserva sigue dentro" "15:00:00|blocked|1" \
  "$(q "select end_time || '|' || status from availability_slots where id = '$W3'")|$(q "select count(*) from reservations where client_name = 'C1'")"

# Acortamiento (014) → reserva: la reserva espera y ve el rango nuevo.
hold "select apply_window_plan('$T', '{\"update_end\":[{\"id\":\"$W4\",\"end_time\":\"12:00\"}]}'::jsonb, (select availability_revision from trainers where id = '$T'))" commit
r=$(timed "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$W4', '$T', 'C2', 'x@x', 'pending_confirmation', '13:00', '14:00')"); wait
checkre "C2 acortamiento (014) → reserva validada con el rango viejo: la base la rechaza (antes entraba, C4)" "^23514 reservations_within_window" "$r"
[[ $(ms "$r") -ge 800 ]] && pass "C2 la reserva esperó al acortamiento ($(ms "$r") ms)" || bad "C2 no esperó ($(ms "$r") ms)"
check "C2 ventana acortada y ninguna reserva fuera" "12:00:00|0" "$(q "select end_time from availability_slots where id = '$W4'")|$(q "select count(*) from reservations where client_name = 'C2'")"

# Lo mismo con un UPDATE directo de la ventana, en los dos órdenes.
hold "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$W5', '$T', 'C3', 'x@x', 'confirmed', '15:00', '16:00')" commit
r=$(timed "update availability_slots set end_time = '12:00' where id = '$W5'"); wait
checkre "C3 reserva → UPDATE directo que acorta: espera y la base lo rechaza" "^23514 reservations_within_window" "$r"
[[ $(ms "$r") -ge 800 ]] && pass "C3 esperó $(ms "$r") ms" || bad "C3 no esperó ($(ms "$r") ms)"
check "C3 la ventana sigue 09-17 y la reserva dentro" "17:00:00|1" "$(q "select end_time from availability_slots where id = '$W5'")|$(q "select count(*) from reservations where client_name = 'C3'")"
hold "update availability_slots set end_time = '14:00' where id = '$W6'" commit
r=$(timed "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$W6', '$T', 'C4', 'x@x', 'confirmed', '14:00', '15:00')"); wait
checkre "C4 UPDATE directo que acorta → reserva: espera y la base la rechaza" "^23514 reservations_within_window" "$r"
[[ $(ms "$r") -ge 800 ]] && pass "C4 esperó $(ms "$r") ms" || bad "C4 no esperó ($(ms "$r") ms)"
check "C4 ventana acortada a 14:00 y la reserva no existe" "14:00:00|0" \
  "$(q "select end_time from availability_slots where id = '$W6'")|$(q "select count(*) from reservations where client_name = 'C4'")"

check "ninguna reserva viva fuera de su ventana al final" "0" \
  "$(q "select count(*) from reservations r join availability_slots s on s.id = r.availability_slot_id where coalesce(r.status,'') not in ('cancelled','canceled','needs_reschedule') and (r.start_time < s.start_time or r.end_time > s.end_time)")"

exit $fail
