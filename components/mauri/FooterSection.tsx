'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'

interface FooterSectionProps {
  email?: string
  phone?: string
  whatsapp?: string
  instagram?: string
}

export default function FooterSection({
  email = 'mauri@padeldoctor.com',
  phone = '+1234567890',
  whatsapp = '+1234567890',
  instagram = '@mauridoctor',
}: FooterSectionProps) {
  return (
    <footer className="bg-gray-900 text-white py-16 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <h3 className="text-2xl font-bold text-blue-400 mb-2">
              The Padel Doctor
            </h3>
            <p className="text-gray-400">
              Técnica Clínica • Estrategia • Mentalidad Ganadora
            </p>
          </motion.div>

          {/* Contact */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <h4 className="text-lg font-bold mb-4 text-blue-400">Contacto</h4>
            <div className="space-y-3">
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-2 text-gray-300 hover:text-blue-400 transition-colors"
              >
                <span>📧</span>
                {email}
              </a>
              <a
                href={`tel:${phone}`}
                className="flex items-center gap-2 text-gray-300 hover:text-blue-400 transition-colors"
              >
                <span>☎️</span>
                {phone}
              </a>
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-gray-300 hover:text-blue-400 transition-colors"
              >
                <span>💬</span>
                WhatsApp
              </a>
            </div>
          </motion.div>

          {/* Social */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <h4 className="text-lg font-bold mb-4 text-blue-400">Sígueme</h4>
            <a
              href={`https://instagram.com/${instagram.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-gray-300 hover:text-blue-400 transition-colors"
            >
              <span>📱</span>
              Instagram
            </a>
          </motion.div>

          {/* Quick Links */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            viewport={{ once: true }}
          >
            <h4 className="text-lg font-bold mb-4 text-blue-400">Links</h4>
            <div className="space-y-2">
              <Link
                href="/trainers"
                className="block text-gray-300 hover:text-blue-400 transition-colors"
              >
                Ver otros trainers
              </Link>
              <Link
                href="/"
                className="block text-gray-300 hover:text-blue-400 transition-colors"
              >
                Inicio
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-800 pt-8">
          <div className="text-center text-gray-500 text-sm">
            <p>© 2024 Mauricio Martin - The Padel Doctor. Todos los derechos reservados.</p>
            <p className="mt-2">
              Plataforma de reservas{' '}
              <Link
                href="/"
                className="text-blue-400 hover:text-blue-300"
              >
                Trainer Booking
              </Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
