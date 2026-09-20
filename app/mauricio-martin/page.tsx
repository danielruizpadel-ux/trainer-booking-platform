/**
 * Ruta duplicada de /mauri — se mantiene solo como alias.
 */

import { redirect } from 'next/navigation'

export default function MauricioMartinPage() {
  redirect('/mauri')
}
