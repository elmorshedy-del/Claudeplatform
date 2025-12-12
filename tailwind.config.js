/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'claude-orange': '#E07A3A',
        'claude-tan': '#E6D5B8',
        'dark': {
          '900': '#0D0D0D',
          '800': '#1A1A1A',
          '700': '#262626',
          '600': '#333333',
          '500': '#4D4D4D',
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
