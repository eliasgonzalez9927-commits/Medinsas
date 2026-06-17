/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        clinic: {
          ink: "#172026",
          muted: "#5E6A72",
          line: "#D8E1E7",
          surface: "#F7FAFC",
          brand: "#0F766E",
          accent: "#2563EB",
          warning: "#D97706",
          danger: "#DC2626"
        }
      },
      boxShadow: {
        soft: "0 18px 40px rgba(23, 32, 38, 0.08)"
      }
    }
  },
  plugins: []
};
