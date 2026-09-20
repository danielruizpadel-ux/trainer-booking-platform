# Sistema de diseño — alinear la landing con el calendario

El calendario de reservas (`components/trainer/calendar/*` + `components/booking/*`)
ya está rediseñado y es la **referencia canónica**. La landing de Mauri
(`components/mauri/*`) sigue con el estilo antiguo y desentona.

**Objetivo:** que toda la web hable el mismo idioma visual que el calendario.
**No tocar:** `components/trainer/calendar/*`, `components/booking/*`, `lib/dateUtils.ts`.

---

## 1. Tokens (copiar literalmente del calendario)

### Superficies
| Uso | Clases |
|---|---|
| Tarjeta | `bg-white rounded-2xl ring-1 ring-gray-200/70 p-6` |
| Tarjeta interactiva | añadir `hover:ring-gray-300 transition-all duration-150` |
| Fondo de sección alterno | `bg-gray-50/50` |
| Fondo de sección base | `bg-white` |
| Separador | `border-t border-gray-100` |

**Nada de `shadow-md` / `shadow-lg` / `shadow-xl` / `shadow-2xl`.** La profundidad
se consigue con `ring-1 ring-gray-200/70`. La única sombra permitida es la
sombra de color del botón primario: `shadow-sm shadow-blue-600/25`.

**Nada de `border-l-4`.** Ese acento lateral se elimina en todas las tarjetas.

### Tipografía
| Uso | Clases |
|---|---|
| Título de sección | `text-2xl sm:text-3xl font-bold tracking-tight text-gray-900` |
| Subtítulo de sección | `mt-1.5 text-gray-500` (nunca `text-xl text-gray-600`) |
| Título de tarjeta | `text-base font-semibold text-gray-900` |
| Cuerpo | `text-sm text-gray-600` |
| Etiqueta / eyebrow | `text-xs font-semibold uppercase tracking-wider text-gray-400` |
| Cifras y precios | añadir `tabular-nums` |

Los `text-4xl md:text-5xl` de la landing bajan a `text-2xl sm:text-3xl`.
El hero es la única excepción (ver §3).

### Botones
```
Primario   h-12 px-6 rounded-xl bg-blue-600 text-white font-semibold
           hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25
           transition-all duration-150
           focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2

Secundario h-12 px-6 rounded-xl bg-white text-gray-900 font-semibold
           ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50
           transition-all duration-150

Ghost      h-9 px-3 rounded-lg text-sm font-medium text-gray-500
           hover:bg-gray-100 hover:text-gray-900 transition-colors
```
Nada de `whileHover={{ scale: 1.05 }}`: el feedback es `active:scale-[0.98]` en CSS.

### Estados
- Reposo interactivo: `ring-1 ring-inset ring-gray-200`
- Hover: `hover:ring-blue-400 hover:bg-blue-50/60`
- Activo/seleccionado: `bg-blue-600 text-white shadow-sm shadow-blue-600/25`
- Foco: siempre `focus-visible:ring-2 focus-visible:ring-blue-500`
- Deshabilitado: `bg-gray-100 text-gray-400 cursor-not-allowed`

### Ritmo y layout
- Sección: `py-16 sm:py-20 px-4 sm:px-6 lg:px-8`
- Contenedor: `max-w-6xl mx-auto`
- Cabecera de sección → contenido: `mb-10`
- Rejilla de tarjetas: `gap-6`
- Dentro de una tarjeta: `gap-3` / `gap-4`

### Iconografía — regla dura
**Se eliminan TODOS los emojis de la interfaz.** Se sustituyen por SVG inline
con el mismo patrón que el calendario:

```jsx
<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  {/* path */}
</svg>
```

Contenedor de icono en tarjeta:
`h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center`

Emojis a sustituir: 🎯 ♟️ 🧠 🎾 🏆 💪 ⭐ 📧 ☎️ 💬 📱 📅 🎁 ↓

Para las estrellas de rating: SVG de estrella rellena en `text-amber-400`,
tamaño 16px, no el emoji ⭐.

### Movimiento
Framer Motion se queda solo para la entrada de sección:
```jsx
initial={{ opacity: 0, y: 12 }}
whileInView={{ opacity: 1, y: 0 }}
transition={{ duration: 0.4, ease: 'easeOut' }}
viewport={{ once: true, margin: '-80px' }}
```
Fuera: `whileHover={{ y: -5 }}`, `whileHover={{ y: -8 }}`, `scale: 0.95`,
`duration: 0.8`, animaciones en bucle. El hover vive en CSS.

---

## 2. Color

`app/globals.css` declara turquesa (`--primary: 186 100% 28%` → `#0891B2`) pero
**ninguna** de las variables se usa: todo el código usa `blue-600`.

Decisión: **`blue-600` es el color de marca** (es el del calendario).
Acciones:
1. Borrar de `globals.css` las variables de color que nadie usa
   (`--primary`, `--primary-dark`, `--accent`, `--light-bg`, `--success`, `--error`).
2. Borrar las clases `.btn-primary` / `.btn-secondary` (usan `cyan-600`, no se
   usan en ningún sitio y contradicen el sistema).
3. Dejar `globals.css` con las tres directivas de Tailwind, `scroll-behavior`,
   `-webkit-font-smoothing` y la fuente.

Verde solo para descuentos/éxito (`text-emerald-600`), rojo solo para errores
(`text-red-600`), ámbar solo para estrellas (`text-amber-400`).

---

## 3. Cambios archivo por archivo

### `components/mauri/PremiumHero.tsx`
- `h-screen` → `min-h-[88vh]` (que no obligue a hacer scroll a ciegas).
- Overlay: cambiar `bg-gradient-to-r from-blue-600 via-blue-600/50 to-transparent`
  por un overlay neutro que deje ver la foto de Mauri:
  `bg-gradient-to-t from-gray-950/80 via-gray-950/40 to-gray-950/10`.
  El azul saturado tapa la foto y pelea con el azul de los botones.
- Contenido: alinear a la izquierda en desktop
  (`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8` + `text-left`), no centrado.
- `h1`: `text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white`.
- Tagline: `mt-3 text-lg text-white/70 max-w-xl`.
- Rating: fila compacta con estrellas SVG `text-amber-400` +
  `<span className="text-white font-semibold tabular-nums">{rating}</span>` +
  `<span className="text-white/60 text-sm">({reviews} reseñas)</span>`.
  Quitar el `mb-12`, usar `mt-5`.
- CTA: botón primario del sistema pero invertido sobre foto —
  `h-12 px-7 rounded-xl bg-white text-gray-900 font-semibold hover:bg-gray-100 active:scale-[0.98]`.
  Añadir un secundario al lado: `Ver programas` (ancla a `#programas`) con
  `ring-1 ring-inset ring-white/30 text-white hover:bg-white/10`.
- Quitar el indicador de scroll animado ("Scroll para más" + ↓).

### `components/mauri/SpecialtiesSection.tsx`
- Sección: `py-16 sm:py-20 ... bg-white`, contenedor `max-w-6xl`.
- Cabecera alineada a la izquierda, no centrada: título `text-2xl sm:text-3xl
  font-bold tracking-tight` + subtítulo `mt-1.5 text-gray-500`, `mb-10`.
- Tarjeta: `bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 hover:ring-gray-300
  transition-all duration-150`. Fuera `shadow-md hover:shadow-xl` y `border-l-4`.
- Emoji → icono SVG en su contenedor `h-10 w-10 rounded-xl bg-blue-50 text-blue-600`.
  Sugerencias: diana/crosshair (Técnica), tablero o brújula (Estrategia),
  cerebro o chispa (Mentalidad).
- Título tarjeta `text-base font-semibold`, descripción `mt-2 text-sm text-gray-600`.
- El "Ejemplo:" pasa a ser una línea discreta:
  `mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500` (sin cursiva, sin azul).

### `components/mauri/CoursesSection.tsx`
- Añadir `id="programas"` a la sección (el hero enlaza ahí).
- Fondo de sección: `bg-gray-50/50` (para alternar con la anterior, que es blanca).
- Quitar `bg-gradient-to-br from-blue-50 to-blue-100` de la tarjeta → tarjeta blanca del sistema.
- Emoji → icono SVG igual que arriba.
- La caja de "Duración" desaparece como caja; pasa a metadato en línea:
  `text-xs font-semibold uppercase tracking-wider text-gray-400` + valor en `text-sm text-gray-700`.
- Precio: `text-2xl font-bold text-gray-900 tabular-nums` (no `text-3xl text-blue-600`).
  **Y cambiar `$` por `RM`**, que es la moneda que usa el calendario — ahora mismo
  la landing dice `$199` y la reserva dice `RM 300`. Incoherente.
- Botón: secundario del sistema (`ring-1 ring-inset ring-gray-200`), no azul sólido.
  El único botón azul sólido por pantalla debe ser el de reservar.

### `components/mauri/ReviewsSection.tsx`
Dijiste que las reviews inventadas hacen que la web "suene a IA". Tienes dos salidas:

**Opción A (recomendada, por defecto):** eliminar la sección entera —
quitar `<ReviewsSection />` de `app/mauri/page.tsx` y borrar el import.
El rating del hero ya aporta prueba social.

**Opción B:** dejar 3 reseñas (no 6), rediseñadas con el sistema: tarjeta blanca
con ring, estrellas SVG ámbar, texto `text-sm text-gray-600` sin comillas ni
cursiva, nombre en `text-sm font-medium text-gray-900` y el resultado en
`text-xs text-gray-500`. Fondo de sección `bg-white`, sin `bg-blue-50`.

Implementa la A y deja la B comentada en una línea al final del archivo.

### `components/mauri/CtaSection.tsx`
- **Bug:** el componente exige `onBookClick` pero `app/mauri/page.tsx` lo renderiza
  sin esa prop → `tsc` falla (`TS2741`) y el build de producción se rompe.
  Arreglo: quitar la prop y hacer el scroll dentro del componente, igual que
  `PremiumHero`:
  `document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' })`.
- Quitar `bg-gradient-to-r from-blue-600 to-blue-700`. Usar un bloque sobrio:
  `bg-gray-950 rounded-3xl px-8 py-14 text-center` dentro de una sección
  `py-16 sm:py-20` con fondo blanco, para que sea una tarjeta y no una franja.
- Título `text-2xl sm:text-3xl font-bold tracking-tight text-white`,
  subtítulo `mt-2 text-gray-400`.
- Botón: primario azul del sistema.

### `components/mauri/FooterSection.tsx`
- `bg-gray-900` → `bg-white border-t border-gray-100`, texto `text-gray-600`.
  El footer negro es lo único oscuro de la página y corta la lectura.
  (Si prefieres mantenerlo oscuro, usa `bg-gray-950` y ajusta el CTA para que no
  choque — pero no pueden ser dos bloques oscuros seguidos.)
- Emojis de contacto → SVG (sobre, teléfono, mensaje, cámara de Instagram), 18px,
  `text-gray-400` y el texto al lado en `text-sm`.
- Títulos de columna: `text-xs font-semibold uppercase tracking-wider text-gray-400`
  (no `text-lg font-bold text-blue-400`).
- Enlaces: `text-sm text-gray-600 hover:text-gray-900 transition-colors`.
- Bajar de 4 columnas a 3 (Marca / Contacto / Enlaces); Instagram entra en Contacto.
- Copyright: actualizar el año a 2026 y dejarlo en `text-xs text-gray-400`.
- `py-16` → `py-12`.

### `app/mauri/page.tsx`
- Borrar `PremiumHeroWrapper`: es un componente que solo reenvía props idénticas.
  Usar `<PremiumHero ... />` directamente.
- Ajustar el render de `CtaSection` tras quitarle la prop.
- Quitar `ReviewsSection` si aplicas la opción A.
- Pasar `trainerPrice` coherente con el calendario (300 RM) o quitar la prop,
  que `BookingSection` ya no la usa.

### `app/mauricio-martin/page.tsx`
- **Bug:** pasa `onBookClick` a `PremiumHero`, que no acepta esa prop (`TS2322`).
  Quitarlo. Si esta ruta es un duplicado de `/mauri`, conviértela en un
  `redirect('/mauri')` y borra el resto.

---

## 4. Limpieza

Estos componentes no los importa nadie. Borrarlos (o confirmar antes de borrar):
`components/trainer/calendar/CalendarLayout.tsx`, `CalendarViewToggle.tsx`,
`NavToggleButtons.tsx`, `NavigationArrows.tsx`, `PeriodDisplay.tsx`,
`MiniCalendar.tsx`, `DiscountSummary.tsx`, `components/mauri/CalendlyCalendar.tsx`,
`components/mauri/BookingForm.tsx`.

---

## 5. Verificación antes de dar por hecho

1. `npx tsc --noEmit` — que no aparezcan errores nuevos, y que **desaparezcan**
   los de `app/mauri/page.tsx` y `app/mauricio-martin/page.tsx`.
2. `grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' components/mauri app/mauri`
   → debe salir vacío (cero emojis en la UI).
3. `grep -rn "shadow-md\|shadow-lg\|shadow-xl\|shadow-2xl\|border-l-4" components/mauri`
   → vacío.
4. `grep -rn "text-4xl\|text-5xl\|text-6xl\|text-7xl" components/mauri`
   → solo en `PremiumHero`.
5. `grep -rn '\$' components/mauri/CoursesSection.tsx` → vacío (precios en RM).
6. Abrir `/mauri` y bajar de hero → especialidades → programas → calendario → CTA
   → footer: los bordes, los radios y los azules tienen que parecer el mismo
   componente repetido. Si una sección "pesa" más que el calendario, es que le
   queda sombra o tipografía grande.
7. Revisar a 375px de ancho: ninguna sección debe provocar scroll horizontal.
