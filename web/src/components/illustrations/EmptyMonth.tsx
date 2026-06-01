type Props = { className?: string };

export function EmptyMonth({ className }: Props) {
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
      {/* Calendar binding loops */}
      <path d="M40 14 L 40 26" />
      <path d="M58 14 L 58 26" />
      <path d="M76 14 L 76 26" />
      {/* Calendar page */}
      <path d="M28 22 L 92 22 L 92 76 Q 92 78, 90 78 L 30 78 Q 28 78, 28 76 Z" />
      {/* Torn edge along bottom (jagged) */}
      <path d="M28 78 Q 32 84, 36 78 Q 42 84, 48 78 Q 54 84, 60 78 Q 66 84, 72 78 Q 78 84, 84 78 Q 88 84, 92 78" />
      {/* Calendar header line */}
      <path d="M28 32 L 92 32" />
      {/* Date dots (faded) */}
      <circle cx="40" cy="46" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="52" cy="46" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="64" cy="46" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="76" cy="46" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="40" cy="58" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="52" cy="58" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="64" cy="58" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="76" cy="58" r="1" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
