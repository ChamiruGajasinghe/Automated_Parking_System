/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0f1c', 
        panel: '#111827',      
        accentGold: '#d4af37', 
        accentCrimson: '#991b1b', 
        textMain: '#e5e7eb',
      }
    },
  },
  plugins: [],
}