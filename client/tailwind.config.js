/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#040d1a',       // Deepest background
          navy: '#071b34',       // Primary card and container background from Logo
          card: '#0b2444',       // Card panels
          border: '#133966',     // Border lines
          blue: '#028090',       // Rich marine blue
          teal: '#00a896',       // Vibrant Teal from Logo
          emerald: '#00C49F',    // Bright flame green/cyan from Logo
          cyan: '#38bdf8',       // Light highlight
          ice: '#f0fdfa'         // Crisp background accent
        }
      }
    },
  },
  plugins: [],
}
