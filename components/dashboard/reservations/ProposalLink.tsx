'use client'

import { useEffect, useState } from 'react'

interface ProposalLinkProps {
  token: string | null
  size?: 'sm' | 'md'
}

/**
 * El enlace público de una propuesta de nueva fecha. Mientras el email no
 * envíe nada real, el entrenador lo copia y se lo manda él mismo al cliente.
 */
export function ProposalLink({ token, size = 'md' }: ProposalLinkProps) {
  const [href, setHref] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // El origen solo se conoce en el navegador.
  useEffect(() => {
    if (token) setHref(`${window.location.origin}/propuesta/${token}`)
  }, [token])

  if (!token) {
    return <p className="text-xs text-gray-400">Link unavailable</p>
  }

  async function copy() {
    if (!href) return
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy the link:', href)
    }
  }

  const height = size === 'sm' ? 'h-9 px-3' : 'h-11 px-5'

  return (
    <div className={`flex flex-col gap-1.5 ${size === 'sm' ? 'items-end' : ''}`}>
      <p className="text-xs text-gray-500">Waiting for the client&apos;s reply</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          disabled={!href}
          className={`${height} rounded-xl bg-white text-gray-900 text-sm font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:text-gray-400 inline-flex items-center justify-center gap-2 whitespace-nowrap`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {copied ? <path d="m5 12 5 5L20 7" /> : <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>}
          </svg>
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline truncate max-w-[12rem]"
            title={href}
          >
            {href.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>
    </div>
  )
}
