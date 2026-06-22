/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        clinic: {
          ink: "#0D3642",
          muted: "#667085",
          line: "#DCE8E6",
          surface: "#F6FAF9",
          brand: "#0D766E",
          accent: "#2563EB",
          warning: "#D97706",
          danger: "#DC2626"
        }
      },
      boxShadow: {
        soft: "0 14px 34px rgba(13, 54, 66, 0.07)"
      }
    }
  },
  plugins: []
};
