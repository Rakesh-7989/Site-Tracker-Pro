/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Fraunces", "Iowan Old Style", "Georgia", "serif"],
      },
      colors: {
        cream: {
          DEFAULT: "#fdfbf6",
          50: "#fefdf9",
          100: "#fdfbf6",
          200: "#f5f1e8",
        },
        ink: {
          DEFAULT: "#1c1917",
          900: "#1c1917",
          800: "#292524",
          700: "#44403c",
          600: "#57534e",
          500: "#78716c",
          400: "#a8a29e",
        },
      },
      letterSpacing: {
        editorial: "-0.015em",
      },
      boxShadow: {
        editorial: "0 1px 2px rgba(28,25,23,.04), 0 4px 16px rgba(28,25,23,.06)",
        "editorial-hover": "0 4px 12px rgba(28,25,23,.06), 0 12px 32px rgba(28,25,23,.10)",
        "editorial-deep": "0 8px 24px rgba(28,25,23,.08), 0 24px 60px rgba(28,25,23,.14)",
      },
    },
  },
  plugins: [],
};
