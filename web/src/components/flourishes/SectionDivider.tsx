type Props = { className?: string };

export function SectionDivider({ className }: Props) {
  return (
    <svg
      viewBox="0 0 120 6"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      <path
        d="M2 3 Q 14 1, 26 3 Q 38 5, 50 3 Q 62 1, 74 3 Q 86 5, 98 3 Q 110 1, 118 3"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
