type Props = { className?: string };

export function Sparkle({ className }: Props) {
  return (
    <svg
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <path
        d="M8 1 L8 5 M8 11 L8 15 M1 8 L5 8 M11 8 L15 8 M3.5 3.5 L5.5 5.5 M10.5 10.5 L12.5 12.5 M12.5 3.5 L10.5 5.5 M5.5 10.5 L3.5 12.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    </svg>
  );
}
