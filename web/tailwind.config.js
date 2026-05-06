/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  '#f0f5fa',
          100: '#dae6f0',
          200: '#b3cce0',
          300: '#7fa8c8',
          400: '#4d83b0',
          500: '#2c6394',
          600: '#1f4e78',
          700: '#163d5e',
          800: '#102d46',
          900: '#0a1d2e',
          950: '#06121d',
        },
        teal: {
          50:  '#effbf9',
          100: '#d6f4ed',
          200: '#aee9dc',
          300: '#7dd9c8',
          400: '#4cc4af',
          500: '#2ca896',
          600: '#1a5f7a',
          700: '#164e63',
          800: '#143f51',
          900: '#123444',
        },
        gold: {
          50:  '#fcf8eb',
          100: '#f7eec8',
          200: '#efdb8d',
          300: '#e5c358',
          400: '#dcae34',
          500: '#d4af37',
          600: '#b08321',
          700: '#8c641f',
          800: '#735021',
          900: '#624322',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
