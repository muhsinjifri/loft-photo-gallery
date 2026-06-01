type Props = { className?: string };

export function OfflineState({ className }: Props) {
  return (
    <svg
      viewBox="0 0 120 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Plug socket left */}
      <rect x="14" y="38" width="32" height="24" rx="3" />
      <circle cx="24" cy="50" r="1.6" fill="currentColor" />
      <circle cx="36" cy="50" r="1.6" fill="currentColor" />
      {/* Cable left */}
      <path d="M46 50 Q 54 50, 56 56" />
      {/* Plug right tips */}
      <path d="M82 50 L 74 50 M 80 44 L 80 56" />
      <path d="M86 44 L 86 56 M 86 50 L 92 50" />
      <rect x="92" y="44" width="14" height="12" rx="2" />
      {/* Cable right (curving away from disconnected plug) */}
      <path d="M74 50 Q 70 56, 64 60" />
      {/* Spark/disconnect marks */}
      <path d="M62 40 L 66 36 M 60 34 L 60 38 M 70 36 L 66 40" opacity="0.7" />
    </svg>
  );
}
