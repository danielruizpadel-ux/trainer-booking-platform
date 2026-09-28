# Trainer Booking Platform

**Empieza aquí para entender ramas, decisiones, tareas y protocolo:** [Centro de control del proyecto](docs/CONTROL_DEL_PROYECTO.md).

> ## ⛔ ¿Vas a publicarlo?
> **Lee [`docs/ANTES_DE_PUBLICAR.md`](docs/ANTES_DE_PUBLICAR.md) antes de hacer deploy.**
> Tal cual está, publicarlo expone la base de datos entera: hay una clave de
> servicio escrita en claro en `scripts/` y versionada en git, y endpoints de
> administración sin ninguna autenticación.

Plataforma de reservas para entrenadores: landing por entrenador + calendario de
reserva con descuento por volumen. En producción hoy: `/mauri`
(Mauricio Martin — The Padel Doctor).

## Arrancar

Node 20 (ver `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # y rellenar las claves de Supabase
npm run dev                  # http://localhost:3001
```

Variables necesarias en `.env.local`:

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave pública (navegador) |
| `SUPABASE_SERVICE_ROLE_KEY` | **obligatoria**: sin ella las rutas de servidor no ven los huecos (RLS) |

## Scripts

| Comando | |
|---|---|
| `npm run dev` | desarrollo en el puerto 3001 |
| `npm run build` / `npm start` | producción |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint` | |
| `npm run format` | prettier |

## Dónde está cada cosa

```
app/mauri/page.tsx            landing + reserva de Mauri
app/[trainerSlug]/page.tsx    landing genérica por slug
app/api/availability/         huecos que pinta el calendario
app/api/reservations/         alta de reservas
app/api/coaches/              listado público de entrenadores (sin datos de contacto)
app/api/trainers/[id]/        perfil propio del entrenador (requiere sesión)
app/dashboard/                dashboard del entrenador (login, auth, área privada)
proxy.ts                      protege /dashboard/** (Next 16: antes middleware.ts)
lib/auth/                     entrenador a partir de la sesión
components/mauri/             secciones de la landing
components/booking/           flujo de reserva (2 pasos)
components/trainer/calendar/  calendario — referencia visual del proyecto
lib/availability/             regla única de disponibilidad
lib/supabase/client.ts        clientes de Supabase (anon y service role)
migrations/                   histórico; NO refleja lo desplegado
scripts/                      alta de entrenador y datos de prueba
```

## Documentación

| Documento | Para qué |
|---|---|
| [`docs/ANTES_DE_PUBLICAR.md`](docs/ANTES_DE_PUBLICAR.md) | ⛔ **checklist obligatoria antes de cualquier deploy** |
| [`CLAUDE.md`](CLAUDE.md) | **empieza aquí**: las reglas del proyecto y las trampas conocidas |
| [`docs/DATABASE.md`](docs/DATABASE.md) | esquema real de Supabase — manda sobre `migrations/` |
| [`docs/BOOKING_FLOW.md`](docs/BOOKING_FLOW.md) | cómo funciona la reserva, de la página a la base de datos |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | tokens y reglas visuales |
| [`docs/estado-desarrollo.md`](docs/estado-desarrollo.md) | dashboard del entrenador: fases, qué hay hecho, pasos manuales pendientes |
| [`docs/SETUP_TRAINER.md`](docs/SETUP_TRAINER.md) | alta de entrenador y huecos — **incluye un aviso de seguridad sobre `scripts/`** |

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 3 · framer-motion · Supabase
