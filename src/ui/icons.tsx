/** Inline SVG icons (24×24, stroke = currentColor). */
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const PlayIcon = () => (
  <svg {...base}>
    <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...base}>
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const ResetIcon = () => (
  <svg {...base}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </svg>
);

export const FaceIcon = () => (
  <svg {...base}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="9" cy="10.5" r="1.2" fill="currentColor" />
    <circle cx="15" cy="10.5" r="1.2" fill="currentColor" />
    <path d="M9 15c1.6 1.4 4.4 1.4 6 0" />
  </svg>
);

export const ViewIcon = () => (
  <svg {...base}>
    <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

export const LogoWave = () => (
  <svg {...base} width={24} height={24} strokeWidth={2.6}>
    <path d="M3 12c2.2-7 4.3-7 6 0s3.8 7 6 0 3.8-7 6 0" />
  </svg>
);
