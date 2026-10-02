export default function FooterSection({ trainerName }: { trainerName: string }) {
  return (
    <footer className="border-t border-mauri-graphite-line bg-mauri-graphite px-4 py-9 text-mauri-paper sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2.5 font-mauri-display text-base font-bold uppercase tracking-[0.07em]">
            <span aria-hidden className="h-2 w-2 rotate-45 bg-mauri-teal-light" />
            The Padel Doctor
          </p>
          <p className="mt-2 text-sm text-mauri-muted-d">{trainerName} · Clases privadas de pádel</p>
        </div>
        <a
          href="#reserva"
          className="w-fit border-b-[1.5px] border-mauri-teal-light pb-1 font-mauri-display text-sm font-bold uppercase tracking-[0.1em] focus:outline-none focus-visible:ring-2 focus-visible:ring-mauri-teal-light"
        >
          Ver horarios
        </a>
      </div>
    </footer>
  )
}
