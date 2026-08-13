/**
 * Свет и окружение сцены.
 *
 * Окружение строится ЛОКАЛЬНО: drei <Environment> с Lightformer'ами внутри
 * рендерит собственную кубическую карту (никаких внешних HDR и сети).
 * Поверх — реальное «солнце» с мягкой тенью, лёгкая заливка и контактные тени.
 *
 * Всё в МЕТРАХ: домен (мм) сюда не приходит, кроме подписи-хэша для
 * пересчёта контактных теней.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'

import { outerSize } from '@/domain/frame'
import type { Quality, ViewSettings } from '@/domain/types'
import { useAppStore } from '@/store/useStore'

type EnvKind = ViewSettings['env']

// ────────────────────────────────────────────────────────────────────────────
//  Пресеты окружения (только Lightformer'ы — они попадают в env-карту)
// ────────────────────────────────────────────────────────────────────────────

function EnvRig({ env }: { env: EnvKind }) {
  if (env === 'loft') {
    return (
      <>
        {/* «окно» слева-спереди: высокое, тёплое, главный источник рисунка */}
        <Lightformer
          form="rect"
          intensity={3.2}
          color="#ffe6c0"
          scale={[3.2, 9, 1]}
          position={[-7.5, 3.6, 3.5]}
        />
        {/* слабый отражённый свет от потолка */}
        <Lightformer
          form="rect"
          intensity={0.55}
          color="#d8e2f0"
          scale={[12, 12, 1]}
          position={[0, 7, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
        {/* холодная подсветка справа, чтобы тень не проваливалась */}
        <Lightformer
          form="rect"
          intensity={0.35}
          color="#8fa4c0"
          scale={[6, 5, 1]}
          position={[7, 2.6, -2]}
        />
        {/* тёмный низ — контраст «лофта» */}
        <Lightformer
          form="rect"
          intensity={0.06}
          color="#1b1a18"
          scale={[14, 14, 1]}
          position={[0, -3, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      </>
    )
  }

  if (env === 'warm') {
    return (
      <>
        {/* общий тёплый купол */}
        <Lightformer
          form="circle"
          intensity={1.1}
          color="#ffd9a8"
          scale={[16, 16, 1]}
          position={[0, 5, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={2.2}
          color="#fff0dc"
          scale={[8, 8, 1]}
          position={[0, 6.5, 1.5]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
        <Lightformer form="rect" intensity={0.7} color="#ffcf9a" scale={[7, 5, 1]} position={[-6, 2.4, 3]} />
        <Lightformer form="rect" intensity={0.5} color="#ffe0bb" scale={[7, 5, 1]} position={[6, 2.4, 1]} />
      </>
    )
  }

  if (env === 'night') {
    return (
      <>
        {/* очень тёмное синеватое небо */}
        <Lightformer
          form="rect"
          intensity={0.5}
          color="#243040"
          scale={[16, 16, 1]}
          position={[0, 6, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
        {/* два тёплых акцента — «лампы» */}
        <Lightformer form="circle" intensity={3.4} color="#ffb35c" scale={[2.2, 2.2, 1]} position={[-3.4, 3.4, 3.2]} />
        <Lightformer form="circle" intensity={2.2} color="#ffb35c" scale={[1.6, 1.6, 1]} position={[3.8, 2.8, -2.4]} />
        <Lightformer form="rect" intensity={0.12} color="#101822" scale={[16, 16, 1]} position={[0, -3, 0]} rotation={[Math.PI / 2, 0, 0]} />
      </>
    )
  }

  /*
   * studio (по умолчанию) — НЕЙТРАЛЬНЫЙ пресет.
   * Прежде правый заполняющий был тёплым (#ffe4c4), и вместе с тёплым солнцем
   * и коричневой «землёй» hemisphere он тащил всю сцену в оранжевый пересвет.
   * Теперь тепло даёт только солнце, а заполнение — чуть холоднее нейтрали:
   * так дерево остаётся деревом, а белые фасады не желтеют.
   */
  return (
    <>
      {/* большой мягкий верхний свет — основа мебельного рендера */}
      <Lightformer
        form="rect"
        intensity={2}
        color="#ffffff"
        scale={[10, 10, 1]}
        position={[0, 6, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      {/* заполняющие: оба слегка холодные, левый заметнее — рисунок остаётся у солнца */}
      <Lightformer form="rect" intensity={0.85} color="#dbe6f5" scale={[7, 6, 1]} position={[-7, 2.8, 2.5]} />
      <Lightformer form="rect" intensity={0.6} color="#e9eef6" scale={[7, 6, 1]} position={[7, 2.8, 1.5]} />
      {/* контровые сзади: широкий по центру + два узких по углам —
          именно они рисуют светлую кромку и отрывают стеллаж от стены */}
      <Lightformer form="rect" intensity={3} color="#eef4ff" scale={[2.4, 8, 1]} position={[0, 3.4, -7]} />
      <Lightformer form="rect" intensity={1.6} color="#e4ecfa" scale={[1, 6, 1]} position={[-4.6, 3, -6.2]} />
      <Lightformer form="rect" intensity={1.6} color="#e4ecfa" scale={[1, 6, 1]} position={[4.6, 3, -6.2]} />
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Параметры реальных источников
// ────────────────────────────────────────────────────────────────────────────

interface SunSpec {
  intensity: number
  color: string
  /** общая подсветка: чем меньше, тем «живее» тени */
  ambient: number
  sky: string
  ground: string
  hemi: number
  /** контровой сзади-слева: отделяет силуэт от стены */
  rim: number
  rimColor: string
  contact: number
  contactBlur: number
}

/**
 * Баланс всех пресетов: ambient держим низким (0.05…0.15) — он не рисует, а
 * только не даёт теням провалиться в чёрное; цвет из окружения приносит
 * hemisphere; рисунок — солнце; объём — контровой.
 *
 * «Земля» hemisphere у studio нарочно нейтрально-серая: коричневая (#4a4038)
 * работала как рефлекс от терракотового пола и желтила всё снизу.
 */
const SUN: Record<EnvKind, SunSpec> = {
  studio: {
    intensity: 1.35,
    color: '#fff6e8',
    ambient: 0.12,
    sky: '#e6edf7',
    ground: '#43464c',
    hemi: 0.3,
    rim: 0.9,
    rimColor: '#dde8ff',
    contact: 0.42,
    contactBlur: 2.9,
  },
  loft: {
    intensity: 2.1,
    color: '#ffe2bd',
    ambient: 0.13,
    sky: '#ccd8ea',
    ground: '#3b3e44',
    hemi: 0.28,
    rim: 0.65,
    rimColor: '#cfe0ff',
    contact: 0.48,
    contactBlur: 2.6,
  },
  warm: {
    intensity: 1.55,
    color: '#ffe8cd',
    ambient: 0.14,
    sky: '#ece7de',
    ground: '#46433d',
    hemi: 0.3,
    rim: 0.55,
    rimColor: '#ffeede',
    contact: 0.44,
    contactBlur: 3.1,
  },
  night: {
    intensity: 0.45,
    color: '#a8c4ff',
    ambient: 0.05,
    sky: '#1c2634',
    ground: '#0d1016',
    hemi: 0.35,
    rim: 0.75,
    rimColor: '#86a9ff',
    contact: 0.58,
    contactBlur: 2.2,
  },
}

const SHADOW_MAP: Record<Quality, number> = { low: 512, medium: 1024, high: 2048, ultra: 4096 }

/**
 * Радиус размытия тени В ТЕКСЕЛЯХ карты (three 0.185, PCFShadowMap: пять
 * выборок по диску Фогеля со смещением shadowRadius × texelSize).
 * PCFSoftShadowMap в 0.185 удалён, поэтому мягкость даёт ТОЛЬКО radius.
 *
 * Тень-камера охватывает 12 м, значит текселя: low 23.4 мм, medium 11.7,
 * high 5.9, ultra 2.9. Числа ниже дают полутень примерно 30…47 мм на всех
 * уровнях — softbox, а не точечная лампа. Выше поднимать нельзя: выборок
 * всего пять, и большой радиус превращается в заметный дизеринг.
 */
const SHADOW_RADIUS: Record<Quality, number> = { low: 2, medium: 3, high: 5, ultra: 8 }

/**
 * Возвращает рендереру autoClear перед запеканием контактных теней.
 *
 * Библиотека postprocessing в EffectComposer.setRenderer ставит
 * renderer.autoClear = false — она сама управляет очисткой своих буферов.
 * Но drei ContactShadows печёт тень обычным gl.render() в собственную
 * текстуру и рассчитывает, что та очистится сама. С выключенным autoClear
 * очистки нет, и каждый кадр дорисовывается ПОВЕРХ предыдущего: при
 * перетаскивании мебели на полу оставался накопленный след, как от мокрой
 * швабры, который пропадал только при отпускании (там текстура пересоздаётся).
 *
 * Возвращать значение обратно не нужно: обёртка @react-three/postprocessing
 * перед каждым своим кадром сама выставляет autoClear в своё значение и
 * восстанавливает прежнее после рендера.
 *
 * Компонент обязан стоять в дереве ДО <ContactShadows>: колбэки useFrame
 * с одним приоритетом выполняются в порядке подписки, а она идёт по порядку
 * монтирования соседей.
 */
function AutoClearGuard() {
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    if (!gl.autoClear) gl.autoClear = true
  })
  return null
}

export function Lighting() {
  const env = useAppStore((s) => s.view.env)
  const quality = useAppStore((s) => s.view.quality)
  const dragging = useAppStore((s) => s.drag !== null)
  /** план и фасад — чертёж, объёмная светотень там только мешает */
  const flat = useAppStore((s) => s.view.mode !== '3d')

  /**
   * Подпись «где что стоит»: её изменение перерисовывает контактные тени.
   * Live-позиции драга сюда НЕ входят — во время драга тени и так идут
   * в реальном времени, а хэш иначе дёргался бы каждый кадр.
   */
  const sig = useAppStore((s) => {
    let out = ''
    for (const u of s.project.units) {
      if (u.hidden) continue
      const o = outerSize(u.frame)
      out += `${Math.round(u.pos.x)}_${Math.round(u.pos.z)}_${Math.round(u.rotY * 64)}_${o.x}_${o.y}_${o.z};`
    }
    return out
  })

  const spec = SUN[env]
  const sunRef = useRef<THREE.DirectionalLight>(null)

  // изменения shadow-camera-* требуют ручного пересчёта проекции
  useLayoutEffect(() => {
    const l = sunRef.current
    if (!l) return
    l.shadow.camera.updateProjectionMatrix()
    l.shadow.needsUpdate = true
  }, [quality, env])

  /**
   * Догоняющий кадр контактных теней. Первый кадр после ре-рендера может
   * поймать сцену, где детали ещё не смонтировались (Suspense), поэтому через
   * ~450 мс делаем ещё один проход. Ре-рендер сам сбрасывает счётчик frames
   * внутри ContactShadows — remount (key) не нужен, он бы пересоздавал FBO.
   */
  const [encore, setEncore] = useState(0)
  useEffect(() => {
    if (dragging) return
    const t = setTimeout(() => setEncore((n) => n + 1), 450)
    return () => clearTimeout(t)
  }, [sig, dragging, quality, env])
  void encore

  return (
    <>
      {/* локальная env-карта; key — чтобы пресет пересобирался целиком */}
      <Environment key={env} resolution={256} frames={1} background={false}>
        <EnvRig env={env} />
      </Environment>

      {/* солнце: единственный источник теней. key — пересоздать shadow map под качество */}
      <directionalLight
        key={`sun-${quality}`}
        ref={sunRef}
        castShadow={!flat}
        position={[4.5, 7.5, 3.5]}
        intensity={spec.intensity}
        color={spec.color}
        shadow-mapSize={[SHADOW_MAP[quality], SHADOW_MAP[quality]]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={SHADOW_RADIUS[quality]}
      />

      {/*
        Контровой: сзади-слева, ниже и слабее солнца, теней не бросает.
        Его работа — светлая кромка по боковине и верху корпуса. Без него
        тёмный стеллаж сливается со стеной, и кадр становится плоским.
      */}
      <directionalLight
        position={[-5, 4.5, -6.5]}
        intensity={spec.rim}
        color={spec.rimColor}
      />

      <ambientLight intensity={spec.ambient} />
      <hemisphereLight args={[spec.sky, spec.ground, spec.hemi]} />

      {/*
        Мягкий контакт с полом — то, что «сажает» мебель на пол.
        В плане и фасаде отключён: там сверху лежит чертёж, и тень
        просвечивает сквозь него грязными пятнами на полу.
      */}
      {!flat && <AutoClearGuard />}
      {!flat && (
        <ContactShadows
          /*
           * key ОБЯЗАТЕЛЕН. drei печёт тень в render target и останавливается,
           * когда внутренний счётчик дойдёт до frames. Счётчик — обычная
           * переменная в теле компонента, но полагаться на ре-рендер нельзя:
           * без перемонтирования на полу оставались отпечатки мебели там,
           * где она стояла раньше. Пересоздание FBO происходит только на
           * реальную смену сцены (отпустили мебель, добавили, изменили размер),
           * то есть редко.
           */
          key={sig}
          position={[0, 0.002, 0]}
          opacity={spec.contact}
          scale={16}
          blur={spec.contactBlur}
          far={3}
          resolution={quality === 'low' ? 256 : quality === 'ultra' ? 2048 : 1024}
          // холодная тень вместо чистого чёрного: «лужа» под мебелью тогда
          // читается как затенение, а не как дыра в полу
          color="#0e1013"
          // 2 кадра, а не 1: первый может поймать сцену до resolve Suspense
          frames={dragging ? Infinity : 2}
        />
      )}
    </>
  )
}
