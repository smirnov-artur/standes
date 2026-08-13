import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Cell, Project, ShelfUnit } from '@/domain/types'
import { DEFAULT_FRAME, DEFAULT_MATERIALS, DEFAULT_ROOM, makeProject } from '@/domain/defaults'
import { t } from '@/i18n'

/**
 * Проект в URL. Чтобы ссылка не была километровой, пишем только отличия
 * от дефолтов и режем числа до целых миллиметров.
 */

type Diff = Record<string, unknown>

function diff(obj: Record<string, unknown>, base: Record<string, unknown>): Diff {
  const out: Diff = {}
  for (const k of Object.keys(obj)) {
    const a = obj[k]
    const b = base[k]
    if (Array.isArray(a)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = a
    } else if (a !== b) {
      out[k] = a
    }
  }
  return out
}

function packUnit(u: ShelfUnit) {
  const cells: Record<string, Cell> = {}
  for (const [k, c] of Object.entries(u.cells)) {
    if (c.fill.t === 'empty' && c.span.c === 1 && c.span.r === 1 && !c.material && !c.back) continue
    cells[k] = c
  }
  return {
    i: u.id,
    n: u.name,
    p: [Math.round(u.pos.x), Math.round(u.pos.z)],
    r: Number(u.rotY.toFixed(4)),
    f: diff(u.frame as unknown as Record<string, unknown>, DEFAULT_FRAME as unknown as Record<string, unknown>),
    c: cells,
    m: diff(u.materials as unknown as Record<string, unknown>, DEFAULT_MATERIALS as unknown as Record<string, unknown>),
    ...(u.locked ? { l: 1 } : {}),
    ...(u.hidden ? { h: 1 } : {}),
    // 'e' — высота установки в штабеле. Пишем только ненулевую: подавляющее
    // большинство юнитов стоит на полу, и лишний ключ в каждой записи ни к чему
    ...(u.elevation && u.elevation > 0 ? { e: Math.round(u.elevation) } : {}),
  }
}

/** Сырой юнит из ссылки: доверять ничему нельзя, поэтому всё через unknown */
type RawUnit = Partial<Record<'i' | 'n' | 'p' | 'r' | 'f' | 'c' | 'm' | 'l' | 'h' | 'e', unknown>>

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

function unpackUnit(input: unknown, fallbackId: string): ShelfUnit {
  const raw = asRecord(input) as RawUnit
  const p = Array.isArray(raw.p) ? (raw.p as unknown[]) : []
  // старые ссылки поля 'e' не знают — юнит просто остаётся на полу.
  // Мусор (NaN, минус, километр) зажмёт elevationOf при первом же чтении
  const elevation = Number(raw.e)
  return {
    id: typeof raw.i === 'string' ? raw.i : fallbackId,
    name: typeof raw.n === 'string' ? raw.n : t('Стеллаж'),
    pos: { x: Number(p[0]) || 0, z: Number(p[1]) || 0 },
    rotY: Number(raw.r) || 0,
    frame: { ...DEFAULT_FRAME, ...asRecord(raw.f) },
    cells: asRecord(raw.c) as Record<string, Cell>,
    materials: { ...DEFAULT_MATERIALS, ...asRecord(raw.m) },
    locked: !!raw.l,
    hidden: !!raw.h,
    ...(Number.isFinite(elevation) && elevation > 0 ? { elevation } : {}),
  }
}

export function encodeProject(p: Project): string {
  const payload = {
    v: 1,
    n: p.name,
    r: diff(p.room as unknown as Record<string, unknown>, DEFAULT_ROOM as unknown as Record<string, unknown>),
    u: p.units.map(packUnit),
  }
  return compressToEncodedURIComponent(JSON.stringify(payload))
}

export function decodeProject(code: string): Project | null {
  try {
    const json = decompressFromEncodedURIComponent(code)
    if (!json) return null
    const raw = asRecord(JSON.parse(json))
    const units = raw.u
    if (!Array.isArray(units) || !units.length) return null
    const base = makeProject()
    return {
      version: 1,
      id: base.id,
      name: typeof raw.n === 'string' ? raw.n : t('Проект по ссылке'),
      room: { ...DEFAULT_ROOM, ...asRecord(raw.r) },
      units: (units as unknown[]).map((u, i) => unpackUnit(u, `shared_${i}`)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  } catch {
    return null
  }
}

export function shareUrl(p: Project): string {
  const code = encodeProject(p)
  const base = `${location.origin}${location.pathname}`
  return `${base}#p=${code}`
}

export function readShareFromUrl(): Project | null {
  const hash = location.hash
  const m = /[#&]p=([^&]+)/.exec(hash)
  if (!m) return null
  return decodeProject(m[1])
}

export function clearShareFromUrl() {
  if (location.hash.includes('p=')) history.replaceState(null, '', location.pathname + location.search)
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
