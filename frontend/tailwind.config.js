/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#2563eb',
          secondary: '#059669',
          bg: '#f6f7f9',
          border: '#e5e7eb',
        },
      },
      boxShadow: {
        card: '0 1px 1px rgba(15, 23, 42, 0.02), 0 1px 2px rgba(15, 23, 42, 0.02)',
      },
    },
  },
  plugins: [],
};
