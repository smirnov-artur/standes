/**
 * Магниты: анкеры юнита и решатель примагничивания.
 *
 * Всё в МИЛЛИМЕТРАХ и РАДИАНАХ. Геометрия — только через frame.ts.
 *
 * Соглашение о поворотах совпадает с toWorld():
 *   rot(v, a) = (v.x·cos a + v.z·sin a,  -v.x·sin a + v.z·cos a)
 * При таком повороте «угол» вектора ang(v) = atan2(v.x, v.z) увеличивается на a —
 * это позволяет считать нужный доворот аналитически, без итераций.
 */

import type {
  Anchor,
  FaceId,
  Room,
  ShelfUnit,
  SnapCandidate,
  SnapSettings,
  Vec2,
  Vec3,
} from './types'
import {
  MAX_ELEVATION,
  elevationOf,
  footprintCorners,
  normAngle,
  outerSize,
  toWorld,
  unitTopY,
} from './frame'
import { COLLIDE_TOL, footprintRadius, obbOverlapCorners, overlapArea, verticalOverlap } from './collision'
import { t } from '@/i18n'

// ── константы решателя ──────────────────────────────────────────────────────

const DEG = Math.PI / 180
/** штрафы по типам: face самый ценный, grid — последний резерв */
const CORNER_PENALTY = 60
const WALL_PENALTY = 120
const GRID_PENALTY = 400
/**
 * Чистый доворот — самый последний резерв: сетка правит И позицию, И угол,
 * поэтому она должна выигрывать у голого доворота.
 */
const ANGLE_PENALTY = 500
/** бонус за L-стыковку углом */
const L_BONUS = 30
/** бонус за совпадение габарита («родная» стыковка липче) */
const SAME_SIZE_BONUS = 40
const SAME_SIZE_EPS = 2
/** максимальный доворот при мэйте грань-в-грань */
const MAX_TURN = 50 * DEG
/** доворот, разрешённый при выключенной привязке угла */
const FREE_TURN = 3 * DEG
/** цена одного градуса доворота, мм */
const TURN_COST_PER_DEG = 4
/** допуск на «в линию» и на перпендикулярность */
const FLUSH_EPS = 1
const PERP_EPS = 2 * DEG
/** минимальная длина фактического касания граней, мм */
const MIN_CONTACT = 1

// ── штабель ─────────────────────────────────────────────────────────────────

/**
 * Штраф типа 'stack'. Между face (0) и grid (400) — и заметно ближе к face:
 * поставить сверху должно выигрывать у сетки, но не перебивать боковой стык,
 * когда юнит тащат сбоку и оба варианта одинаково близки.
 */
const STACK_PENALTY = 40
/** бонус за совпадение габаритов в плане: родные модули липнут охотнее */
const STACK_SIZE_BONUS = 60
/**
 * Какую долю МЕНЬШЕГО из двух пятен должна накрывать опора, иначе верхний
 * свалится. 0.55 — половина с запасом: центр тяжести гарантированно над нижним.
 */
const MIN_SUPPORT_RATIO = 0.55
/**
 * Допустимый свес верхнего юнита за край нижнего — доля от габарита ВЕРХНЕГО
 * по той же оси. Дешёвая защита от заведомо падающих башен:
 * большой шкаф на маленькую тумбу не встанет.
 */
const MAX_OVERHANG_RATIO = 0.25
/** допуск на «крышка нижнего = низ верхнего», мм */
const SUPPORT_EPS = 2

// ── векторная мелочь ────────────────────────────────────────────────────────

const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z })
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z)
/** правый перпендикуляр (используется как касательная грани) */
const perp = (v: Vec2): Vec2 => ({ x: v.z, z: -v.x })
const mad = (p: Vec2, v: Vec2, k: number): Vec2 => ({ x: p.x + v.x * k, z: p.z + v.z * k })

/** Тот же поворот, что и в toWorld, но без переноса */
function rot2(v: Vec2, a: number): Vec2 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x * c + v.z * s, z: -v.x * s + v.z * c }
}

/** Угол вектора в системе rotY: поворот на a увеличивает его ровно на a */
const ang = (v: Vec2) => Math.atan2(v.x, v.z)

// ── грани и углы ────────────────────────────────────────────────────────────

const FACES: readonly FaceId[] = ['left', 'right', 'back', 'front']

/** Локальные внешние нормали граней */
const FACE_NORMAL: Record<FaceId, Vec2> = {
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
  back: { x: 0, z: -1 },
  front: { x: 0, z: 1 },
}

/** ang() локальных нормалей и их противоположностей — константы, считаем один раз */
const FACE_ANG = Object.fromEntries(
  FACES.map((f) => [f, Math.atan2(FACE_NORMAL[f].x, FACE_NORMAL[f].z)]),
) as Record<FaceId, number>
const FACE_ANG_OPP = Object.fromEntries(
  FACES.map((f) => [f, Math.atan2(-FACE_NORMAL[f].x, -FACE_NORMAL[f].z)]),
) as Record<FaceId, number>

const FACE_RU: Record<FaceId, string> = {
  left: 'левый бок',
  right: 'правый бок',
  back: 'спина',
  front: 'фасад',
}

/** Биссектрисы смежных граней: 0 = back-left, 1 = back-right, 2 = front-right, 3 = front-left */
const K = Math.SQRT1_2
const CORNER_NORMAL: readonly Vec2[] = [
  { x: -K, z: -K },
  { x: K, z: -K },
  { x: K, z: K },
  { x: -K, z: K },
]
/** Представительная грань угла (нужна для Anchor.face) */
const CORNER_FACE: readonly FaceId[] = ['back', 'back', 'front', 'front']

function faceCenterLocal(f: FaceId, s: Vec3): Vec2 {
  switch (f) {
    case 'left':
      return { x: -s.x / 2, z: 0 }
    case 'right':
      return { x: s.x / 2, z: 0 }
    case 'back':
      return { x: 0, z: -s.z / 2 }
    case 'front':
      return { x: 0, z: s.z / 2 }
  }
}

/** Длина грани в плане: у боков — глубина, у спины/фасада — ширина */
function faceLength(f: FaceId, s: Vec3): number {
  return f === 'left' || f === 'right' ? s.z : s.x
}

function cornerLocals(s: Vec3): Vec2[] {
  const hw = s.x / 2
  const hd = s.z / 2
  return [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ]
}

// ── анкеры ──────────────────────────────────────────────────────────────────

/** 4 угловых + 4 гранных анкера юнита, в мировых координатах */
export function unitAnchors(u: ShelfUnit): Anchor[] {
  const s = outerSize(u.frame)
  const corners = footprintCorners(u)
  const out: Anchor[] = []

  for (let i = 0; i < 4; i++) {
    out.push({
      id: `${u.id}:c${i}`,
      unitId: u.id,
      kind: 'corner',
      corner: i as 0 | 1 | 2 | 3,
      face: CORNER_FACE[i],
      world: corners[i],
      normal: rot2(CORNER_NORMAL[i], u.rotY),
      height: s.y,
      depth: s.z,
      width: s.x,
    })
  }

  for (const f of FACES) {
    out.push({
      id: `${u.id}:f${f}`,
      unitId: u.id,
      kind: 'face',
      face: f,
      world: toWorld(u, faceCenterLocal(f, s)),
      normal: rot2(FACE_NORMAL[f], u.rotY),
      height: s.y,
      depth: s.z,
      width: s.x,
    })
  }

  return out
}

// ── простые привязки ────────────────────────────────────────────────────────

/** Округление угла к кратному step */
export function snapAngle(rot: number, step: number): number {
  if (!(step > 0)) return rot
  return normAngle(Math.round(rot / step) * step)
}

/** Округление позиции к сетке */
export function snapToGrid(pos: Vec2, size: number): Vec2 {
  if (!(size > 0)) return { ...pos }
  return { x: Math.round(pos.x / size) * size, z: Math.round(pos.z / size) * size }
}

// ── решатель ────────────────────────────────────────────────────────────────

export interface SnapQuery {
  /** перетаскиваемый юнит с УЖЕ применённой «сырой» позицией от курсора */
  unit: ShelfUnit
  /** все остальные видимые юниты */
  others: ShelfUnit[]
  room: Room
  settings: SnapSettings
}

const moved = (u: ShelfUnit, pos: Vec2, rotY: number, elevation = elevationOf(u)): ShelfUnit => ({
  ...u,
  pos,
  rotY,
  elevation,
})

/** Сосед, прошедший грубый отсев: углы и радиус посчитаны один раз на вызов */
interface NearUnit {
  u: ShelfUnit
  corners: Vec2[]
  radius: number
}

/**
 * Пересекается ли кандидат хоть с кем-то из соседей.
 * Проверка ТРЁХМЕРНАЯ: юнит, вставший на крышку соседа, пятном его накрывает,
 * но пересечением это не является — иначе ни один штабель бы не собрался.
 */
function candidateHits(u: ShelfUnit, myR: number, c: SnapCandidate, near: NearUnit[]): boolean {
  const probe = moved(u, c.pos, c.rotY, c.elevation)
  let mine: Vec2[] | null = null
  for (const n of near) {
    // разные этажи либо касание крышкой — SAT считать незачем
    if (verticalOverlap(probe, n.u, COLLIDE_TOL) <= 0) continue
    // окружности не пересекаются — тоже
    if (Math.hypot(c.pos.x - n.u.pos.x, c.pos.z - n.u.pos.z) > myR + n.radius) continue
    if (!mine) mine = footprintCorners(probe)
    if (obbOverlapCorners(mine, n.corners, COLLIDE_TOL)) return true
  }
  return false
}

// ── опора и гравитация ──────────────────────────────────────────────────────

/** Площадь пятна юнита, мм² (пятно всегда прямоугольник, интеграл не нужен) */
function footprintArea(u: ShelfUnit): number {
  const s = outerSize(u.frame)
  return s.x * s.z
}

/**
 * Есть ли под юнитом опора, если поставить его в (pos, rotY) на высоту elev.
 * Опора — сосед, крышка которого совпадает с низом юнита и который накрывает
 * не меньше MIN_SUPPORT_RATIO меньшего из двух пятен. Пол (elev === 0) — опора всегда.
 */
function supportedAt(u: ShelfUnit, pos: Vec2, rotY: number, elev: number, near: NearUnit[]): boolean {
  if (elev <= 0) return true
  const probe = moved(u, pos, rotY, elev)
  const myArea = footprintArea(u)
  for (const n of near) {
    if (Math.abs(unitTopY(n.u) - elev) > SUPPORT_EPS) continue
    if (overlapArea(probe, n.u) >= Math.min(myArea, footprintArea(n.u)) * MIN_SUPPORT_RATIO) return true
  }
  return false
}

/**
 * Гравитация для внешнего кода (драг без привязок, программные перемещения):
 * высота, на которой юнит реально удержится в своей текущей позиции.
 * Ни на чём не стоит — падает на пол, никаких висящих в воздухе стеллажей.
 */
export function supportedElevation(u: ShelfUnit, others: ShelfUnit[]): number {
  const elev = elevationOf(u)
  if (elev <= 0) return 0
  const near: NearUnit[] = []
  for (const o of others) {
    if (o.id === u.id || o.hidden) continue
    near.push({ u: o, corners: footprintCorners(o), radius: footprintRadius(o) })
  }
  return supportedAt(u, u.pos, u.rotY, elev, near) ? elev : 0
}

/**
 * Подбирает лучшего кандидата примагничивания.
 * Приоритет задаётся штрафами:
 *   face (0) < stack (40) < corner (60) < wall (120) < grid (400) < angle (500).
 *
 * Высоту решает тот же проход: боковые стыки несут ТЕКУЩУЮ высоту юнита,
 * 'stack' — крышку соседа, а если под юнитом в предложенной точке нет опоры,
 * он падает на пол.
 *
 * Стоимость решателя удерживается двумя приёмами:
 *   1) грубый отсев соседей по описанным окружностям — кандидаты вообще не строятся
 *      для юнитов, до которых магнит не дотянется;
 *   2) кандидаты сортируются по цене и проверяются на пересечение по одному,
 *      с выходом на первом свободном, — вместо полной фильтрации «все × все».
 */
export function solveSnap(q: SnapQuery): SnapCandidate | null {
  const { unit, room, settings } = q
  if (!settings.enabled) return null

  const myR = footprintRadius(unit)
  const myElev = elevationOf(unit)
  // максимальный сдвиг, который вообще может предложить решатель
  const reach = Math.max(settings.magnetRadius, settings.gridSize)
  const near: NearUnit[] = []
  for (const o of q.others) {
    if (o.id === unit.id || o.hidden) continue
    const radius = footprintRadius(o)
    if (Math.hypot(o.pos.x - unit.pos.x, o.pos.z - unit.pos.z) > reach + myR + radius) continue
    near.push({ u: o, corners: footprintCorners(o), radius })
  }

  /**
   * Падение на пол — последний резерв: юнит висит в воздухе, а поставить его
   * не на что. Кандидат не участвует в сортировке, его берут, когда больше нечего.
   */
  const fall = (): SnapCandidate | null => {
    if (myElev <= 0 || supportedAt(unit, unit.pos, unit.rotY, myElev, near)) return null
    return {
      kind: 'stack',
      pos: { ...unit.pos },
      rotY: unit.rotY,
      elevation: 0,
      cost: GRID_PENALTY,
      partnerId: 'floor',
      label: t('На пол'),
    }
  }

  const cands: SnapCandidate[] = []
  if (settings.magnets) {
    for (const n of near) {
      faceMates(unit, n.u, settings, cands)
      cornerMates(unit, n, settings, cands)
    }
  }
  if (settings.stack) {
    for (const n of near) stackMates(unit, n.u, settings, cands)
  }
  if (settings.walls) wallSnaps(unit, room, settings, cands)
  if (settings.grid) cands.push(gridSnap(unit, settings))
  const turn = angleSnapCandidate(unit, settings)
  if (turn) cands.push(turn)

  // гравитация: боковой стык высоту не меняет, но если в новой точке под юнитом
  // пусто — он съезжает на пол вместе с примагничиванием
  if (myElev > 0) {
    for (const c of cands) {
      if (c.kind === 'stack') continue
      if (!supportedAt(unit, c.pos, c.rotY, myElev, near)) c.elevation = 0
    }
  }

  if (!cands.length) return fall()

  cands.sort((a, b) => a.cost - b.cost)
  if (!settings.collide) return cands[0]
  for (const c of cands) if (!candidateHits(unit, myR, c, near)) return c
  return fall()
}

// ── A) мэйт грань-в-грань ───────────────────────────────────────────────────

function faceMateLabel(mf: FaceId, pf: FaceId, flush: boolean): string {
  if (mf === 'back' && pf === 'back') return 'Спина к спине'
  if (mf === 'front' && pf === 'front') return 'Фасад к фасаду'
  const sideMate = (mf === 'left' || mf === 'right') && (pf === 'left' || pf === 'right')
  if (sideMate && flush) return 'В линию'
  return `Стык: ${FACE_RU[mf]} → ${FACE_RU[pf]}`
}

function faceMates(u: ShelfUnit, o: ShelfUnit, st: SnapSettings, out: SnapCandidate[]) {
  const su = outerSize(u.frame)
  const so = outerSize(o.frame)
  // «родные» стыковки липче
  const bonus =
    (Math.abs(su.y - so.y) < SAME_SIZE_EPS ? SAME_SIZE_BONUS : 0) +
    (Math.abs(su.z - so.z) < SAME_SIZE_EPS ? SAME_SIZE_BONUS : 0)
  const turnLimit = st.angle ? MAX_TURN : FREE_TURN

  // партнёрская грань не зависит от моей — считаем её один раз
  for (const pf of FACES) {
    const n = rot2(FACE_NORMAL[pf], o.rotY) // мировая нормаль чужой грани
    const c = toWorld(o, faceCenterLocal(pf, so)) // мировой центр чужой грани
    const lo = faceLength(pf, so)
    const t = perp(n) // касательная стыка
    const sBase = dot(c, t) // положение чужой грани вдоль стыка

    for (const mf of FACES) {
      const cLocal = faceCenterLocal(mf, su)
      const lm = faceLength(mf, su)

      // поворот, при котором моя нормаль становится ПРОТИВОПОЛОЖНОЙ чужой.
      // считаем от rotY партнёра по ЛОКАЛЬНЫМ нормалям (ang(rot2(v,a)) = ang(v)+a):
      // так итог получается ТОЧНЫМ (ровно o.rotY, ровно o.rotY ± π/2), без накопления ошибки
      const rotY = normAngle(o.rotY + FACE_ANG_OPP[pf] - FACE_ANG[mf])
      const delta = normAngle(rotY - u.rotY)
      if (Math.abs(delta) > turnLimit) continue

      const cRot = rot2(cLocal, rotY) // вынос центра моей грани от центра пятна
      // компонента вдоль нормали: грани касаются (расстояние = 0)
      const along = dot(sub(c, cRot), n)
      const tanBase = sBase - dot(cRot, t)
      const half = (lm - lo) / 2

      // три варианта выравнивания: (а) по центрам, (б)/(в) по краям
      let best: { pos: Vec2; d: number; s: number } | null = null
      for (const shift of [0, half, -half]) {
        const tan = tanBase + shift
        const pos: Vec2 = { x: n.x * along + t.x * tan, z: n.z * along + t.z * tan }
        const d = dist(pos, u.pos)
        if (!best || d < best.d) best = { pos, d, s: sBase + shift }
      }
      if (!best || best.d > st.magnetRadius) continue

      // фактический отрезок касания
      const a0 = Math.max(best.s - lm / 2, sBase - lo / 2)
      const a1 = Math.min(best.s + lm / 2, sBase + lo / 2)
      if (a1 - a0 < MIN_CONTACT) continue
      const p0 = mad(c, t, a0 - sBase)
      const p1 = mad(c, t, a1 - sBase)

      const flush = Math.abs(su.z - so.z) < SAME_SIZE_EPS && Math.abs(best.s - sBase) < FLUSH_EPS

      out.push({
        kind: 'face',
        pos: best.pos,
        rotY,
        // стыковка вбок высоту не меняет — юнит остаётся на своём этаже
        elevation: elevationOf(u),
        cost: best.d + Math.abs(delta / DEG) * TURN_COST_PER_DEG - bonus,
        partnerId: o.id,
        myAnchorId: `${u.id}:f${mf}`,
        partnerAnchorId: `${o.id}:f${pf}`,
        contact: [p0, p1],
        sparks: [p0, p1],
        label: faceMateLabel(mf, pf, flush),
      })
    }
  }
}

// ── B) мэйт угол-в-угол ─────────────────────────────────────────────────────

function cornerMates(u: ShelfUnit, near: NearUnit, st: SnapSettings, out: SnapCandidate[]) {
  const o = near.u
  const rotY = st.angle ? snapAngle(u.rotY, st.angleStep) : u.rotY
  const locals = cornerLocals(outerSize(u.frame))
  const mine = footprintCorners(u)
  const theirs = near.corners
  const perpendicular = Math.abs(Math.abs(normAngle(rotY - o.rotY)) - Math.PI / 2) < PERP_EPS
  const elevation = elevationOf(u)
  // юнит и партнёр на разных этажах — их пятна могут накладываться свободно
  const sameFloor = verticalOverlap(u, o, COLLIDE_TOL) > 0

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (dist(mine[i], theirs[j]) > st.magnetRadius) continue
      const pos = sub(theirs[j], rot2(locals[i], rotY))
      const d = dist(pos, u.pos)
      if (d > st.magnetRadius) continue
      // совмещение углов не должно втыкать юнит в партнёра
      if (sameFloor && obbOverlapCorners(footprintCorners(moved(u, pos, rotY)), theirs, COLLIDE_TOL)) continue

      out.push({
        kind: 'corner',
        pos,
        rotY,
        elevation,
        cost: d + CORNER_PENALTY - (perpendicular ? L_BONUS : 0),
        partnerId: o.id,
        myAnchorId: `${u.id}:c${i}`,
        partnerAnchorId: `${o.id}:c${j}`,
        contact: [theirs[j], theirs[j]],
        sparks: [theirs[j]],
        label: perpendicular ? 'Угол в угол (L)' : 'Угол в угол',
      })
    }
  }
}

// ── B2) штабель: юнит НА юните ──────────────────────────────────────────────

/**
 * Кандидаты «поставить сверху» на юнит o.
 *
 * Работаем в осях НИЖНЕГО юнита: штабель ставят ровно, поэтому итоговый поворот
 * всегда кратен 90° относительно o. Тогда пятно верхнего в осях o остаётся
 * осевым прямоугольником, и вся проверка устойчивости сводится к арифметике
 * по двум осям — свес и площадь опоры.
 */
function stackMates(u: ShelfUnit, o: ShelfUnit, st: SnapSettings, out: SnapCandidate[]) {
  const su = outerSize(u.frame)
  const so = outerSize(o.frame)
  const elev = unitTopY(o)
  // выше потолка штабеля не поднимаемся: снять оттуда всё равно нельзя
  if (elev <= 0 || elev + su.y > MAX_ELEVATION) return

  const ex = rot2({ x: 1, z: 0 }, o.rotY) // мировое направление «вправо» у o
  const ez = rot2({ x: 0, z: 1 }, o.rotY) // мировое направление «вперёд» у o
  const areaO = so.x * so.z

  for (let k = 0; k < 4; k++) {
    const rotY = normAngle(o.rotY + (k * Math.PI) / 2)
    const delta = normAngle(rotY - u.rotY)
    // доворот больше MAX_TURN — юнит явно тащат не сюда
    if (Math.abs(delta) > MAX_TURN) continue

    // при развороте на 90° ширина и глубина меняются местами
    const mx = k % 2 === 0 ? su.x : su.z
    const mz = k % 2 === 0 ? su.z : su.x
    const dx = (so.x - mx) / 2
    const dz = (so.z - mz) / 2

    // выравнивание как в face-мэйте: по центрам либо по краям — по каждой оси o
    let best: { pos: Vec2; d: number; ox: number; oz: number } | null = null
    for (const ox of [0, dx, -dx]) {
      for (const oz of [0, dz, -dz]) {
        const pos: Vec2 = {
          x: o.pos.x + ex.x * ox + ez.x * oz,
          z: o.pos.z + ex.z * ox + ez.z * oz,
        }
        const d = dist(pos, u.pos)
        if (!best || d < best.d) best = { pos, d, ox, oz }
      }
    }
    if (!best || best.d > st.magnetRadius) continue

    // свес за край опоры: башня, у которой верх торчит на четверть, — падающая
    const overX =
      Math.max(0, mx / 2 - best.ox - so.x / 2) + Math.max(0, mx / 2 + best.ox - so.x / 2)
    const overZ =
      Math.max(0, mz / 2 - best.oz - so.z / 2) + Math.max(0, mz / 2 + best.oz - so.z / 2)
    if (overX > mx * MAX_OVERHANG_RATIO || overZ > mz * MAX_OVERHANG_RATIO) continue

    // площадь опоры: не меньше 55 % МЕНЬШЕГО из двух пятен
    const probe = moved(u, best.pos, rotY, elev)
    if (overlapArea(probe, o) < Math.min(mx * mz, areaO) * MIN_SUPPORT_RATIO) continue

    const sameSize = Math.abs(mx - so.x) < SAME_SIZE_EPS && Math.abs(mz - so.z) < SAME_SIZE_EPS
    const flush = sameSize && Math.abs(best.ox) < FLUSH_EPS && Math.abs(best.oz) < FLUSH_EPS

    out.push({
      kind: 'stack',
      pos: best.pos,
      rotY,
      elevation: elev,
      cost:
        best.d +
        Math.abs(delta / DEG) * TURN_COST_PER_DEG -
        (sameSize ? STACK_SIZE_BONUS : 0) +
        STACK_PENALTY,
      partnerId: o.id,
      // «искры» по углам будущей опоры — линию контакта в плане не рисуем:
      // касание здесь горизонтальное, отрезком его не показать
      sparks: footprintCorners(probe),
      label: flush ? t('Сверху, в линию') : t('Сверху'),
    })
  }
}

// ── C) стены комнаты ────────────────────────────────────────────────────────

interface WallDef {
  id: string
  /** направление наружу из комнаты */
  outward: Vec2
  /** dot(p, outward) === offset на внутренней поверхности стены */
  offset: number
  label: string
}

function roomWalls(room: Room): WallDef[] {
  const hw = room.width / 2
  const hd = room.depth / 2
  return [
    { id: 'wall:back', outward: { x: 0, z: -1 }, offset: hd, label: 'К задней стене' },
    { id: 'wall:front', outward: { x: 0, z: 1 }, offset: hd, label: 'К передней стене' },
    { id: 'wall:left', outward: { x: -1, z: 0 }, offset: hw, label: 'К левой стене' },
    { id: 'wall:right', outward: { x: 1, z: 0 }, offset: hw, label: 'К правой стене' },
  ]
}

function wallSnaps(u: ShelfUnit, room: Room, st: SnapSettings, out: SnapCandidate[]) {
  const su = outerSize(u.frame)

  for (const w of roomWalls(room)) {
    const t = perp(w.outward)

    if (st.angle) {
      // доводим поворот до кратного 90° относительно стены и ставим грань вплотную
      const wAng = ang(w.outward)
      for (const mf of FACES) {
        // как и в faceMates: сначала точный итоговый угол, потом доворот от него
        const rotY = normAngle(wAng - FACE_ANG[mf])
        const delta = normAngle(rotY - u.rotY)
        if (Math.abs(delta) > MAX_TURN) continue
        const cRot = rot2(faceCenterLocal(mf, su), rotY)
        const along = w.offset - dot(cRot, w.outward)
        const tan = dot(u.pos, t) // вдоль стены не двигаем
        const pos: Vec2 = {
          x: w.outward.x * along + t.x * tan,
          z: w.outward.z * along + t.z * tan,
        }
        const d = dist(pos, u.pos)
        if (d > st.magnetRadius) continue

        const lm = faceLength(mf, su)
        const s = dot({ x: pos.x + cRot.x, z: pos.z + cRot.z }, t)
        const base = { x: w.outward.x * w.offset, z: w.outward.z * w.offset }
        out.push({
          kind: 'wall',
          pos,
          rotY,
          elevation: elevationOf(u),
          cost: d + WALL_PENALTY + Math.abs(delta / DEG) * TURN_COST_PER_DEG,
          partnerId: w.id,
          myAnchorId: `${u.id}:f${mf}`,
          contact: [mad(base, t, s - lm / 2), mad(base, t, s + lm / 2)],
          sparks: [mad(base, t, s - lm / 2), mad(base, t, s + lm / 2)],
          label: w.label,
        })
      }
    } else {
      // без доводки угла — просто прижимаем самой выступающей точкой пятна
      const corners = footprintCorners(u)
      let support = -Infinity
      let lo = Infinity
      let hi = -Infinity
      for (const c of corners) {
        support = Math.max(support, dot(c, w.outward))
        const s = dot(c, t)
        lo = Math.min(lo, s)
        hi = Math.max(hi, s)
      }
      const shift = w.offset - support
      const d = Math.abs(shift)
      if (d > st.magnetRadius) continue
      const pos = mad(u.pos, w.outward, shift)
      const base = { x: w.outward.x * w.offset, z: w.outward.z * w.offset }
      out.push({
        kind: 'wall',
        pos,
        rotY: u.rotY,
        elevation: elevationOf(u),
        cost: d + WALL_PENALTY,
        partnerId: w.id,
        contact: [mad(base, t, lo), mad(base, t, hi)],
        sparks: [mad(base, t, lo), mad(base, t, hi)],
        label: w.label,
      })
    }
  }
}

// ── D) чистый доворот ───────────────────────────────────────────────────────

/**
 * Доводит только угол, позицию не трогает. Нужен, когда сетка выключена
 * (или юнит уже на сетке) — иначе привязка угла вообще не срабатывает.
 */
function angleSnapCandidate(u: ShelfUnit, st: SnapSettings): SnapCandidate | null {
  if (!st.angle || !(st.angleStep > 0)) return null
  const rotY = snapAngle(u.rotY, st.angleStep)
  const delta = normAngle(rotY - u.rotY)
  if (Math.abs(delta) < 1e-9) return null // доворачивать нечего
  return {
    kind: 'angle',
    pos: { ...u.pos },
    rotY,
    elevation: elevationOf(u),
    cost: Math.abs(delta / DEG) * TURN_COST_PER_DEG + ANGLE_PENALTY,
    partnerId: 'angle',
    label: `Угол ${Math.round(rotY / DEG)}°`,
  }
}

// ── E) сетка ────────────────────────────────────────────────────────────────

function gridSnap(u: ShelfUnit, st: SnapSettings): SnapCandidate {
  const pos = snapToGrid(u.pos, st.gridSize)
  const rotY = st.angle ? snapAngle(u.rotY, st.angleStep) : u.rotY
  return {
    kind: 'grid',
    pos,
    rotY,
    elevation: elevationOf(u),
    cost: dist(pos, u.pos) + GRID_PENALTY,
    partnerId: 'grid',
    label: 'По сетке',
  }
}

// ── применение ──────────────────────────────────────────────────────────────

export interface UnitTransform {
  pos: Vec2
  rotY: number
  /** высота НИЗА юнита над полом, мм */
  elevation: number
}

/**
 * Новые трансформы для ВСЕХ перетаскиваемых юнитов.
 * primary встаёт в кандидата, остальные получают тот же сдвиг
 * и поворот вокруг позиции primary — связка едет как одно целое.
 *
 * По высоте связка тоже едет целиком: остальные получают ТОТ ЖЕ сдвиг Δ,
 * что и primary, — двухэтажная сцепка переезжает, не рассыпаясь. Ниже пола
 * при этом никто не проваливается.
 */
export function applySnap(
  units: ShelfUnit[],
  primaryId: string,
  cand: SnapCandidate,
): Record<string, UnitTransform> {
  const out: Record<string, UnitTransform> = {}
  const primary = units.find((u) => u.id === primaryId)
  if (!primary) return out

  const delta = normAngle(cand.rotY - primary.rotY)
  const dElev = cand.elevation - elevationOf(primary)
  for (const u of units) {
    if (u.id === primaryId) {
      out[u.id] = { pos: { ...cand.pos }, rotY: cand.rotY, elevation: cand.elevation }
      continue
    }
    const rel = rot2(sub(u.pos, primary.pos), delta)
    out[u.id] = {
      pos: { x: cand.pos.x + rel.x, z: cand.pos.z + rel.z },
      rotY: normAngle(u.rotY + delta),
      elevation: Math.max(0, elevationOf(u) + dElev),
    }
  }
  return out
}
