/** @type {import('tailwindcss').Config} */
// Session 28.5 — A+C UI rebuild: remapped cream/ink palette to the new
// "Construction Native + India Builder Premium" tokens, kept existing class
// names so 5k+ usages across feature files don't churn.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      screens: {
        xs: "480px",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Sora", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        cream: {
          DEFAULT: "#FAFAF8",
          50: "#FFFFFF",
          100: "#FAFAF8",
          200: "#F4F2EC",
        },
        ink: {
          DEFAULT: "#0F1115",
          900: "#0F1115",
          800: "#1B1D23",
          700: "#2A2520",
          600: "#3F3A33",
          500: "#5A5248",
          400: "#8E887C",
        },
        // New A+C tokens — addressable directly in JSX too.
        safety: {
          50:  "#FFF1E6",
          100: "#FFE0C7",
          400: "#FF8A3D",
          500: "#FF6B1A",
          600: "#E55A0E",
        },
      },
      letterSpacing: {
        editorial: "-0.005em",  // dramatically toned down vs old 0.18em
      },
      borderRadius: {
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "24px",
      },
      boxShadow: {
        card:        "0 1px 3px rgba(15,17,21,.06), 0 1px 2px rgba(15,17,21,.04)",
        hover:       "0 4px 12px rgba(15,17,21,.08)",
        cta:         "0 4px 14px rgba(255,107,26,.25)",
        // Legacy editorial — kept so existing className references still resolve,
        // now mapped to the new construction-native shadow values.
        editorial:        "0 1px 3px rgba(15,17,21,.06), 0 1px 2px rgba(15,17,21,.04)",
        "editorial-hover":"0 4px 12px rgba(15,17,21,.08)",
        "editorial-deep": "0 8px 24px rgba(15,17,21,.10)",
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        ".scrollbar-hide": {
          "-ms-overflow-style": "none",
          "scrollbar-width": "none",
          "&::-webkit-scrollbar": { display: "none" },
        },
      });
    },
  ],
};
