// Ejecuta el generate.ts REAL con un Supabase falso que devuelve las filas
// que se le pasan (JSON por stdin: { trainerId, revision, slots, weekly }) y
// escribe en stdout { plan, revision } tal como los manda a apply_window_plan. No escribe nada en ningún
// sitio. Lo usa scripts/verify-window-plan-db.sh para aplicar ese plan real
// en Postgres aislado.
import fs from 'node:fs'
import { fakeSupabase, load } from './ts-harness.mjs'

const input = JSON.parse(fs.readFileSync(0, 'utf8'))
const { generateSlotsForTrainer } = load('lib/availability/generate.ts')
const supabase = fakeSupabase((table) => {
  if (table === 'trainers') return { data: { availability_revision: input.revision ?? 0 }, error: null }
  if (table === 'trainer_weekly_hours') return { data: input.weekly, error: null }
  if (table === 'trainer_availability_overrides') return { data: [], error: null }
  if (table === 'availability_slots') return { data: input.slots, error: null }
  throw new Error(`escritura o tabla inesperada: ${table}`)
})
let call = null
supabase.rpc = async (_name, args) => {
  call = args
  return { data: {}, error: null }
}
await generateSlotsForTrainer(supabase, input.trainerId, 1)
// { plan, revision }: lo que apply_window_plan recibiría
process.stdout.write(JSON.stringify({ plan: call.p_plan, revision: call.p_revision }))
