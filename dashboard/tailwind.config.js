/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        theme: {
          bg: '#F3EAE1',
          surface: '#F4D2BB',
          dark: '#5C3425'
        }
      },
      fontFamily: {
        sans: ['"Playfair Display"', 'serif'],
        display: ['"Playfair Display"', 'serif'],
      },
    },
  },
  plugins: [],
}
