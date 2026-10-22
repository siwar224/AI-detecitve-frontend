/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#08111f',
        panel: '#0e1b2d',
        line: '#1b2b42',
        mint: '#48e0b3',
        amber: '#f6bd60',
        danger: '#ff7a90',
      },
      boxShadow: {
        panel: '0 18px 60px rgba(0, 0, 0, 0.18)',
      },
    },
  },
  plugins: [],
}
