import { useEffect, useState } from "react";

const breakpoints: Array<[number, number]> = [
  [1024, 5], // >= lg
  [768, 4], //  >= md
  [640, 3], //  >= sm
];

function pick(width: number): number {
  for (const [min, cols] of breakpoints) {
    if (width >= min) return cols;
  }
  return 2;
}

export function useColumnCount(): number {
  const [cols, setCols] = useState(() =>
    typeof window === "undefined" ? 3 : pick(window.innerWidth),
  );
  useEffect(() => {
    const onResize = () => setCols(pick(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return cols;
}
