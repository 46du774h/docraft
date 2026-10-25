/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./popup.html', './workspace.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        ink: { 50: '#111827', 100: '#1f2937', 200: '#374151', 300: '#4b5563', 400: '#9ca3af', 500: '#aab4c4', 600: '#cbd5e1', 700: '#e5e7eb', 800: '#f3f4f6', 900: '#ffffff' },
        brand: { 50: '#eef4ff', 100: '#dbe7ff', 500: '#2f5fd0', 600: '#244fb5', 700: '#1c3f93' },
      },
    },
  },
  plugins: [],
};
