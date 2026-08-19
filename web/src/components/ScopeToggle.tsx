import { motion } from "framer-motion";
import type { Scope } from "@loft/shared";
import { useScope } from "../scope";
import { useUser } from "../user";

const OPTIONS: { value: Scope; label: string }[] = [
  { value: "mine", label: "Mine" },
  { value: "ours", label: "Ours" },
];

/**
 * A platform segmented control: a sunken track with a single raised thumb that
 * slides between segments. Lives in the page header rather than the sidebar,
 * which is `hidden md:flex` — this is a primary lens and has to stay reachable
 * on a phone.
 */
export function ScopeToggle() {
  const { scope, setScope } = useScope();
  const { partner } = useUser();
  if (!partner) return null;

  return (
    <div role="group" aria-label="Whose pictures" className="segmented">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setScope(o.value)}
          aria-pressed={scope === o.value}
        >
          {scope === o.value && (
            <motion.span
              data-thumb
              layoutId="scopeThumb"
              className="absolute inset-0 rounded-[7px] bg-paper-thumb shadow-thumb"
              transition={{ type: "spring", stiffness: 520, damping: 42 }}
            />
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
