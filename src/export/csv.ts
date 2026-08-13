import type { BomResult, CutlistResult, Project } from '@/domain/types'
import { INTL_LOCALE, IS_EN, t } from '@/i18n'
import { CURRENCY } from '@/i18n/currency'
import { downloadFile } from './project'

/**
 * Разделители полей и десятичный знак зависят от локали сборки:
 * русский Excel ждёт ';' и десятичную запятую, английский — ',' и точку.
 * BOM UTF-8 нужен обоим — без него Excel читает файл в системной кодировке.
 */
const SEP = IS_EN ? ',' : ';'
const DECIMAL = IS_EN ? '.' : ','
const BOM_UTF8 = '﻿'

/** Кавычим ячейку, если внутри разделитель, кавычка или перенос строки */
const RISKY = IS_EN ? /[",\n]/ : /[";\n]/

const esc = (v: unknown): string => {
  const s = String(v ?? '')
  return RISKY.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const num = (v: number, digits = 2) =>
  (Number.isFinite(v) ? v : 0).toFixed(digits).replace('.', DECIMAL)

/**
 * Деньги в CSV — ЧИСЛОМ в валюте сборки: символ валюты стоит в заголовке колонки.
 * Пересчёта здесь нет: смета приходит уже в валюте сборки.
 */
const cash = (v: number, digits = 0) => num(v, digits)

/** Дата и время по локали сборки */
const stamp = (d = new Date()): string =>
  new Intl.DateTimeFormat(INTL_LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(d)

function toCsv(rows: unknown[][]): string {
  return BOM_UTF8 + rows.map((r) => r.map(esc).join(SEP)).join('\r\n')
}

export function bomToCsv(bom: BomResult, project: Project): string {
  const cur = CURRENCY.symbol
  const rows: unknown[][] = []
  rows.push([t('Спецификация — {name}', { name: project.name })])
  rows.push([stamp()])
  rows.push([])
  rows.push([
    t('№'),
    t('Наименование'),
    t('Материал'),
    t('Размер, мм'),
    t('Кол-во'),
    t('Площадь, м²'),
    t('Масса, кг'),
    t('Кромка, м'),
    t('Цена, {cur}', { cur }),
    t('Сумма, {cur}', { cur }),
  ])

  bom.lines.forEach((l, i) => {
    rows.push([
      i + 1,
      t(l.label),
      t(l.materialName),
      l.dims,
      l.qty,
      num(l.areaTotal, 3),
      num(l.massTotal, 2),
      num(l.edgeTotal, 2),
      cash(l.priceEach),
      cash(l.priceTotal),
    ])
  })

  rows.push([])
  rows.push([t('ФУРНИТУРА')])
  rows.push([
    t('№'),
    t('Наименование'),
    '',
    '',
    t('Кол-во'),
    '',
    '',
    '',
    t('Цена, {cur}', { cur }),
    t('Сумма, {cur}', { cur }),
  ])
  bom.hardware.forEach((h, i) => {
    rows.push([i + 1, t(h.label), '', '', h.qty, '', '', '', cash(h.priceEach), cash(h.priceTotal)])
  })

  rows.push([])
  rows.push([t('ПО МАТЕРИАЛАМ')])
  rows.push([
    t('Материал'),
    t('Площадь, м²'),
    t('Листов'),
    t('Масса, кг'),
    t('Кромка, м'),
    t('Сумма, {cur}', { cur }),
  ])
  bom.byMaterial.forEach((m) => {
    rows.push([
      t(m.materialName),
      num(m.area, 3),
      m.sheets,
      num(m.mass, 2),
      num(m.edge, 2),
      cash(m.price),
    ])
  })

  rows.push([])
  rows.push([t('ИТОГО')])
  rows.push([t('Деталей'), bom.totals.parts])
  rows.push([t('Площадь, м²'), num(bom.totals.area, 3)])
  rows.push([t('Масса, кг'), num(bom.totals.mass, 2)])
  rows.push([t('Кромка, м'), num(bom.totals.edge, 2)])
  rows.push([t('Материалы, {cur}', { cur }), cash(bom.totals.materialsPrice)])
  rows.push([t('Кромление, {cur}', { cur }), cash(bom.totals.edgePrice)])
  rows.push([t('Фурнитура, {cur}', { cur }), cash(bom.totals.hardwarePrice)])
  rows.push([t('ВСЕГО, {cur}', { cur }), cash(bom.totals.price)])

  return toCsv(rows)
}

export function cutlistToCsv(cut: CutlistResult, project: Project): string {
  const rows: unknown[][] = []
  rows.push([t('Карта раскроя — {name}', { name: project.name })])
  rows.push([
    t('Листов: {n}', { n: cut.totalSheets }),
    t('Средний выход: {p} %', { p: num(cut.averageUsage * 100, 1) }),
  ])
  rows.push([])
  rows.push([
    t('Лист'),
    t('Материал'),
    t('Толщина, мм'),
    t('Деталь'),
    t('Ширина, мм'),
    t('Высота, мм'),
    t('X, мм'),
    t('Y, мм'),
    t('Поворот'),
  ])
  for (const s of cut.sheets) {
    for (const p of s.pieces) {
      rows.push([
        s.index + 1,
        t(s.materialName),
        s.thickness,
        t(p.label),
        num(p.w, 1),
        num(p.h, 1),
        num(p.x, 1),
        num(p.y, 1),
        p.rotated ? '90°' : '—',
      ])
    }
  }
  if (cut.unplaced.length) {
    rows.push([])
    rows.push([t('НЕ РАЗМЕЩЕНО (деталь больше листа)')])
    cut.unplaced.forEach((u) => rows.push(['', '', '', t(u.label), num(u.w, 1), num(u.h, 1)]))
  }
  return toCsv(rows)
}

export function exportBomCsv(bom: BomResult, project: Project) {
  downloadFile(
    `${project.name || 'standes'}_${t('спецификация.csv')}`,
    bomToCsv(bom, project),
    'text/csv',
  )
}

export function exportCutlistCsv(cut: CutlistResult, project: Project) {
  downloadFile(
    `${project.name || 'standes'}_${t('раскрой.csv')}`,
    cutlistToCsv(cut, project),
    'text/csv',
  )
}
