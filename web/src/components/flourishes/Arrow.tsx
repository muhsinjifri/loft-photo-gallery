type Props = { className?: string };

export function Arrow({ className }: Props) {
  return (
    <svg
      viewBox="0 0 60 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <path
        d="M3 14 Q 14 4, 30 12 Q 44 18, 54 10"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M50 6 L 54 10 L 50 14"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
