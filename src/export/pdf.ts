/**
 * Печатная спецификация.
 *
 * PDF-библиотеки в проекте нет — и не нужно: браузер печатает в PDF сам.
 * Собираем самодостаточный HTML-бланк (стили и картинка внутри документа),
 * открываем в новой вкладке и даём кнопку «Печать». Автоматически print()
 * не зовём: пользователь должен сначала увидеть, что печатает.
 */

import type {
  BomResult,
  CutSheet,
  CutlistResult,
  Project,
  ShelfUnit,
} from '@/domain/types'
import { getMaterial } from '@/domain/materials'
import { cellRects, outerSize } from '@/domain/frame'
import { INTL_LOCALE, IS_EN, LOCALE, plural, t } from '@/i18n'
import { money } from '@/i18n/currency'
import { downloadFile } from '@/export/project'
import { appState } from '@/store/useStore'

// ────────────────────────────────────────────────────────────────────────────
//  Утилиты
// ────────────────────────────────────────────────────────────────────────────

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Экранирование для текста и атрибутов */
const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

const safeName = (s: string): string =>
  s
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'standes'

/** Номер бланка из id проекта — только буквы и цифры */
const docNumber = (id: string): string =>
  (id.replace(/[^a-zA-Z0-9]/g, '').slice(-6) || '000000').toUpperCase()

const dateLong = (d: Date): string =>
  new Intl.DateTimeFormat(INTL_LOCALE, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d)

const dateTime = (d: Date): string =>
  new Intl.DateTimeFormat(INTL_LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(d)

// ── числа и единицы измерения по локали сборки ──────────────────────────────

/** неразрывный пробел — число не отрывается от единицы измерения */
const NBSP = ' '

/** «1 240» / «1,240» */
function nfmt(v: number, decimals = 0): string {
  if (!Number.isFinite(v)) return '—'
  return new Intl.NumberFormat(INTL_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)
}

/** «2,84 м²» / «2.84 m²» */
const areaFmt = (m2: number): string =>
  Number.isFinite(m2) ? `${nfmt(m2, 2)}${NBSP}${t('м²')}` : '—'

/** «12,4 кг» / «860 г» — граммы ниже килограмма, сотни килограммов без дробей */
function massFmt(kg: number): string {
  if (!Number.isFinite(kg)) return '—'
  const g = Math.round(kg * 1000)
  if (Math.abs(g) < 1000) return `${nfmt(g)}${NBSP}${t('г')}`
  const abs = Math.abs(kg)
  return `${nfmt(kg, abs < 100 ? 1 : 0)}${NBSP}${t('кг')}`
}

/** «87 %» / «87%» — на вход доля 0..1; по-английски знак процента без отбивки */
const percentFmt = (v: number, decimals = 0): string =>
  Number.isFinite(v) ? `${nfmt(v * 100, decimals)}${IS_EN ? '' : NBSP}%` : '—'

/** Одно измерение внутри строки габаритов: без разрядов, без единиц */
function dimPart(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const decimals = Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1
  return new Intl.NumberFormat(INTL_LOCALE, {
    useGrouping: false,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)
}

/** «1000 × 400 × 18» — толщина необязательна */
function dimsFmt(w: number, h: number, thickness?: number): string {
  const parts = [dimPart(w), dimPart(h)]
  if (thickness !== undefined) parts.push(dimPart(thickness))
  return parts.join(`${NBSP}×${NBSP}`)
}

/** Только data:image — чужие URL в документ не пускаем */
const isImageDataUrl = (s: string): boolean => /^data:image\/(png|jpeg|webp);base64,/.test(s)

// ────────────────────────────────────────────────────────────────────────────
//  Стили бланка
// ────────────────────────────────────────────────────────────────────────────

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:#e9ebee;color:#15171b;
  font:400 12.5px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.toolbar{
  position:sticky;top:0;z-index:9;display:flex;align-items:center;gap:14px;
  padding:10px 18px;background:#15171b;color:#e8eaed;font-size:12.5px;
}
.toolbar .tb-brand{font-weight:700;letter-spacing:.14em;color:#e8b04b}
.toolbar .tb-hint{color:#9aa1ab}
.toolbar button{
  margin-left:auto;padding:7px 18px;border:0;border-radius:7px;cursor:pointer;
  background:#e8b04b;color:#241a06;font:inherit;font-weight:600;
}
.toolbar button:hover{background:#f5c56a}

.doc{max-width:210mm;margin:18px auto 48px;padding:14mm 13mm;background:#fff;box-shadow:0 12px 44px rgba(0,0,0,.16)}

/* шапка */
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}
.brand .mark{font-size:22px;font-weight:800;letter-spacing:.2em}
.brand .tag{margin-top:3px;font-size:10.5px;letter-spacing:.06em;color:#6b7280;text-transform:uppercase}
.head .meta{text-align:right;font-size:11px;color:#6b7280;line-height:1.55}
.head .meta .kind{font-size:13px;font-weight:700;color:#15171b;letter-spacing:.02em}
.rule{height:3px;margin:9px 0 16px;background:linear-gradient(90deg,#e8b04b 0 34%,#15171b 34% 100%)}

h1{margin:0 0 10px;font-size:19px;font-weight:700;letter-spacing:-.01em}
h2{margin:22px 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#15171b}
h2::after{content:'';display:block;height:1px;margin-top:6px;background:#d9dce1}

/* факты */
.facts{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 4px}
.fact{padding:5px 10px;border:1px solid #dfe2e7;border-radius:6px;background:#f7f8fa;font-size:11px;color:#3c4149}
.fact b{color:#15171b;font-weight:600}

/* снимок */
.shot{margin:14px 0 2px;border:1px solid #dfe2e7;border-radius:8px;overflow:hidden;background:#f2f3f5}
.shot img{display:block;width:100%;height:auto}
.cap{margin-top:5px;font-size:10.5px;color:#8b929c}

/* таблицы */
table{width:100%;border-collapse:collapse}
.tbl{font-size:11px}
.tbl th{
  padding:6px 7px;text-align:left;font-weight:600;font-size:10px;letter-spacing:.05em;
  text-transform:uppercase;color:#5b626c;border-bottom:1.5px solid #15171b;white-space:nowrap;
}
.tbl td{padding:5.5px 7px;border-bottom:1px solid #e6e8ec;vertical-align:top}
.tbl tbody tr:nth-child(even) td{background:#fafbfc}
.tbl .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tbl .idx{width:26px;color:#9aa1ab;text-align:right}
.tbl .dim{white-space:nowrap;font-variant-numeric:tabular-nums;color:#3c4149}
.tbl .mut{color:#6b7280}
.tbl tfoot td{padding:7px;border-top:1.5px solid #15171b;border-bottom:0;font-weight:600}

/* итоги */
.totals{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
.tot{padding:9px 11px;border:1px solid #dfe2e7;border-radius:8px;background:#f7f8fa}
.tot .k{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280}
.tot .v{margin-top:3px;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.grand{margin-top:10px;display:flex;align-items:baseline;justify-content:space-between;
  padding:11px 14px;border-radius:8px;background:#15171b;color:#fff}
.grand .k{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#c9ced6}
.grand .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:#e8b04b}

/* предупреждения */
.warns{margin-top:10px;border:1px solid #e6d5ae;border-left:3px solid #e8b04b;border-radius:6px;background:#fdf8ec;padding:9px 12px}
.warns li{font-size:11px;margin:2px 0}
.warns .lv-error{color:#b3261e}

/* раскрой */
.card{margin:12px 0 18px;border:1px solid #dfe2e7;border-radius:8px;overflow:hidden}
.card-head{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;padding:8px 11px;background:#f4f5f7;border-bottom:1px solid #dfe2e7;font-size:11px}
.card-head b{font-size:12px}
.card-head .sp{margin-left:auto;font-variant-numeric:tabular-nums}
.card-body{padding:10px 11px}
.card svg{display:block;width:100%;height:auto}
.legend{margin-top:9px;font-size:10px}
.legend th{padding:4px 6px;font-size:9px}
.legend td{padding:3.5px 6px}

.foot{margin-top:26px;padding-top:9px;border-top:1px solid #e6e8ec;display:flex;justify-content:space-between;font-size:10px;color:#8b929c}

@page{size:A4;margin:12mm}
@media print{
  body{background:#fff}
  .toolbar{display:none}
  .doc{max-width:none;margin:0;padding:0;box-shadow:none}
  h2{break-after:avoid;page-break-after:avoid}
  tr,.card,.tot,.grand,.shot,.warns{break-inside:avoid;page-break-inside:avoid}
  thead{display:table-header-group}
  .page-break{break-before:page;page-break-before:always}
}
`

// ────────────────────────────────────────────────────────────────────────────
//  Блоки документа
// ────────────────────────────────────────────────────────────────────────────

function factsBlock(project: Project, bom: BomResult, cut: CutlistResult): string {
  const r = project.room
  const n = project.units.length
  const facts: string[] = [
    `<span class="fact">${esc(t('Стеллажей'))}: <b>${n}</b></span>`,
    `<span class="fact">${esc(t('Деталей'))}: <b>${nfmt(bom.totals.parts)}</b></span>`,
    `<span class="fact">${esc(t('Площадь'))}: <b>${esc(areaFmt(bom.totals.area))}</b></span>`,
    `<span class="fact">${esc(t('Масса'))}: <b>${esc(massFmt(bom.totals.mass))}</b></span>`,
    `<span class="fact">${esc(t('Помещение'))}: <b>${esc(
      dimsFmt(r.width, r.depth, r.height),
    )}</b> ${esc(t('мм'))}</span>`,
  ]
  if (cut.totalSheets > 0) {
    facts.push(
      `<span class="fact">${esc(t('Листов'))}: <b>${cut.totalSheets}</b>, ${esc(
        t('выход'),
      )} <b>${esc(percentFmt(cut.averageUsage, 1))}</b></span>`,
    )
  }
  return `<div class="facts">${facts.join('')}</div>`
}

function unitsTable(units: ShelfUnit[]): string {
  if (!units.length) return ''
  const rows = units
    .map((u, i) => {
      const o = outerSize(u.frame)
      const cells = cellRects(u).rects.length
      const cols = u.frame.cols.length
      const rows2 = u.frame.rows.length
      return `<tr>
        <td class="idx">${i + 1}</td>
        <td>${esc(u.name)}</td>
        <td class="dim">${esc(dimsFmt(o.x, o.z, o.y))}</td>
        <td class="mut">${cols} × ${rows2}</td>
        <td class="n">${cells}</td>
        <td class="mut">${esc(t(getMaterial(u.materials.carcass).name))}</td>
        <td class="mut">${esc(t(getMaterial(u.materials.front).name))}</td>
      </tr>`
    })
    .join('')

  return `<h2>${esc(t('Состав проекта'))}</h2>
  <table class="tbl">
    <thead><tr>
      <th class="idx">${esc(t('№'))}</th><th>${esc(t('Стеллаж'))}</th><th>${esc(
        t('Ш × Г × В, мм'),
      )}</th>
      <th>${esc(t('Сетка'))}</th><th class="n">${esc(t('Ячеек'))}</th><th>${esc(
        t('Корпус'),
      )}</th><th>${esc(t('Фасады'))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function partsTable(bom: BomResult): string {
  if (!bom.lines.length) return ''
  const rows = bom.lines
    .map(
      (l, i) => `<tr>
      <td class="idx">${i + 1}</td>
      <td>${esc(t(l.label))}</td>
      <td class="mut">${esc(t(l.materialName))}</td>
      <td class="dim">${esc(l.dims)}</td>
      <td class="n">${l.qty}</td>
      <td class="n">${nfmt(l.areaTotal, 3)}</td>
      <td class="n">${nfmt(l.edgeTotal, 2)}</td>
      <td class="n">${nfmt(l.massTotal, 2)}</td>
      <td class="n">${esc(money(l.priceTotal))}</td>
    </tr>`,
    )
    .join('')

  return `<h2>${esc(t('Детали'))}</h2>
  <table class="tbl">
    <thead><tr>
      <th class="idx">${esc(t('№'))}</th><th>${esc(t('Наименование'))}</th><th>${esc(
        t('Материал'),
      )}</th><th>${esc(t('Размер, мм'))}</th>
      <th class="n">${esc(t('Кол-во'))}</th><th class="n">${esc(
        t('Площадь, м²'),
      )}</th><th class="n">${esc(t('Кромка, м'))}</th>
      <th class="n">${esc(t('Масса, кг'))}</th><th class="n">${esc(t('Сумма'))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="4">${esc(t('Итого по деталям'))}</td>
      <td class="n">${nfmt(bom.totals.parts)}</td>
      <td class="n">${nfmt(bom.totals.area, 3)}</td>
      <td class="n">${nfmt(bom.totals.edge, 2)}</td>
      <td class="n">${nfmt(bom.totals.mass, 2)}</td>
      <td class="n">${esc(money(bom.totals.materialsPrice))}</td>
    </tr></tfoot>
  </table>`
}

function hardwareTable(bom: BomResult): string {
  if (!bom.hardware.length) return ''
  const rows = bom.hardware
    .map(
      (h, i) => `<tr>
      <td class="idx">${i + 1}</td>
      <td>${esc(t(h.label))}</td>
      <td class="n">${h.qty}</td>
      <td class="n">${esc(money(h.priceEach))}</td>
      <td class="n">${esc(money(h.priceTotal))}</td>
    </tr>`,
    )
    .join('')

  return `<h2>${esc(t('Фурнитура'))}</h2>
  <table class="tbl">
    <thead><tr>
      <th class="idx">${esc(t('№'))}</th><th>${esc(t('Наименование'))}</th>
      <th class="n">${esc(t('Кол-во'))}</th><th class="n">${esc(
        t('Цена'),
      )}</th><th class="n">${esc(t('Сумма'))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="4">${esc(t('Итого фурнитура'))}</td>
      <td class="n">${esc(money(bom.totals.hardwarePrice))}</td>
    </tr></tfoot>
  </table>`
}

function materialsTable(bom: BomResult): string {
  if (!bom.byMaterial.length) return ''
  const rows = bom.byMaterial
    .map(
      (m) => `<tr>
      <td>${esc(t(m.materialName))}</td>
      <td class="n">${nfmt(m.area, 3)}</td>
      <td class="n">${m.sheets || '—'}</td>
      <td class="n">${nfmt(m.mass, 2)}</td>
      <td class="n">${nfmt(m.edge, 2)}</td>
      <td class="n">${esc(money(m.price))}</td>
    </tr>`,
    )
    .join('')

  return `<h2>${esc(t('Сводка по материалам'))}</h2>
  <table class="tbl">
    <thead><tr>
      <th>${esc(t('Материал'))}</th><th class="n">${esc(
        t('Площадь, м²'),
      )}</th><th class="n">${esc(t('Листов'))}</th>
      <th class="n">${esc(t('Масса, кг'))}</th><th class="n">${esc(
        t('Кромка, м'),
      )}</th><th class="n">${esc(t('Сумма'))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function totalsBlock(bom: BomResult): string {
  const tt = bom.totals
  return `<h2>${esc(t('Итоги'))}</h2>
  <div class="totals">
    <div class="tot"><div class="k">${esc(t('Материалы'))}</div><div class="v">${esc(
      money(tt.materialsPrice),
    )}</div></div>
    <div class="tot"><div class="k">${esc(t('Кромление'))}</div><div class="v">${esc(
      money(tt.edgePrice),
    )}</div></div>
    <div class="tot"><div class="k">${esc(t('Фурнитура'))}</div><div class="v">${esc(
      money(tt.hardwarePrice),
    )}</div></div>
    <div class="tot"><div class="k">${esc(t('Масса изделия'))}</div><div class="v">${esc(
      massFmt(tt.mass),
    )}</div></div>
  </div>
  <div class="grand"><span class="k">${esc(
    t('Всего по спецификации'),
  )}</span><span class="v">${esc(money(tt.price))}</span></div>`
}

function warningsBlock(bom: BomResult): string {
  if (!bom.warnings.length) return ''
  const items = bom.warnings
    .slice(0, 40)
    .map((w) => `<li class="lv-${esc(w.level)}">${esc(t(w.message))}</li>`)
    .join('')
  return `<h2>${esc(t('Замечания конструктора'))}</h2><ul class="warns">${items}</ul>`
}

// ── карта раскроя ───────────────────────────────────────────────────────────

/** Один лист: SVG-схема + расшифровка позиций */
function sheetCard(sheet: CutSheet, no: number, margin: number): string {
  const color = getMaterial(sheet.materialId).color
  // масштабируем толщину линий и шрифт под размер листа — схема читается всегда
  const unit = Math.max(sheet.w, sheet.h) / 1000
  const stroke = 2.2 * unit
  const font = 34 * unit

  const rects = sheet.pieces
    .map((p, i) => {
      const cx = p.x + p.w / 2
      const cy = p.y + p.h / 2
      const fits = p.w > font * 2.4 && p.h > font * 1.8
      const label = fits
        ? `<text x="${cx.toFixed(1)}" y="${(cy + font * 0.35).toFixed(1)}" font-size="${font.toFixed(
            1,
          )}" text-anchor="middle" fill="#15171b" font-family="Arial,Helvetica,sans-serif">${i + 1}</text>`
        : ''
      return `<rect x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${p.w.toFixed(
        1,
      )}" height="${p.h.toFixed(1)}" fill="${esc(color)}" fill-opacity="0.3" stroke="#15171b" stroke-width="${stroke.toFixed(
        2,
      )}" />${label}`
    })
    .join('')

  const legend = sheet.pieces
    .map(
      (p, i) => `<tr>
      <td class="idx">${i + 1}</td>
      <td>${esc(t(p.label))}</td>
      <td class="dim">${esc(dimsFmt(p.w, p.h))}</td>
      <td class="mut">${p.rotated ? esc(t('повёрнута 90°')) : '—'}</td>
    </tr>`,
    )
    .join('')

  const inner =
    margin > 0
      ? `<rect x="${margin}" y="${margin}" width="${sheet.w - margin * 2}" height="${
          sheet.h - margin * 2
        }" fill="none" stroke="#9aa1ab" stroke-width="${(stroke * 0.7).toFixed(
          2,
        )}" stroke-dasharray="${(unit * 14).toFixed(1)} ${(unit * 10).toFixed(1)}" />`
      : ''

  return `<div class="card">
    <div class="card-head">
      <b>${esc(t('Лист {n}', { n: no }))}</b>
      <span>${esc(t(sheet.materialName))}</span>
      <span class="mut">${nfmt(sheet.thickness, 1)} ${esc(t('мм'))}</span>
      <span class="dim">${esc(dimsFmt(sheet.w, sheet.h))}</span>
      <span class="sp">${esc(t('деталей'))}: ${sheet.pieces.length} · ${esc(
        t('выход'),
      )} ${esc(percentFmt(sheet.usage, 1))}</span>
    </div>
    <div class="card-body">
      <svg viewBox="0 0 ${sheet.w} ${sheet.h}" preserveAspectRatio="xMidYMid meet" role="img">
        <rect x="0" y="0" width="${sheet.w}" height="${sheet.h}" fill="#fbfbfc" stroke="#15171b" stroke-width="${(
          stroke * 1.4
        ).toFixed(2)}" />
        ${inner}
        ${rects}
      </svg>
      <table class="tbl legend">
        <thead><tr><th class="idx">${esc(t('№'))}</th><th>${esc(t('Деталь'))}</th><th>${esc(
          t('Размер, мм'),
        )}</th><th>${esc(t('Раскладка'))}</th></tr></thead>
        <tbody>${legend}</tbody>
      </table>
    </div>
  </div>`
}

function cutBlock(cut: CutlistResult, margin: number): string {
  if (!cut.sheets.length && !cut.unplaced.length) return ''

  const cards = cut.sheets.map((s, i) => sheetCard(s, i + 1, margin)).join('')

  const unplaced = cut.unplaced.length
    ? `<h2>${esc(t('Не размещено'))}</h2>
       <table class="tbl">
         <thead><tr><th class="idx">${esc(t('№'))}</th><th>${esc(t('Деталь'))}</th><th>${esc(
           t('Размер, мм'),
         )}</th></tr></thead>
         <tbody>${cut.unplaced
           .map(
             (u, i) =>
               `<tr><td class="idx">${i + 1}</td><td>${esc(t(u.label))}</td><td class="dim">${esc(
                 dimsFmt(u.w, u.h),
               )}</td></tr>`,
           )
           .join('')}</tbody>
       </table>`
    : ''

  return `<div class="page-break"></div>
  <h2>${esc(t('Карта раскроя'))}</h2>
  <div class="facts">
    <span class="fact">${esc(t('Листов'))}: <b>${cut.totalSheets}</b></span>
    <span class="fact">${esc(t('Средний выход'))}: <b>${esc(
      percentFmt(cut.averageUsage, 1),
    )}</b></span>
  </div>
  ${cards}
  ${unplaced}`
}

// ────────────────────────────────────────────────────────────────────────────
//  Сборка документа
// ────────────────────────────────────────────────────────────────────────────

export interface SpecOptions {
  /** обрезка кромки листа, мм — рисуем пунктиром на схеме раскроя */
  cutMargin?: number
  /** подпись исполнителя в подвале */
  author?: string
}

/** Полный HTML печатной спецификации — можно сохранить как файл или открыть в окне */
export function buildSpecHtml(
  project: Project,
  bom: BomResult,
  cut: CutlistResult,
  screenshotDataUrl?: string,
  opts: SpecOptions = {},
): string {
  const now = new Date()
  const title = t('Спецификация — {name}', { name: project.name })
  const shot =
    screenshotDataUrl && isImageDataUrl(screenshotDataUrl)
      ? `<figure class="shot"><img src="${screenshotDataUrl}" alt="${esc(
          t('Вид проекта'),
        )}" /></figure>
         <div class="cap">${esc(
           t('Визуализация носит справочный характер; размеры и материалы — по таблицам ниже.'),
         )}</div>`
      : ''

  const n = project.units.length
  const body = `
    <div class="toolbar">
      <span class="tb-brand">STANDES</span>
      <span class="tb-hint">${esc(
        t('Проверьте документ и нажмите «Печать» — в диалоге выберите «Сохранить как PDF».'),
      )}</span>
      <button type="button" onclick="window.print()">${esc(t('Печать'))}</button>
    </div>
    <main class="doc">
      <header class="head">
        <div class="brand">
          <div class="mark">STANDES</div>
          <div class="tag">${esc(t('Модульные стеллажи · конфигуратор'))}</div>
        </div>
        <div class="meta">
          <div class="kind">${esc(t('Спецификация изделия'))}</div>
          <div>${esc(dateLong(now))}</div>
          <div>${esc(t('№'))} ${esc(docNumber(project.id))}</div>
        </div>
      </header>
      <div class="rule"></div>

      <h1>${esc(project.name)}</h1>
      ${factsBlock(project, bom, cut)}
      ${shot}

      ${unitsTable(project.units)}
      ${warningsBlock(bom)}
      ${partsTable(bom)}
      ${hardwareTable(bom)}
      ${materialsTable(bom)}
      ${totalsBlock(bom)}
      ${cutBlock(cut, Math.max(0, opts.cutMargin ?? 10))}

      <div class="foot">
        <span>${esc(opts.author ?? t('Сформировано в конфигураторе STANDES'))}</span>
        <span>${esc(dateTime(now))} · ${n} ${esc(
          plural(n, 'стеллаж', 'стеллажа', 'стеллажей'),
        )}</span>
      </div>
    </main>`

  return `<!doctype html>
<html lang="${LOCALE}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>${body}</body>
</html>`
}

/**
 * Открывает спецификацию в новой вкладке. Если поп-ап заблокирован —
 * отдаёт тот же документ файлом .html, чтобы работа не пропала.
 */
export function exportSpecHtml(
  project: Project,
  bom: BomResult,
  cut: CutlistResult,
  screenshotDataUrl?: string,
  opts: SpecOptions = {},
): void {
  try {
    const html = buildSpecHtml(project, bom, cut, screenshotDataUrl, opts)
    const w = window.open('', '_blank')
    if (!w) {
      downloadFile(`${safeName(project.name)}_${t('спецификация.html')}`, html, 'text/html')
      appState().toast(
        t('Всплывающее окно заблокировано — спецификация сохранена файлом'),
        'warn',
      )
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
  } catch {
    appState().toast(t('Не удалось собрать спецификацию'), 'error')
  }
}
