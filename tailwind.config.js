module.exports = {
  content: ['./*.{html,jsx}', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif']
      },
      colors: {
        dark: {
          base: '#09090B',
          surface: '#18181B',
          border: '#3F3F46'
        },
        gold: {
          DEFAULT: '#FFD700',
          accent: '#D4AF37',
          tint: 'rgba(255, 215, 0, 0.10)'
        }
      }
    }
  }
};
