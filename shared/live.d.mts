type AnyCanvas = HTMLCanvasElement | OffscreenCanvas
export function liveHm(ms: number): string
export function fastLiveText(
  f: { start: number; goal: number; label?: string; tz?: string; locale?: string },
  now?: number,
): { title: string; body: string; hours: number; progress: number; done: boolean }
export function liveBadgeCanvas(text: string | number): AnyCanvas | null
export function liveIconCanvas(text: string | number, label: string, color: string, progress?: number): AnyCanvas | null
export function liveDataUrl(c: AnyCanvas | null): Promise<string | null>
export const LIVE_FAST_COLOR: string
