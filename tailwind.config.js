/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: {
          50: '#f7f1e1',
          100: '#ebe2cd',
          200: '#cdc2a8',
          300: '#9f957b'
        },
        ink: {
          600: '#3a332d',
          700: '#2a2521',
          800: '#1c1814',
          900: '#13100d',
          950: '#0a0806'
        },
        amber: {
          300: '#ecc277',
          400: '#dcb05a',
          500: '#c99a3d',
          600: '#a87e2e'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif']
      }
    }
  },
  plugins: []
};
