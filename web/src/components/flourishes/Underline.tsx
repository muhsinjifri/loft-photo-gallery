type Props = { className?: string };

export function Underline({ className }: Props) {
  return (
    <svg
      viewBox="0 0 100 5"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      <path
        d="M2 2.5 Q 12 0.8, 22 2.5 T 42 2.5 T 62 2.5 T 82 2.5 T 98 2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
