// Icons come from Lucide (lucide.dev), plus one drawn in Lucide's style where Lucide has none
// (Elliptical). Names here are the short aliases used across the app.
import {
  ArrowDown,
  Utensils,
  TrendingDown,
  TrendingUp,
  Zap,
  Recycle,
  Droplet,
  Clock,
  CalendarDays,
  LayoutList,
  StickyNote,
  Bluetooth,
  MessageCircle,
  Brain,
  Sparkles,
  Quote,
  Heart,
  Scale,
  Hourglass,
  Activity,
  ArrowLeftRight,
  ArrowUp,
  Calendar,
  ChartLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  Dumbbell,
  Footprints,
  Bike,
  WavesLadder,
  WavesHorizontal,
  Mountain,
  PersonStanding,
  HeartPulse,
  Ellipsis,
  FileText,
  Flame,
  Folder,
  History,
  Link2,
  List,
  Medal,
  Minus,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  SquarePlay,
  Target,
  Timer,
  Trash2,
  Unlink2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-preact'

/**
 * Elliptical trainer, drawn to Lucide's grid (24 x 24, 2px round strokes): flywheel, pedal
 * rail, swinging handle arm and upright. No icon library has one.
 */
function EllipticalIcon({ size = 24, strokeWidth = 2, class: cls }: { size?: number | string; strokeWidth?: number | string; class?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" class={cls} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 21h18" />
      <circle cx="17" cy="15.5" r="2.5" />
      <path d="M17 15.5 5 18" />
      <path d="m17.5 13-1.5-10" />
      <path d="M16 3h-3" />
      <path d="M8 17.4 11 5" />
      <path d="M9.5 5H12" />
      <path d="M18.5 18v3" />
    </svg>
  )
}
const Elliptical = EllipticalIcon as unknown as LucideIcon

const ICONS = {
  plus: Plus,
  check: Check,
  x: X,
  down: ChevronDown,
  minimize: ChevronDown,
  left: ChevronLeft,
  right: ChevronRight,
  more: Ellipsis,
  search: Search,
  timer: Timer,
  trash: Trash2,
  pencil: Pencil,
  play: Play,
  video: SquarePlay,
  dumbbell: Dumbbell,
  footprints: Footprints,
  elliptical: Elliptical,
  bike: Bike,
  swim: WavesLadder,
  row: WavesHorizontal,
  mountain: Mountain,
  stretch: PersonStanding,
  cardio: HeartPulse,
  history: History,
  list: List,
  sliders: SlidersHorizontal,
  up: ArrowUp,
  downArrow: ArrowDown,
  swap: ArrowLeftRight,
  link: Link2,
  unlink: Unlink2,
  note: FileText,
  copy: Copy,
  medal: Medal,
  flame: Flame,
  cloud: Cloud,
  download: Download,
  upload: Upload,
  folder: Folder,
  chart: ChartLine,
  calendar: Calendar,
  minus: Minus,
  target: Target,
  bluetooth: Bluetooth,
  coach: MessageCircle,
  brain: Brain,
  sparkles: Sparkles,
  quote: Quote,
  heart: Heart,
  scale: Scale,
  fast: Hourglass,
  activity: Activity,
  utensils: Utensils,
  trendDown: TrendingDown,
  trendUp: TrendingUp,
  zap: Zap,
  recycle: Recycle,
  droplet: Droplet,
  clock: Clock,
  calendarDays: CalendarDays,
  layoutList: LayoutList,
  sticky: StickyNote,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 20, class: cls, stroke = 2 }: { name: IconName | string; size?: number; class?: string; stroke?: number }) {
  const C = ICONS[name as IconName]
  if (!C) return null
  return <C class={'icon ' + (cls || '')} size={size} strokeWidth={stroke} aria-hidden="true" fill={name === 'play' ? 'currentColor' : 'none'} />
}
