/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        discord: {
          blurple: "#5865f2",
          dark0: "#202225",
          dark1: "#2b2d31",
          dark2: "#2f3136",
          dark3: "#313338",
          dark4: "#36393e",
          dark5: "#1e1f22",
          text: "#dbdee1",
          muted: "#949ba4"
        }
      },
      boxShadow: {
        glow: "0 0 0 2px #5865f2"
      }
    }
  },
  plugins: []
};
