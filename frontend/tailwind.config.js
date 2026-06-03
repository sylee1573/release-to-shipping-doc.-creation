/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  'oklch(0.97 0.010 210)',
          100: 'oklch(0.93 0.020 210)',
          400: 'oklch(0.60 0.150 210)',
          500: 'oklch(0.52 0.170 210)',
          600: 'oklch(0.42 0.190 210)',
          700: 'oklch(0.32 0.170 210)',
        },
      },
    },
  },
  plugins: [],
}
