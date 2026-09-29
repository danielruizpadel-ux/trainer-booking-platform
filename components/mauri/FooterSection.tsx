export default function FooterSection() {
  return (
    <footer className="bg-[#252824] px-4 py-9 text-[#f8f5ed] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em]">
            The Padel Doctor
          </p>
          <p className="mt-2 text-sm text-[#c8c4b7]">
            Mauricio Martin · Entrenamiento privado de pádel
          </p>
        </div>
        <a
          href="#reserva"
          className="w-fit border-b border-[#f8f5ed] pb-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f8f5ed]"
        >
          Ver disponibilidad ↗
        </a>
      </div>
    </footer>
  )
}
