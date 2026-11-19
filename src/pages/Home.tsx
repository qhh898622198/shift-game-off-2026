/**
 * Home.tsx — the page that hosts the game canvas.
 *
 * React only owns the DOM shell (canvas + HUD overlay); everything inside the
 * render loop lives under src/game/ and never re-renders React. Start the game
 * in an effect and tear it down in the cleanup so React StrictMode's
 * mount → unmount → mount cycle does not leak a second renderer or loop.
 *
 * 触屏设备渲染虚拟按键（游戏专属手绘 SVG 图标），通过合成键盘事件接入输入层。
 * 右侧只留三个：跳 / 切换（大眼睛，游戏 LOGO）/ 冲（速度线）。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { startGame, stopGame } from '@/game/boot'

function press(code: string, down: boolean) {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }))
}

/** 描边风格图标 */
function StrokeIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
      strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

/** 切换世界：游戏 LOGO 大眼睛（填充风格） */
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M2 12 Q12 4.5 22 12 Q12 19.5 2 12 Z" fill="currentColor" />
      <circle cx="12" cy="12" r="3.2" fill="#140a10" />
      <circle cx="13.2" cy="10.8" r="1" fill="rgba(255,255,255,0.85)" />
    </svg>
  )
}

const ICONS: Record<string, ReactNode> = {
  left: <path d="M14.5 5.5 L8 12 L14.5 18.5" />,
  right: <path d="M9.5 5.5 L16 12 L9.5 18.5" />,
  // 跳：起跳箭头 + 地面线
  jump: (<>
    <path d="M6 11 L12 4.5 L18 11" />
    <path d="M5 19 H19" />
  </>),
  // 冲：箭头 + 速度线
  dash: (<>
    <path d="M12 5 L19 12 L12 19" />
    <path d="M3 8 H8.5" />
    <path d="M4.5 12 H10" />
    <path d="M3 16 H8" />
  </>),
  pause: (<>
    <path d="M9 6 V18" />
    <path d="M15 6 V18" />
  </>),
}

function TouchButton({ code, icon, label, className }: { code: string; icon: ReactNode; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`touch-btn ${className ?? ''}`}
      onPointerDown={(e) => { e.preventDefault(); press(code, true) }}
      onPointerUp={() => press(code, false)}
      onPointerCancel={() => press(code, false)}
      onPointerLeave={() => press(code, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {icon}
    </button>
  )
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isTouch] = useState(
    () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window,
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    startGame(canvas)
    return () => stopGame()
  }, [])

  return (
    <div id="game-root">
      <canvas id="game-canvas" ref={canvasRef} />
      <div id="ui-overlay">
        {isTouch && (
          <>
            <div className="touch-cluster touch-left">
              <TouchButton code="KeyA" label="左移" icon={<StrokeIcon>{ICONS.left}</StrokeIcon>} />
              <TouchButton code="KeyD" label="右移" icon={<StrokeIcon>{ICONS.right}</StrokeIcon>} />
            </div>
            <div className="touch-cluster touch-right">
              <TouchButton code="ShiftLeft" label="切换世界" icon={<EyeIcon />} className="touch-btn-shift" />
              <TouchButton code="KeyW" label="跳跃" icon={<StrokeIcon>{ICONS.jump}</StrokeIcon>} />
              <TouchButton code="KeyJ" label="冲刺" icon={<StrokeIcon>{ICONS.dash}</StrokeIcon>} className="touch-btn-dash" />
            </div>
            <TouchButton code="Escape" label="暂停" icon={<StrokeIcon>{ICONS.pause}</StrokeIcon>} className="touch-pause" />
          </>
        )}
      </div>
    </div>
  )
}
