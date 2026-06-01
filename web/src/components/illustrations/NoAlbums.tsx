type Props = { className?: string };

export function NoAlbums({ className }: Props) {
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
      {/* Back frame (tilted) */}
      <g transform="rotate(-8 60 50)">
        <rect x="24" y="26" width="46" height="36" rx="2" opacity="0.55" />
        <rect x="29" y="31" width="36" height="26" rx="1" opacity="0.55" />
      </g>
      {/* Middle frame */}
      <g transform="rotate(4 60 50)">
        <rect x="36" y="30" width="48" height="38" rx="2" opacity="0.8" />
        <rect x="41" y="35" width="38" height="28" rx="1" opacity="0.8" />
      </g>
      {/* Front frame */}
      <rect x="44" y="40" width="50" height="42" rx="2" />
      <rect x="50" y="46" width="38" height="30" rx="1" />
      {/* Plus mark */}
      <path d="M69 56 L 69 66 M 64 61 L 74 61" />
    </svg>
  );
}
