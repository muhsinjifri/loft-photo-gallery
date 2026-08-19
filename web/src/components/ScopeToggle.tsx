import { motion } from "framer-motion";
import type { Scope } from "@loft/shared";
import { useScope } from "../scope";
import { useUser } from "../user";

const OPTIONS: { value: Scope; label: string }[] = [
  { value: "mine", label: "Mine" },
  { value: "ours", label: "Ours" },
];

/**
 * Lives in the page header rather than the sidebar: the sidebar is `hidden
 * md:flex`, and this is a primary lens that has to stay reachable on a phone.
 */
export function ScopeToggle() {
  const { scope, setScope } = useScope();
  const { partner } = useUser();
  if (!partner) return null;

  return (
    <div
      role="group"
      aria-label="Whose pictures"
      className="relative inline-flex items-center rounded-pill border border-line bg-paper-tint p-0.5"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setScope(o.value)}
          aria-pressed={scope === o.value}
          className={`relative px-3 py-1 rounded-pill font-serif text-[13px] transition-colors ${
            scope === o.value ? "text-ink" : "text-ink-fade hover:text-ink-soft"
          }`}
        >
          {scope === o.value && (
            <motion.span
              layoutId="scopePill"
              className="absolute inset-0 -z-10 rounded-pill bg-accent/[0.12]"
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}
