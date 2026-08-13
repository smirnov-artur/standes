import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Download, RotateCw, TriangleAlert } from 'lucide-react'

import type { CutPiece, CutSheet, CutlistResult } from '@/domain/types'
import { computeCutlist } from '@/domain/cutlist'
import { matPriceM2, materialName } from '@/domain/materials'
import { fmtArea, fmtDims, fmtLen, fmtPercent } from '@/domain/format'
import { useAppStore } from '@/store/useStore'
import { t } from '@/i18n'
import { money } from '@/i18n/currency'
import { Button, NumberField, Toggle, Tooltip } from '@/ui/controls'
import { exportCutlistCsv } from '@/export/csv'
import { CalcError, EmptyNote } from '@/ui/BomTable'

// ────────────────────────────────────────────────────────────────────────────
//  Параметры и расчёт
// ────────────────────────────────────────────────────────────────────────────

type CutState = { ok: true; cut: CutlistResult } | { ok: false; error: string }

interface Sums {
  sheetArea: number
  pieceArea: number
  wasteArea: number
  wasteCost: number
}

function summarize(cut: CutlistResult): Sums {
  let sheetArea = 0
  let pieceArea = 0
  let wasteCost = 0
  for (const s of cut.sheets) {
    const sa = (s.w * s.h) / 1e6
    const pa = s.pieces.reduce((acc, p) => acc + (p.w * p.h) / 1e6, 0)
    sheetArea += sa
    pieceArea += pa
    // цена в валюте сборки: аксессор сам выбирает нужную колонку прайса
    wasteCost += Math.max(0, sa - pa) * matPriceM2(s.materialId)
  }
  return { sheetArea, pieceArea, wasteArea: Math.max(0, sheetArea - pieceArea), wasteCost }
}

// ────────────────────────────────────────────────────────────────────────────
//  Геометрия подписи: помещается ли текст в деталь (всё в мм листа)
// ────────────────────────────────────────────────────────────────────────────

/** Грубая, но устойчивая оценка ширины строки моноширинным начертанием */
const textWidth = (s: string, fontMm: number) => s.length * fontMm * 0.58

function fits(text: string, fontMm: number, w: number, h: number, lines: number): boolean {
  return textWidth(text, fontMm) <= w - fontMm && h >= fontMm * 1.5 * lines
}

// ────────────────────────────────────────────────────────────────────────────
//  Мини-превью листа для списка слева
// ────────────────────────────────────────────────────────────────────────────

function SheetThumb({ sheet, width = 60 }: { sheet: CutSheet; width?: number }) {
  const height = Math.max(14, Math.round((width * sheet.h) / Math.max(1, sheet.w)))
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${sheet.w} ${sheet.h}`}
      preserveAspectRatio="none"
      className="shrink-0"
      style={{
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        borderRadius: 3,
      }}
    >
      {sheet.pieces.map((p) => (
        <rect
          key={p.id}
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          fill="color-mix(in oklab, var(--accent) 34%, transparent)"
          stroke="color-mix(in oklab, var(--accent) 55%, transparent)"
          strokeWidth={sheet.w / width}
        />
      ))}
    </svg>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Крупный чертёж листа
//
//  Масштаб берётся по контейнеру: в отведённый прямоугольник вписывается лист
//  вместе с полями PAD под выносные размеры, поэтому чертёж никогда не выходит
//  за пределы панели, как бы её ни тянули.
// ────────────────────────────────────────────────────────────────────────────

/** поля под выносные размеры, px */
const PAD = 22
/** зазор, чтобы подписи не липли к границам области */
const GAP = 8

function SheetPlan({ sheet, margin }: { sheet: CutSheet; margin: number }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<string | null>(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const read = () => {
      const r = el.getBoundingClientRect()
      setBox((prev) =>
        Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
          ? prev
          : { w: r.width, h: r.height },
      )
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const availW = box.w - PAD * 2 - GAP
  const availH = box.h - PAD * 2 - GAP
  const scale =
    availW > 20 && availH > 20 && sheet.w > 0 && sheet.h > 0
      ? Math.min(availW / sheet.w, availH / sheet.h)
      : 0
  /** пиксели → миллиметры листа */
  const u = (px: number) => px / scale

  return (
    <div
      ref={boxRef}
      className="flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden p-1"
    >
      {scale > 0 && (
        <div className="relative" style={{ width: sheet.w * scale, height: sheet.h * scale }}>
          <svg
            width={sheet.w * scale + PAD * 2}
            height={sheet.h * scale + PAD * 2}
            viewBox={`${-u(PAD)} ${-u(PAD)} ${sheet.w + u(PAD) * 2} ${sheet.h + u(PAD) * 2}`}
            className="absolute"
            style={{ left: -PAD, top: -PAD, overflow: 'visible' }}
          >
            {/* лист */}
            <rect
              x={0}
              y={0}
              width={sheet.w}
              height={sheet.h}
              fill="var(--bg-input)"
              stroke="var(--border-strong)"
              strokeWidth={u(1.5)}
            />

            {/* полезное поле после обрезки кромки листа */}
            {margin > 0 && (
              <rect
                x={margin}
                y={margin}
                width={Math.max(0, sheet.w - margin * 2)}
                height={Math.max(0, sheet.h - margin * 2)}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth={u(1)}
                strokeDasharray={`${u(5)} ${u(4)}`}
              />
            )}

            {/* детали */}
            {sheet.pieces.map((p) => {
              const on = hover === p.id
              const fontMm = u(10.5)
              const dimsMm = u(9.5)
              const dims = fmtDims(p.w, p.h)
              // название показываем только вместе с размерами; не влезло —
              // остаются одни размеры; не влезли и они — деталь без подписи
              const both =
                fits(p.label, fontMm, p.w, p.h, 2) && fits(dims, dimsMm, p.w, p.h, 2)
              const showLabel = both
              const showDims = both || fits(dims, dimsMm, p.w, p.h, 1)
              const cx = p.x + p.w / 2
              const cy = p.y + p.h / 2
              return (
                <g key={p.id}>
                  <rect
                    x={p.x}
                    y={p.y}
                    width={p.w}
                    height={p.h}
                    fill={
                      on
                        ? 'color-mix(in oklab, var(--accent) 24%, transparent)'
                        : 'color-mix(in oklab, var(--accent) 10%, transparent)'
                    }
                    stroke={
                      on ? 'var(--accent)' : 'color-mix(in oklab, var(--accent) 40%, transparent)'
                    }
                    strokeWidth={u(on ? 1.6 : 1)}
                  />
                  {showLabel && (
                    <text
                      x={cx}
                      y={cy - fontMm * 0.7}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={fontMm}
                      fill="var(--text)"
                      style={{ pointerEvents: 'none' }}
                    >
                      {p.label}
                    </text>
                  )}
                  {showDims && (
                    <text
                      x={cx}
                      y={showLabel ? cy + dimsMm * 0.8 : cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={dimsMm}
                      fill="var(--text-dim)"
                      style={{ pointerEvents: 'none', fontFamily: 'var(--font-mono)' }}
                    >
                      {dims}
                    </text>
                  )}
                  {p.rotated && (
                    <text
                      x={p.x + p.w - u(4)}
                      y={p.y + u(11)}
                      textAnchor="end"
                      fontSize={u(11)}
                      fill="var(--magnet)"
                      style={{ pointerEvents: 'none' }}
                    >
                      ↻
                    </text>
                  )}
                </g>
              )
            })}

            {/* выносные размеры листа */}
            <text
              x={sheet.w / 2}
              y={sheet.h + u(13)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={u(10)}
              fill="var(--text-faint)"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {fmtLen(sheet.w)}
            </text>
            <text
              x={-u(13)}
              y={sheet.h / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={u(10)}
              fill="var(--text-faint)"
              transform={`rotate(-90 ${-u(13)} ${sheet.h / 2})`}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {fmtLen(sheet.h)}
            </text>
          </svg>

          {/* прозрачный слой попадания: наведение и подсказки — обычный DOM */}
          {sheet.pieces.map((p) => (
            <Tooltip key={p.id} content={<PieceInfo piece={p} />} side="top" delay={180}>
              <div
                className="absolute"
                style={{
                  left: p.x * scale,
                  top: p.y * scale,
                  width: p.w * scale,
                  height: p.h * scale,
                }}
                onPointerEnter={() => setHover(p.id)}
                onPointerLeave={() => setHover((v) => (v === p.id ? null : v))}
              />
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  )
}

function PieceInfo({ piece }: { piece: CutPiece }) {
  const src = piece.rotated ? { w: piece.h, h: piece.w } : { w: piece.w, h: piece.h }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11.5px]" style={{ color: 'var(--text)' }}>
        {piece.label}
      </span>
      <span className="num" style={{ color: 'var(--text-dim)' }}>
        {fmtDims(src.w, src.h)} {t('мм')} · {fmtArea((piece.w * piece.h) / 1e6)}
      </span>
      <span className="num" style={{ color: 'var(--text-faint)' }}>
        X {Math.round(piece.x)} · Y {Math.round(piece.y)}
        {piece.rotated ? ` · ${t('повёрнута 90°')}` : ''}
      </span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export function CutlistView() {
  const units = useAppStore((s) => s.project.units)
  const toast = useAppStore((s) => s.toast)

  const [kerf, setKerf] = useState(4)
  const [margin, setMargin] = useState(10)
  const [grainAware, setGrainAware] = useState(false)
  const [sel, setSel] = useState(0)

  // поля скрабятся мышью — раскрой пересчитываем отложенно, чтобы ввод не залипал
  const kerfApplied = useDeferredValue(kerf)
  const marginApplied = useDeferredValue(margin)
  const grainApplied = useDeferredValue(grainAware)

  const state = useMemo<CutState>(() => {
    try {
      return {
        ok: true,
        cut: computeCutlist(
          units.filter((u) => !u.hidden),
          { kerf: kerfApplied, margin: marginApplied, grainAware: grainApplied },
        ),
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [units, kerfApplied, marginApplied, grainApplied])

  const sums = useMemo(() => (state.ok ? summarize(state.cut) : null), [state])

  const cut = state.ok ? state.cut : null
  const sheets = cut ? cut.sheets : []
  const active = sheets.length ? sheets[Math.min(sel, sheets.length - 1)] : null

  const doCsv = () => {
    if (!cut) return
    try {
      exportCutlistCsv(cut, useAppStore.getState().project)
    } catch (err) {
      toast(err instanceof Error ? err.message : t('Экспорт не удался'), 'error')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── параметры раскроя: строка неизменной высоты, пересчёт её не двигает ── */}
      <div
        className="flex h-[32px] shrink-0 items-center gap-3 overflow-hidden px-2.5"
        style={{ borderBottom: '1px solid var(--border-soft)' }}
      >
        <Param label={t('Пропил')}>
          <div className="flex w-[72px]">
            <NumberField
              value={kerf}
              onChange={setKerf}
              min={0}
              max={10}
              step={0.5}
              precision={1}
              suffix={t('мм')}
            />
          </div>
        </Param>
        <Param label={t('Отступ от края')}>
          <div className="flex w-[72px]">
            <NumberField
              value={margin}
              onChange={setMargin}
              min={0}
              max={30}
              step={1}
              precision={0}
              suffix={t('мм')}
            />
          </div>
        </Param>
        <Tooltip
          content={t(
            'Учитывать направление волокон: детали из дерева и фанеры не разворачиваются на 90°',
          )}
        >
          <span className="flex shrink-0">
            <Param label={t('Волокна')}>
              <Toggle checked={grainAware} onChange={setGrainAware} />
            </Param>
          </span>
        </Tooltip>

        <div className="min-w-0 flex-1" />

        <Button
          size="xs"
          icon={<Download size={13} strokeWidth={1.75} />}
          onClick={doCsv}
          disabled={!cut}
        >
          {t('Экспорт CSV')}
        </Button>
      </div>

      {/* ── не влезло: ровно одна строка, чтобы появление не дёргало разметку ── */}
      {cut && cut.unplaced.length > 0 && (
        <div
          className="flex h-[22px] shrink-0 items-center gap-1.5 px-2.5"
          style={{
            background: 'color-mix(in oklab, var(--danger) 10%, transparent)',
            borderBottom: '1px solid color-mix(in oklab, var(--danger) 30%, transparent)',
          }}
        >
          <TriangleAlert
            size={13}
            strokeWidth={1.75}
            className="shrink-0"
            style={{ color: 'var(--danger)' }}
          />
          <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: 'var(--danger)' }}>
            {t('Не помещается на лист:')}{' '}
            {cut.unplaced
              .map((u) => `${u.label} (${fmtDims(u.w, u.h)})`)
              .slice(0, 6)
              .join('; ')}
            {cut.unplaced.length > 6
              ? ` ${t('и ещё {n}', { n: cut.unplaced.length - 6 })}`
              : ''}
          </span>
        </div>
      )}

      {/* ── листы ── */}
      {!state.ok ? (
        <div className="min-h-0 flex-1">
          <CalcError title={t('Не удалось рассчитать раскрой')} error={state.error} />
        </div>
      ) : !active ? (
        <div className="min-h-0 flex-1">
          <EmptyNote text={t('Листовых деталей нет — раскраивать нечего.')} />
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1">
          <aside
            className="w-[178px] shrink-0 overflow-y-auto overscroll-contain py-1"
            style={{ borderRight: '1px solid var(--border-soft)' }}
          >
            {sheets.map((s, i) => {
              const on = s === active
              return (
                <button
                  key={`${s.index}:${s.materialId}:${i}`}
                  type="button"
                  onClick={() => setSel(i)}
                  className="focus-ring flex w-full items-center gap-2 px-2 py-1 text-left transition-colors"
                  style={{ background: on ? 'var(--bg-active)' : 'transparent' }}
                  onPointerEnter={(e) => {
                    if (!on) e.currentTarget.style.background = 'var(--bg-hover)'
                  }}
                  onPointerLeave={(e) => {
                    if (!on) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <SheetThumb sheet={s} />
                  <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                    <span className="flex items-baseline gap-1.5">
                      <span
                        className="text-[11.5px] font-medium whitespace-nowrap"
                        style={{ color: on ? 'var(--text)' : 'var(--text-dim)' }}
                      >
                        {/* CutSheet.index нумеруется с нуля — в UI листы с единицы */}
                        {t('Лист {n}', { n: s.index + 1 })}
                      </span>
                      <span
                        className="num"
                        style={{ color: s.usage > 0.7 ? 'var(--ok)' : 'var(--warn)' }}
                      >
                        {fmtPercent(s.usage)}
                      </span>
                    </span>
                    <span className="truncate text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                      {materialName(s.materialId)}
                    </span>
                    <span className="num" style={{ color: 'var(--text-faint)' }}>
                      {s.thickness} {t('мм')} · {t('{n} дет.', { n: s.pieces.length })}
                    </span>
                  </span>
                </button>
              )
            })}
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              className="flex h-[24px] shrink-0 items-center gap-2 overflow-hidden px-2.5"
              style={{ borderBottom: '1px solid var(--border-soft)' }}
            >
              <span
                className="shrink-0 text-[11.5px] font-medium whitespace-nowrap"
                style={{ color: 'var(--text)' }}
              >
                {t('Лист {n} из {m}', { n: active.index + 1, m: sheets.length })}
              </span>
              <span className="min-w-0 truncate text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
                {materialName(active.materialId)}
              </span>
              <span className="num shrink-0 whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>
                {fmtDims(active.w, active.h, active.thickness)} {t('мм')}
              </span>
              <div className="min-w-0 flex-1" />
              {active.pieces.some((p) => p.rotated) && (
                <span
                  className="flex shrink-0 items-center gap-1 text-[10.5px]"
                  style={{ color: 'var(--magnet)' }}
                >
                  <RotateCw size={11} strokeWidth={1.75} />
                  {t('повёрнутые')}
                </span>
              )}
              <span className="num shrink-0 whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
                {t('выход')} {fmtPercent(active.usage)}
              </span>
            </div>
            <div className="min-h-0 min-w-0 flex-1">
              <SheetPlan sheet={active} margin={marginApplied} />
            </div>
          </div>
        </div>
      )}

      {/* ── итоги: высота совпадает с подвалом спецификации ── */}
      <div
        className="flex h-[34px] shrink-0 items-center gap-3 px-2.5"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-panel)' }}
      >
        <Stat label={t('Листов')} value={cut ? String(cut.totalSheets) : '—'} />
        <Stat label={t('Средний выход')} value={cut ? fmtPercent(cut.averageUsage) : '—'} />
        <div className="min-w-0 flex-1" />
        <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>
          {t('Отходы')}
        </span>
        <span className="num whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
          {fmtArea(sums ? sums.wasteArea : 0)}
        </span>
        <span
          className="num whitespace-nowrap"
          style={{ fontSize: 14, fontWeight: 600, color: 'var(--warn)', letterSpacing: '-0.01em' }}
        >
          {money(sums ? sums.wasteCost : 0)}
        </span>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function Param({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="label whitespace-nowrap">{label}</span>
      {children}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5">
      <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>
        {label}
      </span>
      <span className="num whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
        {value}
      </span>
    </span>
  )
}
