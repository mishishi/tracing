/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Consolas', 'monospace'],
      },
      colors: {
        accent: {
          DEFAULT: '#4f46e5',
          light: '#eef2ff',
          hover: '#4338ca',
        },
        surface: '#ffffff',
      },
      borderRadius: {
        bento: '20px',
      },
    },
  },
  plugins: [],
};
