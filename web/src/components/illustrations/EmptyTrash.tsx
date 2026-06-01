type Props = { className?: string };

export function EmptyTrash({ className }: Props) {
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
      {/* Bin lid */}
      <path d="M32 30 L 88 30" />
      {/* Bin handle */}
      <path d="M50 30 L 50 24 Q 50 22, 52 22 L 68 22 Q 70 22, 70 24 L 70 30" />
      {/* Bin body */}
      <path d="M36 30 L 40 84 Q 40 86, 42 86 L 78 86 Q 80 86, 80 84 L 84 30" />
      {/* Vertical bin lines */}
      <path d="M50 40 L 50 76" opacity="0.5" />
      <path d="M60 40 L 60 76" opacity="0.5" />
      <path d="M70 40 L 70 76" opacity="0.5" />
      {/* Dust motes floating */}
      <circle cx="22" cy="46" r="1.2" fill="currentColor" opacity="0.6" />
      <circle cx="100" cy="38" r="1" fill="currentColor" opacity="0.6" />
      <circle cx="96" cy="58" r="1.4" fill="currentColor" opacity="0.5" />
      <circle cx="18" cy="62" r="1" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
