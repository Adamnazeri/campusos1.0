import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

/* Set ikon CampusOS: dilukis sendiri pada grid 24px. Ciri-cirinya: garis 2px, hujung persegi, sudut tajam atau serong (chamfer), tiada lengkung penuh. */
function base(props: IconProps) {
  return {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
    'aria-hidden': true,
    ...props,
  }
}

const P = (d: string) => (p: IconProps) => (
  <svg {...base(p)}><path d={d} /></svg>
)

export const Icon = {
  grid: (p: IconProps) => (
    <svg {...base(p)}><path d="M4 4H10V10H4ZM14 4H20V10H14ZM4 14H10V20H4ZM14 14H20V20H14Z" /></svg>
  ),
  users: (p: IconProps) => (
    <svg {...base(p)}><circle cx="9" cy="8" r="3" /><path d="M3 20V17L6 14H12L15 17V20" /><circle cx="17.5" cy="8.5" r="2.5" /><path d="M17 14H18L21 17V20" /></svg>
  ),
  user: (p: IconProps) => (
    <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21V18L8 14H16L20 18V21" /></svg>
  ),
  book: P('M5 3H19V21H5ZM9 3V21M12 8H16M12 12H16'),
  calendar: P('M3 5H21V21H3ZM3 10H21M8 3V7M16 3V7M7 14H9M11 14H13M15 14H17M7 18H9M11 18H13'),
  check: P('M4 12L9 17L20 6'),
  checkCircle: P('M8 3H16L21 8V16L16 21H8L3 16V8ZM8 12L11 15L16 9'),
  gauge: P('M4 18A8 8 0 1 1 20 18M12 17L16 10M12 4V6M4.5 9L6 10M19.5 9L18 10'),
  door: P('M6 3H18V21H6ZM15 12H15.01M3 21H21'),
  clipboard: P('M6 5H18V21H6ZM9 3H15V7H9ZM9 12H15M9 16H13'),
  award: (p: IconProps) => (
    <svg {...base(p)}><circle cx="12" cy="9" r="6" /><path d="M8 14L6 21L12 18L18 21L16 14" /></svg>
  ),
  plane: P('M3 11L21 3L14 21L11 13ZM11 13L21 3'),
  megaphone: P('M3 10V14H7L16 19V5L7 10ZM19 9V15M7 14L8 19H11'),
  check2: P('M4 4H20V20H4ZM8 12L11 15L16 9'),
  chart: P('M4 21V10H8V21M10 21V4H14V21M16 21V14H20V21M2 21H22'),
  file: P('M6 3H14L19 8V21H6ZM14 3V8H19M9 13H16M9 17H16'),
  settings: P('M4 7H14M18 7H20M14 5H18V9H14ZM4 17H6M10 17H20M6 15H10V19H6Z'),
  card: P('M3 5H21V19H3ZM3 10H21M6 15H10'),
  search: P('M10 4H10A6 6 0 1 1 10 16A6 6 0 1 1 10 4ZM15 15L21 21'),
  bell: P('M6 17V10A6 6 0 0 1 18 10V17M4 17H20M10 21H14'),
  chevronDown: P('M6 9L12 15L18 9'),
  chevronRight: P('M9 6L15 12L9 18'),
  chevronLeft: P('M15 6L9 12L15 18'),
  plus: P('M12 5V19M5 12H19'),
  x: P('M6 6L18 18M18 6L6 18'),
  sun: (p: IconProps) => (
    <svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2V4M12 20V22M2 12H4M20 12H22M5 5L6.5 6.5M17.5 17.5L19 19M5 19L6.5 17.5M17.5 6.5L19 5" /></svg>
  ),
  moon: P('M20 14A8 8 0 0 1 10 4A8 8 0 1 0 20 14Z'),
  clock: (p: IconProps) => (
    <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7V12L16 14" /></svg>
  ),
  mapPin: (p: IconProps) => (
    <svg {...base(p)}><path d="M12 22L5 13V9A7 7 0 0 1 19 9V13Z" /><circle cx="12" cy="9" r="2.5" /></svg>
  ),
  home: P('M3 11L12 3L21 11M5 10V21H19V10M10 21V14H14V21'),
  more: (p: IconProps) => (
    <svg {...base(p)}><path d="M4 11H7V14H4ZM10.5 11H13.5V14H10.5ZM17 11H20V14H17Z" fill="currentColor" stroke="none" /></svg>
  ),
  filter: P('M3 5H21L14 13V20L10 18V13Z'),
  download: P('M12 4V15M7 11L12 16L17 11M4 20H20'),
  alert: P('M12 3L22 20H2ZM12 9V14M12 17H12.01'),
  logout: P('M10 4H4V20H10M9 12H21M16 7L21 12L16 17'),
  building: P('M5 21V3H15V21M15 9H19V21M3 21H21M8 7H12M8 11H12M8 15H12'),
  /* Logo: papan jadual 3x3 hijau papan dengan sudut serong; satu sel kuning kapur = "sekarang". Warna tetap supaya serasi dalam mod cerah dan gelap. */
  logo: (p: IconProps) => (
    <svg width={28} height={28} viewBox="0 0 32 32" fill="none" aria-hidden="true" {...p}>
      <path d="M0 0H26L32 6V32H6L0 26Z" fill="#123b2d" />
      <path d="M0.5 0.5H25.8L31.5 6.2V31.5H6.2L0.5 25.8Z" stroke="#f6f3e8" strokeOpacity="0.25" />
      {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (
        <rect key={`${r}${c}`} x={6 + c * 7} y={6 + r * 7} width="5" height="5" fill={r === 1 && c === 2 ? '#f2d45c' : '#f6f3e8'} fillOpacity={r === 1 && c === 2 ? 1 : 0.55} />
      )))}
    </svg>
  ),
  dot: (p: IconProps) => (
    <svg {...base(p)} viewBox="0 0 12 12" width={10} height={10}><rect x="2" y="2" width="8" height="8" fill="currentColor" stroke="none" /></svg>
  ),
  arrowUp: P('M12 20V4M5 11L12 4L19 11'),
  arrowDown: P('M12 4V20M5 13L12 20L19 13'),
  command: P('M9 9H15V15H9ZM9 9V5H5V9ZM15 9V5H19V9ZM9 15V19H5V15ZM15 15V19H19V15Z'),
  inbox: P('M3 13V20H21V13M3 13L6 4H18L21 13M3 13H8L9 16H15L16 13H21'),
  link: P('M9 8H5V16H9M15 8H19V16H15M8 12H16'),
  copy: P('M8 8H20V20H8ZM16 8V4H4V16H8'),
  share: P('M12 3V15M7 8L12 3L17 8M5 12V21H19V12'),
}

export type IconName = keyof typeof Icon
