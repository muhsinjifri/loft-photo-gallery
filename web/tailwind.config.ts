import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "#F4EFE6",
          deep: "#EDE5D6",
          tint: "#FAF5EC",
          warm: "#E8DFCB",
        },
        ink: {
          DEFAULT: "#2A2620",
          soft: "#4A413A",
          fade: "#8A7F71",
          trace: "#B5A893",
        },
        accent: {
          DEFAULT: "#6B8266",
          warm: "#84997E",
          deep: "#4F6649",
          wash: "rgba(107,130,102,0.10)",
        },
        highlight: {
          DEFAULT: "#C8964E",
          warm: "#D9AC65",
          deep: "#A57E38",
          wash: "rgba(200,150,78,0.10)",
        },
        line: {
          DEFAULT: "rgba(58,50,40,0.10)",
          strong: "rgba(58,50,40,0.22)",
        },
      },
      fontFamily: {
        serif: ['"Fraunces"', '"Iowan Old Style"', '"Hoefler Text"', "Georgia", "serif"],
        display: ['"Caveat"', '"Snell Roundhand"', "cursive"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(60,50,40,0.06), 0 4px 12px rgba(60,50,40,0.05)",
        lift: "0 4px 8px rgba(60,50,40,0.08), 0 14px 28px rgba(60,50,40,0.10)",
        press: "inset 0 1px 0 rgba(255,250,240,0.4)",
        photo: "0 30px 80px rgba(0,0,0,0.5)",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        lg: "14px",
        pill: "999px",
      },
      transitionTimingFunction: {
        paper: "cubic-bezier(.2,.7,.2,1)",
      },
      keyframes: {
        tileIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        liftIn: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        tileIn: "tileIn .5s cubic-bezier(.2,.7,.2,1) both",
        fadeIn: "fadeIn .2s ease",
        liftIn: "liftIn .25s cubic-bezier(.2,.7,.2,1)",
        shimmer: "shimmer 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [
    forms,
    typography,
    plugin(({ addComponents, theme }) => {
      addComponents({
        ".btn": {
          fontFamily: theme("fontFamily.serif")?.toString() ?? "serif",
          fontWeight: "500",
          background: "transparent",
          color: theme("colors.ink.DEFAULT"),
          border: `1px solid ${theme("colors.line.strong")}`,
          padding: "7px 14px",
          borderRadius: "999px",
          cursor: "pointer",
          transition:
            "background .18s ease, color .18s ease, border-color .18s ease, transform .12s ease, box-shadow .18s ease",
          letterSpacing: "0.01em",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          "&:hover": {
            background: theme("colors.paper.deep"),
            borderColor: theme("colors.ink.fade"),
          },
          "&:active": { transform: "translateY(1px)" },
          "&:disabled": { opacity: "0.5", cursor: "not-allowed" },
        },
        ".btn-primary": {
          background: theme("colors.accent.DEFAULT"),
          borderColor: theme("colors.accent.deep"),
          color: theme("colors.paper.tint"),
          boxShadow: `${theme("boxShadow.soft")}, ${theme("boxShadow.press")}`,
          "&:hover": {
            background: theme("colors.accent.warm"),
            borderColor: theme("colors.accent.deep"),
            color: theme("colors.paper.tint"),
          },
        },
        ".btn-ghost": {
          borderColor: "transparent",
          color: theme("colors.ink.soft"),
          padding: "6px 10px",
          "&:hover": {
            background: theme("colors.accent.wash"),
            color: theme("colors.accent.deep"),
            borderColor: "transparent",
          },
        },
        ".btn-icon": {
          width: "32px",
          height: "32px",
          padding: "0",
          fontSize: "16px",
          lineHeight: "1",
          borderRadius: "50%",
          color: theme("colors.ink.soft"),
          borderColor: theme("colors.line.DEFAULT"),
        },
        ".tile": {
          position: "relative",
          background: theme("colors.paper.deep"),
          borderRadius: theme("borderRadius.DEFAULT"),
          overflow: "hidden",
          cursor: "pointer",
          boxShadow: theme("boxShadow.soft"),
          transition:
            "transform .25s cubic-bezier(.2,.7,.2,1), box-shadow .25s ease",
          "&:hover": {
            transform: "translateY(-3px) rotate(-0.4deg)",
            boxShadow: theme("boxShadow.lift"),
          },
        },
        ".paper-card": {
          background: theme("colors.paper.tint"),
          border: `1px solid ${theme("colors.line.DEFAULT")}`,
          borderRadius: theme("borderRadius.lg"),
          boxShadow: theme("boxShadow.soft"),
          padding: "20px",
        },
      });
    }),
  ],
} satisfies Config;
