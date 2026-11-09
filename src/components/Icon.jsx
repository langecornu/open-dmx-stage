// Small inline icon set (original 24px stroke icons). Decorative: always aria-hidden.
const PATHS = {
  patch: 'M4 7h16M4 12h16M4 17h10M18 15v4M16 17h4',
  control: 'M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3zM9.5 19h5M10.5 21.5h3',
  scenes: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  chases: 'M7 5l12 7-12 7V5z',
  monitor: 'M3 12h4l3-8 4 16 3-8h4',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  stop: 'M7 7h10v10H7z',
  record: 'M12 7a5 5 0 100 10 5 5 0 000-10z',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  power: 'M12 3v9M7 6.5a7 7 0 108 0',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  sliders: 'M5 4v16M12 4v16M19 4v16M3 9h4M10 15h4M17 8h4',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
