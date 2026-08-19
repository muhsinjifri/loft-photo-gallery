import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

/**
 * Colours resolve to CSS variables (see styles.css), so light and dark are the
 * same token graph with different values rather than two sets of classes. The
 * `<alpha-value>` placeholder keeps Tailwind's `/opacity` modifiers working
 * through the indirection.
 *
 * Token NAMES are inherited from the earlier paper-and-ink design and still
 * hold: `paper` is the surface, `ink` is what's marked on it, and the scale runs
 * the same direction in both themes. Renaming them would churn forty files for
 * no user-visible gain.
 */
const c = (v: string) => `rgb(var(${v}) / <alpha-value>)`;
/** Secondary label colours carry a fixed alpha, the way Apple defines them. */
const label = (v: string, a: string) => `rgb(var(${v}) / var(${a}))`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: c("--room"),
          canvas: c("--canvas"),
          deep: c("--well"),
          tint: c("--raised"),
          thumb: c("--thumb"),
          warm: c("--warm"),
        },
        ink: {
          DEFAULT: c("--ink"),
          soft: label("--ink-soft", "--ink-soft-a"),
          fade: label("--ink-fade", "--ink-fade-a"),
          trace: label("--ink-trace", "--ink-trace-a"),
        },
        accent: {
          DEFAULT: c("--accent"),
          warm: c("--accent-warm"),
          deep: c("--accent-deep"),
          wash: "rgb(var(--accent) / 0.15)",
          on: c("--on-accent"),
        },
        // Alias of the accent. One accent, used only for selection, is the
        // platform's whole colour discipline — a second chromatic voice in the
        // chrome would compete with the photographs.
        highlight: {
          DEFAULT: c("--accent"),
          warm: c("--accent-warm"),
          deep: c("--accent-deep"),
          wash: "rgb(var(--accent) / 0.15)",
        },
        line: {
          DEFAULT: "rgb(var(--line) / var(--line-a))",
          strong: "rgb(var(--line) / var(--line-strong-a))",
        },
        scrim: c("--scrim"),
      },
      fontFamily: {
        // All three roles are the system stack. On Apple platforms SF Pro Text
        // and SF Pro Display are one optical family that the OS switches at
        // ~20pt, so "display" here is a size decision, not a different font.
        serif: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"Inter"',
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
        display: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"Inter"',
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
        mono: ['"SF Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // Apple's type ramp, with the optical tracking each size expects.
        caption: ["11px", { lineHeight: "13px", letterSpacing: "0em" }],
        footnote: ["13px", { lineHeight: "18px", letterSpacing: "-0.008em" }],
        body: ["15px", { lineHeight: "20px", letterSpacing: "-0.01em" }],
        title3: ["20px", { lineHeight: "25px", letterSpacing: "-0.02em" }],
        title2: ["22px", { lineHeight: "28px", letterSpacing: "-0.022em" }],
        title1: ["28px", { lineHeight: "34px", letterSpacing: "-0.026em" }],
        large: ["34px", { lineHeight: "41px", letterSpacing: "-0.032em" }],
      },
      boxShadow: {
        soft: "0 0.5px 1px rgb(0 0 0 / calc(var(--shadow-a) * 0.5)), 0 2px 6px rgb(0 0 0 / calc(var(--shadow-a) * 0.35))",
        lift: "0 4px 12px rgb(0 0 0 / calc(var(--shadow-a) * 0.5)), 0 16px 40px rgb(0 0 0 / calc(var(--shadow-a) * 0.45))",
        press: "inset 0 1px 0 rgb(255 255 255 / 0.06)",
        photo: "0 30px 90px rgb(0 0 0 / 0.65)",
        // The raised thumb in a segmented control.
        thumb:
          "0 0.5px 1px rgb(0 0 0 / calc(var(--shadow-a) * 0.6)), 0 2px 5px rgb(0 0 0 / calc(var(--shadow-a) * 0.4))",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        lg: "14px",
        xl: "20px",
        pill: "999px",
      },
      transitionTimingFunction: {
        // Apple's standard ease. Quick out, gentle settle.
        paper: "cubic-bezier(.32,.72,0,1)",
      },
      keyframes: {
        tileIn: {
          from: { opacity: "0", transform: "scale(.985)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        liftIn: {
          from: { opacity: "0", transform: "translateY(6px) scale(.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.75" },
        },
      },
      animation: {
        tileIn: "tileIn .34s cubic-bezier(.32,.72,0,1) both",
        fadeIn: "fadeIn .2s ease",
        liftIn: "liftIn .26s cubic-bezier(.32,.72,0,1)",
        shimmer: "shimmer 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [
    forms,
    typography,
    plugin(({ addComponents, theme }) => {
      addComponents({
        // The standard bordered control: a soft-filled capsule, not an outline.
        ".btn": {
          fontFamily: theme("fontFamily.serif")?.toString() ?? "sans-serif",
          fontWeight: "500",
          fontSize: "13px",
          letterSpacing: "-0.01em",
          background: "rgb(var(--ink) / 0.07)",
          color: "rgb(var(--ink))",
          border: "0.5px solid rgb(var(--line) / var(--line-a))",
          padding: "6px 13px",
          borderRadius: "8px",
          cursor: "pointer",
          transition: "background .15s ease, transform .1s ease, opacity .15s ease",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          "&:hover": { background: "rgb(var(--ink) / 0.12)" },
          "&:active": { background: "rgb(var(--ink) / 0.16)", transform: "scale(.97)" },
          "&:disabled": { opacity: "0.35", cursor: "not-allowed" },
          "&:disabled:hover": { background: "rgb(var(--ink) / 0.07)" },
        },
        ".btn-primary": {
          background: "rgb(var(--accent))",
          borderColor: "transparent",
          color: "rgb(var(--on-accent))",
          fontWeight: "500",
          boxShadow: theme("boxShadow.soft"),
          "&:hover": { background: "rgb(var(--accent-warm))" },
          "&:active": { background: "rgb(var(--accent-deep))", transform: "scale(.97)" },
          "&:disabled:hover": { background: "rgb(var(--accent))" },
        },
        ".btn-ghost": {
          background: "transparent",
          borderColor: "transparent",
          color: "rgb(var(--accent))",
          padding: "6px 10px",
          "&:hover": { background: "rgb(var(--accent) / 0.12)" },
        },
        ".btn-icon": {
          width: "28px",
          height: "28px",
          padding: "0",
          borderRadius: "7px",
          background: "transparent",
          borderColor: "transparent",
          color: "rgb(var(--ink) / 0.75)",
          "&:hover": { background: "rgb(var(--ink) / 0.1)", color: "rgb(var(--ink))" },
        },
        ".tile": {
          position: "relative",
          background: "rgb(var(--well))",
          // Photos keeps grid thumbnails nearly square-cornered; the picture is
          // the shape, the frame isn't.
          borderRadius: "4px",
          overflow: "hidden",
          cursor: "pointer",
          transition: "transform .28s cubic-bezier(.32,.72,0,1), box-shadow .28s ease",
          "&:hover": { transform: "scale(1.012)", boxShadow: theme("boxShadow.lift") },
          "&:active": { transform: "scale(.995)" },
        },
        // A grouped-settings panel, as in System Settings.
        ".paper-card": {
          background: "rgb(var(--raised))",
          border: "0.5px solid rgb(var(--line) / var(--line-a))",
          borderRadius: theme("borderRadius.DEFAULT"),
          boxShadow: theme("boxShadow.soft"),
          padding: "16px 18px",
        },
        ".label": {
          fontSize: "11px",
          fontWeight: "590",
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          color: "rgb(var(--ink-fade) / var(--ink-fade-a))",
        },
      });
    }),
  ],
} satisfies Config;
