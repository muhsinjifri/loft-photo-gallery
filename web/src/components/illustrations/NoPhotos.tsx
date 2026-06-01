type Props = { className?: string };

export function NoPhotos({ className }: Props) {
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
      {/* Camera body */}
      <path d="M20 36 Q 18 33, 22 33 L 38 33 L 44 26 L 76 26 L 82 33 L 98 33 Q 102 33, 100 36 L 100 76 Q 100 80, 96 80 L 24 80 Q 20 80, 20 76 Z" />
      {/* Lens outer */}
      <circle cx="60" cy="56" r="16" />
      {/* Lens inner */}
      <circle cx="60" cy="56" r="9" />
      {/* Reflection */}
      <path d="M53 50 Q 56 47, 61 49" />
      {/* Viewfinder dot */}
      <circle cx="90" cy="40" r="1.6" fill="currentColor" />
      {/* Sparkle */}
      <path d="M14 22 L 14 28 M 11 25 L 17 25" className="text-highlight" stroke="currentColor" />
    </svg>
  );
}
