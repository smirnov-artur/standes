/**
 * Визуальный язык магнитов: кольца по углам, линия стыка, вспышка захвата,
 * призрак цели, подсветка грани партнёра и крышки нижнего юнита при штабеле.
 *
 * Высота установки учитывается везде: кольца юнита, стоящего на башне, рисуются
 * на его собственном уровне, призрак — на высоте кандидата.
 *
 * Всё, что меняется каждый кадр, обновляется прямой мутацией объектов в useFrame —
 * ни одного setState во время драга. Кольца — две InstancedMesh (спокойные и
 * «горячие»): per-instance альфа в meshBasicMaterial невозможна, а два инстанса
 * дешевле кастомного шейдера и всё ещё два draw call на любое число юнитов.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Line2, LineSegments2 } from 'three-stdlib'

import { elevationOf, footprintCorners, outerSize, unitTopY } from '@/domain/frame'
import { MM, mm } from '@/domain/types'
import type { FaceId, ShelfUnit, Vec2, Vec3 } from '@/domain/types'
import type { DragState } from '@/store/useStore'
import { appState, useAppStore, useUnits } from '@/store/useStore'

type AnyLine = Line2 | LineSegments2

// ── палитра из CSS-переменных ───────────────────────────────────────────────

interface Palette {
  magnet: string
  magnetHi: string
  danger: string
}

const FALLBACK: Palette = { magnet: '#4ea8ff', magnetHi: '#82c4ff', danger: '#ff5f56' }

function readPalette(): Palette {
  if (typeof document === 'undefined') return FALLBACK
  const cs = getComputedStyle(document.documentElement)
  const get = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb
  return {
    magnet: get('--magnet', FALLBACK.magnet),
    magnetHi: get('--magnet-hi', FALLBACK.magnetHi),
    danger: get('--danger', FALLBACK.danger),
  }
}

/** Читается один раз и перечитывается при смене темы (после применения атрибута) */
function usePalette(): Palette {
  const theme = useAppStore((s) => s.view.theme)
  const [pal, setPal] = useState<Palette>(readPalette)
  useEffect(() => {
    const id = requestAnimationFrame(() => setPal(readPalette()))
    return () => cancelAnimationFrame(id)
  }, [theme])
  return pal
}

// ── мелочь ──────────────────────────────────────────────────────────────────

/** Поворот вокруг Y в соглашении домена (совпадает с three: mesh.rotation.y = rotY) */
function rot2(v: Vec2, cos: number, sin: number): Vec2 {
  return { x: v.x * cos + v.z * sin, z: -v.x * sin + v.z * cos }
}

const FACE_NORMAL: Record<FaceId, Vec2> = {
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
  back: { x: 0, z: -1 },
  front: { x: 0, z: 1 },
}

/** Пишем координаты прямо в интерливнутый буфер линии — без пересоздания геометрии */
function writeLine(line: AnyLine | null, coords: ArrayLike<number>): void {
  if (!line) return
  const attr = line.geometry.getAttribute('instanceStart') as
    | THREE.InterleavedBufferAttribute
    | undefined
  if (!attr) return
  const arr = attr.data.array as Float32Array
  const n = Math.min(arr.length, coords.length)
  for (let i = 0; i < n; i++) arr[i] = coords[i]
  attr.data.needsUpdate = true
}

/** 8 углов габаритного бокса: [знак X, доля высоты, знак Z] */
const BOX_PT: readonly (readonly [number, number, number])[] = [
  [-1, 0, -1],
  [1, 0, -1],
  [1, 0, 1],
  [-1, 0, 1],
  [-1, 1, -1],
  [1, 1, -1],
  [1, 1, 1],
  [-1, 1, 1],
]
/** 12 рёбер парами индексов */
const BOX_EDGES: readonly number[] = [
  0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7,
]

/** base — высота низа коробки, мм (0 = на полу) */
function fillBox(out: Float32Array, size: Vec3, pos: Vec2, rotY: number, base: number): void {
  const cos = Math.cos(rotY)
  const sin = Math.sin(rotY)
  const hw = size.x / 2
  const hd = size.z / 2
  let o = 0
  for (const i of BOX_EDGES) {
    const p = BOX_PT[i]
    const lx = p[0] * hw
    const lz = p[2] * hd
    out[o++] = (pos.x + lx * cos + lz * sin) * MM
    out[o++] = (base + p[1] * size.y) * MM
    out[o++] = (pos.z - lx * sin + lz * cos) * MM
  }
}


// ────────────────────────────────────────────────────────────────────────────
//  1) Кольца магнитов по углам
// ────────────────────────────────────────────────────────────────────────────

const RING_Y = mm(3)

function MagnetRings({ pal }: { pal: Palette }) {
  const units = useUnits()
  const show = useAppStore((s) => s.view.showMagnets)
  const cap = Math.max(16, units.length * 4)

  const geom = useMemo(() => new THREE.RingGeometry(mm(22), mm(30), 40).rotateX(-Math.PI / 2), [])
  useEffect(() => () => void geom.dispose(), [geom])

  const idle = useRef<THREE.InstancedMesh>(null)
  const hot = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    idle.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    hot.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }, [cap, show])

  useFrame(() => {
    const im = idle.current
    const hm = hot.current
    if (!im || !hm) return
    const st = appState()
    const drag = st.drag

    const hotIds = new Set<string>()
    if (drag) {
      for (const id of drag.unitIds) hotIds.add(id)
      if (drag.candidate) hotIds.add(drag.candidate.partnerId)
    }

    let ni = 0
    let nh = 0
    for (const u of st.project.units) {
      if (u.hidden) continue
      const t = drag?.live[u.id]
      const view: ShelfUnit = t ? { ...u, pos: t.pos, rotY: t.rotY, elevation: t.elevation } : u
      const isHot = hotIds.has(u.id)
      // магниты юнита на башне живут на его уровне, а не на полу
      const y = elevationOf(view) * MM + RING_Y
      for (const c of footprintCorners(view)) {
        dummy.position.set(c.x * MM, y, c.z * MM)
        dummy.scale.setScalar(isHot ? 1.55 : 1)
        dummy.updateMatrix()
        if (isHot) {
          if (nh < cap) hm.setMatrixAt(nh++, dummy.matrix)
        } else if (ni < cap) {
          im.setMatrixAt(ni++, dummy.matrix)
        }
      }
    }
    im.count = ni
    hm.count = nh
    im.instanceMatrix.needsUpdate = true
    hm.instanceMatrix.needsUpdate = true
  })

  if (!show) return null

  return (
    <>
      <instancedMesh ref={idle} args={[geom, undefined, cap]} frustumCulled={false} renderOrder={10}>
        <meshBasicMaterial
          color={pal.magnet}
          transparent
          opacity={0.22}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      <instancedMesh ref={hot} args={[geom, undefined, cap]} frustumCulled={false} renderOrder={11}>
        <meshBasicMaterial
          color={pal.magnetHi}
          transparent
          opacity={0.75}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  2) Всё, что живёт только во время драга
// ────────────────────────────────────────────────────────────────────────────

const SPARK_POOL = 6
const SPARK_LIFE = 0.38
/** подъём подсветки крышки над самой крышкой, чтобы не мерцала z-fighting-ом */
const TOP_LIFT = mm(2)

interface Spark {
  t: number
  x: number
  /** высота вспышки, метры сцены */
  y: number
  z: number
}

function DragOverlay({ pal }: { pal: Palette }) {
  const invalidate = useThree((s) => s.invalidate)

  // ── общие ресурсы ──
  const faceGeom = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  /** горизонтальная плоскость — подсветка крышки нижнего юнита при штабеле */
  const topGeom = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), [])
  const sparkGeom = useMemo(
    () => new THREE.RingGeometry(mm(26), mm(36), 48).rotateX(-Math.PI / 2),
    [],
  )

  const sparkMats = useMemo(
    () =>
      Array.from(
        { length: SPARK_POOL },
        () =>
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
          }),
      ),
    [],
  )

  useEffect(() => {
    for (const m of sparkMats) m.color.set(pal.magnetHi)
  }, [sparkMats, pal.magnetHi])

  useEffect(
    () => () => {
      faceGeom.dispose()
      topGeom.dispose()
      sparkGeom.dispose()
      for (const m of sparkMats) m.dispose()
    },
    [faceGeom, topGeom, sparkGeom, sparkMats],
  )

  // ── рефы ──
  const face = useRef<THREE.Mesh>(null)
  const top = useRef<THREE.Mesh>(null)
  const sparks = useRef<THREE.Group>(null)
  const contact = useRef<AnyLine | null>(null)
  const glow = useRef<AnyLine | null>(null)
  const ghost = useRef<AnyLine | null>(null)
  const ghostDash = useRef<AnyLine | null>(null)

  const boxBuf = useMemo(() => new Float32Array(72), [])
  const lineBuf = useMemo(() => new Float32Array(6), [])
  const sparkState = useMemo<Spark[]>(
    () => Array.from({ length: SPARK_POOL }, () => ({ t: -1, x: 0, y: mm(4), z: 0 })),
    [],
  )
  const sparkNext = useRef(0)
  const sigRef = useRef('')
  const dashKey = useRef('')

  // drei <Line> раскладывает props И на объект, И на материал: visible={false}
  // погасил бы материал НАВСЕГДА. Поэтому прячем линии только через объект.
  useEffect(() => {
    for (const r of [contact, glow, ghost, ghostDash]) {
      if (r.current) r.current.visible = false
    }
  }, [])

  const zeroBox = useMemo<[number, number, number][]>(
    () => Array.from({ length: 24 }, () => [0, 0, 0] as [number, number, number]),
    [],
  )
  const zeroSeg = useMemo<[number, number, number][]>(
    () => [
      [0, 0, 0],
      [0, 0, 0],
    ],
    [],
  )

  // ── кадр ──
  useFrame((_, dt) => {
    const st = appState()
    const drag = st.drag

    animateSparks(dt, drag)

    if (!drag) {
      hideAll()
      return
    }

    const units = st.project.units
    const primaryId = drag.unitIds[0]
    const primary = units.find((u) => u.id === primaryId)
    if (!primary) {
      hideAll()
      return
    }

    const cand = drag.candidate
    const danger = drag.colliding.length > 0

    // 4) призрак цели — на высоте кандидата: при штабеле он висит над крышкой
    const target = cand
      ? { pos: cand.pos, rotY: cand.rotY, elevation: cand.elevation }
      : drag.live[primaryId]
    const showGhost = (!!cand || danger) && !!target
    const gs = ghost.current
    const gd = ghostDash.current
    if (showGhost && target) {
      const size = outerSize(primary.frame)
      fillBox(boxBuf, size, target.pos, target.rotY, target.elevation)
      if (danger) {
        writeLine(gd, boxBuf)
        // штрихи пересчитываем только когда меняется габарит — длины рёбер постоянны
        const key = `${size.x}x${size.y}x${size.z}`
        if (gd && dashKey.current !== key) {
          dashKey.current = key
          gd.computeLineDistances()
        }
      } else {
        writeLine(gs, boxBuf)
      }
    }
    if (gs) gs.visible = showGhost && !danger
    if (gd) gd.visible = showGhost && danger

    // 2) линия стыка
    const contactPts = cand?.contact
    const long = contactPts ? Math.hypot(contactPts[0].x - contactPts[1].x, contactPts[0].z - contactPts[1].z) > 1 : false
    if (contactPts && long) {
      // линия стыка живёт на уровне стыка: у штабеля это крышка нижнего юнита
      const y = mm(5) + (target?.elevation ?? 0) * MM
      lineBuf[0] = contactPts[0].x * MM
      lineBuf[1] = y
      lineBuf[2] = contactPts[0].z * MM
      lineBuf[3] = contactPts[1].x * MM
      lineBuf[4] = y
      lineBuf[5] = contactPts[1].z * MM
      writeLine(contact.current, lineBuf)
      writeLine(glow.current, lineBuf)
    }
    if (contact.current) contact.current.visible = long
    if (glow.current) glow.current.visible = long

    // 5) подсветка грани партнёра
    const fm = face.current
    if (fm) {
      fm.visible = false
      const anchorId = cand?.partnerAnchorId
      if (cand && anchorId) {
        const tag = anchorId.slice(anchorId.lastIndexOf(':') + 1)
        const partner = units.find((u) => u.id === cand.partnerId)
        if (partner && tag.startsWith('f')) {
          const f = tag.slice(1) as FaceId
          const nLocal = FACE_NORMAL[f]
          if (nLocal) {
            const s = outerSize(partner.frame)
            const cos = Math.cos(partner.rotY)
            const sin = Math.sin(partner.rotY)
            const nW = rot2(nLocal, cos, sin)
            const cW = rot2({ x: (nLocal.x * s.x) / 2, z: (nLocal.z * s.z) / 2 }, cos, sin)
            const w = f === 'left' || f === 'right' ? s.z : s.x
            // партнёр сам может стоять на башне — грань подсвечиваем на его уровне
            fm.position.set(
              (partner.pos.x + cW.x + nW.x * 3) * MM,
              (elevationOf(partner) + s.y / 2) * MM,
              (partner.pos.z + cW.z + nW.z * 3) * MM,
            )
            fm.rotation.set(0, Math.atan2(nW.x, nW.z), 0)
            fm.scale.set(w * MM, s.y * MM, 1)
            fm.visible = true
          }
        }
      }
    }

    // 6) штабель: подсветка КРЫШКИ нижнего юнита — площадка, на которую встанем
    const tm = top.current
    if (tm) {
      tm.visible = false
      if (cand && cand.kind === 'stack') {
        const partner = units.find((u) => u.id === cand.partnerId)
        if (partner) {
          // нижний юнит не перетаскивается, но live читаем на всякий случай
          const lp = drag.live[partner.id]
          const view: ShelfUnit = lp
            ? { ...partner, pos: lp.pos, rotY: lp.rotY, elevation: lp.elevation }
            : partner
          const s = outerSize(view.frame)
          tm.position.set(view.pos.x * MM, unitTopY(view) * MM + TOP_LIFT, view.pos.z * MM)
          tm.rotation.set(0, view.rotY, 0)
          tm.scale.set(s.x * MM, 1, s.z * MM)
          tm.visible = true
        }
      }
    }
  })

  // 3) вспышка при захвате
  function animateSparks(dt: number, drag: DragState | null) {
    const g = sparks.current
    if (!g) return
    const cand = drag?.candidate ?? null
    const sig = cand ? `${cand.partnerId}|${cand.kind}` : ''
    if (sig !== sigRef.current) {
      sigRef.current = sig
      const pts = cand?.sparks
      if (pts?.length) {
        // вспышка щёлкает там, где стык: у штабеля — на крышке нижнего юнита
        const y = mm(4) + (cand ? cand.elevation * MM : 0)
        for (const p of pts.slice(0, SPARK_POOL)) {
          const s = sparkState[sparkNext.current % SPARK_POOL]
          sparkNext.current++
          s.t = 0
          s.x = p.x * MM
          s.y = y
          s.z = p.z * MM
        }
      }
    }

    let alive = false
    for (let i = 0; i < SPARK_POOL; i++) {
      const s = sparkState[i]
      const m = g.children[i] as THREE.Mesh | undefined
      if (!m) continue
      if (s.t < 0) {
        m.visible = false
        continue
      }
      s.t += dt
      const k = s.t / SPARK_LIFE
      if (k >= 1) {
        s.t = -1
        m.visible = false
        continue
      }
      alive = true
      const e = 1 - Math.pow(1 - k, 3)
      m.visible = true
      m.position.set(s.x, s.y, s.z)
      m.scale.setScalar(0.3 + 1.3 * e)
      sparkMats[i].opacity = 0.9 * (1 - k)
    }
    if (alive) invalidate()
  }

  function hideAll() {
    if (face.current) face.current.visible = false
    if (top.current) top.current.visible = false
    if (contact.current) contact.current.visible = false
    if (glow.current) glow.current.visible = false
    if (ghost.current) ghost.current.visible = false
    if (ghostDash.current) ghostDash.current.visible = false
  }

  return (
    <>
      {/* подсветка грани партнёра */}
      <mesh ref={face} geometry={faceGeom} visible={false} frustumCulled={false} renderOrder={9}>
        <meshBasicMaterial
          color={pal.magnet}
          transparent
          opacity={0.14}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* штабель: площадка на крышке нижнего юнита */}
      <mesh ref={top} geometry={topGeom} visible={false} frustumCulled={false} renderOrder={9}>
        <meshBasicMaterial
          color={pal.magnet}
          transparent
          opacity={0.18}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* вспышки захвата */}
      <group ref={sparks}>
        {sparkMats.map((m, i) => (
          <mesh
            key={i}
            geometry={sparkGeom}
            material={m}
            visible={false}
            frustumCulled={false}
            renderOrder={13}
          />
        ))}
      </group>

      {/* линия стыка: широкое свечение + чёткое ядро */}
      <Line
        ref={glow}
        points={zeroSeg}
        segments
        color={pal.magnet}
        lineWidth={9}
        transparent
        opacity={0.22}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        frustumCulled={false}
        renderOrder={12}
      />
      <Line
        ref={contact}
        points={zeroSeg}
        segments
        color={pal.magnetHi}
        lineWidth={3}
        transparent
        opacity={0.95}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        frustumCulled={false}
        renderOrder={13}
      />

      {/* призрак цели: сплошной — норма, пунктир — пересечение */}
      <Line
        ref={ghost}
        points={zeroBox}
        segments
        color={pal.magnet}
        lineWidth={2}
        transparent
        opacity={0.5}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        frustumCulled={false}
        renderOrder={12}
      />
      <Line
        ref={ghostDash}
        points={zeroBox}
        segments
        dashed
        dashSize={0.05}
        gapSize={0.035}
        color={pal.danger}
        lineWidth={2}
        transparent
        opacity={0.7}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        frustumCulled={false}
        renderOrder={12}
      />
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export function SnapVisuals() {
  const pal = usePalette()
  return (
    <group>
      <MagnetRings pal={pal} />
      <DragOverlay pal={pal} />
    </group>
  )
}
