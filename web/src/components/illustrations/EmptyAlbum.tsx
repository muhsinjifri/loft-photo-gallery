type Props = { className?: string };

export function EmptyAlbum({ className }: Props) {
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
      {/* Easel left leg */}
      <path d="M28 90 L 44 18" />
      {/* Easel right leg */}
      <path d="M92 90 L 76 18" />
      {/* Easel cross brace */}
      <path d="M38 60 L 82 60" />
      {/* Picture frame outer */}
      <rect x="38" y="22" width="44" height="40" rx="2" />
      {/* Inner mat */}
      <rect x="44" y="28" width="32" height="28" rx="1" />
      {/* Mountain line inside (faded) */}
      <path d="M46 50 L 54 40 L 62 46 L 70 36 L 74 42" opacity="0.5" />
      <circle cx="68" cy="34" r="1.8" opacity="0.5" />
    </svg>
  );
}
