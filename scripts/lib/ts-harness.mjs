// Carga los .ts REALES del repo en node:test, sin bundler ni dependencias
// nuevas: transpila con `typescript` (ya en devDependencies) y resuelve el
// alias @/. `mock()` sustituye un módulo concreto por un doble.
import fs from 'node:fs'
import path from 'node:path'
import Module, { createRequire } from 'node:module'

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
export const require = createRequire(import.meta.url)
const ts = require('typescript')

const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith('@/')) {
    const base = path.join(root, request.slice(2))
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
    }
  }
  if (request.startsWith('.') && /\.tsx?$/.test(parent?.filename ?? '')) {
    const base = path.resolve(path.dirname(parent.filename), request)
    for (const candidate of [`${base}.ts`, `${base}.tsx`]) if (fs.existsSync(candidate)) return candidate
  }
  return originalResolve.call(this, request, parent, ...rest)
}
for (const ext of ['.ts', '.tsx']) {
  Module._extensions[ext] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
      fileName: filename,
    })
    module._compile(outputText, filename)
  }
}

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'dummy'

export function mock(relativePath, exports) {
  const filename = path.join(root, relativePath)
  const m = new Module(filename)
  m.filename = filename
  m.loaded = true
  m.exports = exports
  require.cache[filename] = m
}

export function load(relativePath) {
  return require(path.join(root, relativePath))
}

export const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

/**
 * Supabase falso: cualquier cadena de métodos; `respond(table, ops)` decide la
 * respuesta al hacer await. `ops` = [{ op, args }] en orden.
 */
export function fakeSupabase(respond) {
  return {
    from(table) {
      const ops = []
      const builder = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve, reject) => {
                try {
                  resolve(respond(table, ops))
                } catch (error) {
                  reject(error)
                }
              }
            }
            return (...args) => {
              ops.push({ op: prop, args })
              return builder
            }
          },
        }
      )
      return builder
    },
  }
}

/** Captura console.* durante `fn` y devuelve todo lo escrito. */
export async function captureConsole(fn) {
  const lines = []
  const saved = { log: console.log, warn: console.warn, error: console.error }
  for (const k of Object.keys(saved)) console[k] = (...args) => lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  try {
    await fn()
  } finally {
    Object.assign(console, saved)
  }
  return lines.join('\n')
}
