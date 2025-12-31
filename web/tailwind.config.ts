import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme - Nebula Glass
        nebula: {
          bg: {
            primary: '#0a0a0f',
            secondary: '#12121a',
            tertiary: '#1a1a24',
          },
          surface: {
            DEFAULT: 'rgba(255, 255, 255, 0.03)',
            hover: 'rgba(255, 255, 255, 0.06)',
            active: 'rgba(255, 255, 255, 0.09)',
          },
          border: {
            DEFAULT: 'rgba(255, 255, 255, 0.08)',
            strong: 'rgba(255, 255, 255, 0.15)',
          },
          text: {
            primary: 'rgba(255, 255, 255, 0.95)',
            secondary: 'rgba(255, 255, 255, 0.65)',
            muted: 'rgba(255, 255, 255, 0.4)',
          },
        },
        // Light theme - Pearl Glass
        pearl: {
          bg: {
            primary: '#f8f9fc',
            secondary: '#ffffff',
            tertiary: '#f1f3f9',
          },
          surface: {
            DEFAULT: 'rgba(0, 0, 0, 0.02)',
            hover: 'rgba(0, 0, 0, 0.04)',
            active: 'rgba(0, 0, 0, 0.06)',
          },
          border: {
            DEFAULT: 'rgba(0, 0, 0, 0.06)',
            strong: 'rgba(0, 0, 0, 0.12)',
          },
          text: {
            primary: 'rgba(0, 0, 0, 0.9)',
            secondary: 'rgba(0, 0, 0, 0.6)',
            muted: 'rgba(0, 0, 0, 0.4)',
          },
        },
        // Accent colors
        accent: {
          DEFAULT: '#00f5a0',
          hover: '#00d68f',
          secondary: '#7c3aed',
        },
        danger: '#ef4444',
        warning: '#f59e0b',
        success: '#22c55e',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
        'slide-left': 'slide-left 0.2s ease-out',
        'slide-right': 'slide-right 0.2s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'spin-slow': 'spin 2s linear infinite',
        'typing': 'typing 1s steps(1) infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-left': {
          '0%': { transform: 'translateX(10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-right': {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'typing': {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
