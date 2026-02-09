import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f0f0f',
          '50': '#1a1a1a',
          '100': '#252525',
          '200': '#333333'
        }
      }
    }
  },
  plugins: []
} satisfies Config
