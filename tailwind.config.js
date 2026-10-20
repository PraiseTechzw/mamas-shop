/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#5B43D6', deep: '#38239B', soft: '#8B78F0', tint: '#EEEAFB' },
        gold: '#FFC83D',
        canvas: '#F7F7FC',
        surface: '#FFFFFF',
        ink: '#202033',
        muted: '#74758A',
        line: '#E6E7EF',
        success: '#16865D',
        'success-tint': '#E7F5EF',
        warning: '#D97706',
        'warning-tint': '#FFF5DC',
        danger: '#DC3545',
        info: '#2474E5',
      },
      fontFamily: {
        display: ['Poppins-SemiBold'],
        body: ['Inter-Regular'],
        medium: ['Inter-Medium'],
        semibold: ['Inter-SemiBold'],
        bold: ['Inter-Bold'],
      },
    },
  },
  plugins: [],
};
