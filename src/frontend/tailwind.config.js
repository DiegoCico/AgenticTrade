export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aws: {
          orange: '#FF9900',
          'orange-dark': '#ec8d00',
          navy: '#232f3e',
          'navy-light': '#364150',
          'navy-dark': '#1b2635',
          blue: '#00A1C9',
          green: '#1D8102',
          red: '#D13212',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      boxShadow: {
        'aws': '0 2px 8px rgba(0, 0, 0, 0.15)',
        'aws-lg': '0 4px 16px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
};
