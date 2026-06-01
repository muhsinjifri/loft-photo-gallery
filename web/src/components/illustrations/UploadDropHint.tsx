type Props = { className?: string };

export function UploadDropHint({ className }: Props) {
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
      {/* Envelope */}
      <path d="M22 38 L 60 22 L 98 38 L 98 78 Q 98 80, 96 80 L 24 80 Q 22 80, 22 78 Z" />
      <path d="M22 38 L 60 60 L 98 38" />
      {/* Photo edge peeking out */}
      <rect x="40" y="14" width="40" height="34" rx="2" fill="var(--c-paper, #F4EFE6)" />
      <path d="M44 36 L 52 28 L 60 32 L 70 22 L 76 30" />
      <circle cx="68" cy="22" r="2" fill="currentColor" opacity="0.6" />
      {/* Down arrow */}
      <path d="M60 82 L 60 92 M 56 88 L 60 92 L 64 88" />
    </svg>
  );
}
