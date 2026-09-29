/**
 * Interruptor del prototipo de /programa (Player Development Plan).
 *
 * Las pantallas de /programa enseñan jugadores, entrenadores, notas y precios
 * inventados (lib/programs/sample-data.ts). Publicadas sin más parecerían
 * funcionalidad real, así que solo existen con `PROGRAMA_DEMO=1`:
 *
 *   PROGRAMA_DEMO=1 npm run dev
 *
 * Sin esa variable, /programa/** responde 404 en todas partes, también en
 * desarrollo y en cualquier deploy (Vercel, preview o producción). No se usa
 * NODE_ENV a propósito: el .env.local del proyecto lo fija a mano y un deploy
 * no debe depender de eso.
 *
 * Doble barrera: proxy.ts corta la petición antes de renderizar nada, y cada
 * página llama a requireProgramDemo() (lib/programs/require-demo.ts), porque
 * un layout por sí solo no impide que se rendericen sus páginas.
 *
 * Este archivo no importa nada para que proxy.ts pueda usarlo.
 */

export const PROGRAM_DEMO_ENV = 'PROGRAMA_DEMO'

export function isProgramDemoEnabled(): boolean {
  return process.env.PROGRAMA_DEMO === '1'
}
