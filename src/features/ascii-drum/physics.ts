import { clamp } from '../../lib/math'
import { IMPLODE, WAVE_LIFE } from './constants'
import type { Sim } from './sim'

export type Wave = { x: number; y: number; born: number }

export type Pointer = {
  x: number
  y: number
  px: number
  py: number
  active: boolean
}

function springScale(waves: Wave[], now: number): number {
  let scale = 1
  for (const wave of waves) {
    const age = now - wave.born
    if (age < 120) scale = Math.min(scale, 0.18)
    else if (age < 550) scale = Math.min(scale, 0.55)
  }
  return scale
}

export function stepPhysics(
  active: Sim,
  pointer: Pointer,
  waves: Wave[],
  now: number,
  dt: number,
  settled: boolean,
): { waves: Wave[]; settled: boolean } {
  const { n, homeX, homeY, ox, oy, vx, vy, scramble, width } = active
  if (settled && !pointer.active && waves.length === 0) {
    pointer.px = pointer.x
    pointer.py = pointer.y
    return { waves, settled }
  }

  const liveWaves = waves.filter(wave => now - wave.born < WAVE_LIFE)
  const spring = 92 * springScale(liveWaves, now)
  const damping = Math.exp(-14 * dt)
  const pointerRadius = Math.min(150, width * 0.22)
  const pointerSpeed = Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py)
  const pointerDx = pointer.x - pointer.px
  const pointerDy = pointer.y - pointer.py
  const waveReach = Math.min(width * 0.42, 320)

  let maxMotion = 0

  for (let i = 0; i < n; i++) {
    const posX = homeX[i]! + ox[i]!
    const posY = homeY[i]! + oy[i]!
    let ax = -ox[i]! * spring
    let ay = -oy[i]! * spring
    let scrambleDrive = 0

    if (pointer.active) {
      const dx = posX - pointer.x
      const dy = posY - pointer.y
      const distance = Math.hypot(dx, dy)
      if (distance < pointerRadius && distance > 0.001) {
        const proximity = 1 - distance / pointerRadius
        const force = proximity * proximity * Math.exp(proximity * 2.1)
        const push = force * (380 + pointerSpeed * 6)
        ax += (dx / distance) * push + pointerDx * proximity * 24
        ay += (dy / distance) * push + pointerDy * proximity * 24
      }
    }

    for (const wave of liveWaves) {
      const age = (now - wave.born) / 1000
      const dx = posX - wave.x
      const dy = posY - wave.y
      const distance = Math.hypot(dx, dy)
      if (distance < 0.001) continue

      const nx = dx / distance
      const ny = dy / distance

      if (age < IMPLODE) {
        if (distance < waveReach) {
          const proximity = 1 - distance / waveReach
          const pull = proximity * proximity * Math.exp(proximity * 3.2) * (1 - age / IMPLODE)
          const suck = pull * 2640
          ax -= nx * suck
          ay -= ny * suck
          scrambleDrive = Math.max(scrambleDrive, pull * 1.4)
        }
      } else {
        const blastAge = age - IMPLODE
        const radius = blastAge * width * 0.78
        const band = 72
        const delta = Math.abs(distance - radius)
        const ring = Math.max(0, 1 - delta / band)
        const wake = Math.max(0, 1 - delta / (band * 1.8))
        if ((ring > 0 || wake > 0) && blastAge < 1.15) {
          const fade = 1 - blastAge / 1.15
          const impulse = (ring * ring * 1.35 + wake * 0.45) * fade * 1.1
          const knock = impulse * 1680
          const swirl = impulse * 520
          ax += nx * knock - ny * swirl
          ay += ny * knock + nx * swirl
          scrambleDrive = Math.max(scrambleDrive, impulse * 1.15)
        }
      }
    }

    vx[i] = (vx[i]! + ax * dt) * damping
    vy[i] = (vy[i]! + ay * dt) * damping
    ox[i] = ox[i]! + vx[i]! * dt
    oy[i] = oy[i]! + vy[i]! * dt

    const target = clamp(scrambleDrive * 1.35, 0, 1)
    const settleRate = target > scramble[i]! ? 28 : 7
    scramble[i] = scramble[i]! + (target - scramble[i]!) * (1 - Math.exp(-settleRate * dt))

    maxMotion = Math.max(
      maxMotion,
      Math.abs(ox[i]!),
      Math.abs(oy[i]!),
      Math.abs(vx[i]!),
      Math.abs(vy[i]!),
      scramble[i]! * 20,
    )
  }

  pointer.px = pointer.x
  pointer.py = pointer.y

  return {
    waves: liveWaves,
    settled: maxMotion < 0.08 && liveWaves.length === 0 && !pointer.active,
  }
}
