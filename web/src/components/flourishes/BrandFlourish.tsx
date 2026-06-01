type Props = { className?: string };

export function BrandFlourish({ className }: Props) {
  return (
    <svg
      viewBox="0 0 100 12"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      <path
        d="M2 7 Q 18 2, 38 6 Q 58 11, 78 6 Q 88 4, 96 8"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
