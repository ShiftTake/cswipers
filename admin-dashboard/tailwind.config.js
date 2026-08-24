/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#0B0E14',
        surface: '#161B22',
        line: '#30363D',
        gold: '#FFD700',
        emerald: '#34D399'
      }
    }
  },
  plugins: []
};
