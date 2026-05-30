export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-brand"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size * 0.56}
        height={size * 0.56}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
        <path d="M9.5 20v-5.5h5V20" />
      </svg>
    </span>
  );
}
