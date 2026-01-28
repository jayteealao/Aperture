import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // HUD Color System - Deep Onyx Base
        hud: {
          // Backgrounds
          black: '#050505',      // Deep Onyx - Primary background
          dark: '#0A0A0A',       // Slightly lighter background
          darker: '#080808',     // Card backgrounds

          // Grid and UI lines
          gray: '#1A1A1A',       // Dark Graphite - Grid, borders, containers
          'gray-light': '#262626', // Lighter grid lines

          // Text colors
          text: '#808080',       // Slate Gray - Secondary text
          'text-muted': '#666666', // Muted text
          white: '#E5E5E5',      // Stark White - Primary text
          'white-bright': '#FFFFFF', // Bright white for emphasis
          silver: '#B3B3B3',     // Muted Silver - Technical details

          // Primary accent
          accent: '#FF451A',     // Cyber Red-Orange
          'accent-bright': '#FF5722', // Brighter accent
          'accent-dark': '#CC3914',   // Darker accent
          'accent-glow': 'rgba(255, 69, 26, 0.3)', // Glow effect

          // Status colors
          success: '#00FF88',    // Terminal green
          warning: '#FFB800',    // Amber warning
          error: '#FF3333',      // Error red
          info: '#00BFFF',       // Info blue
        },
      },
      fontFamily: {
        sans: ['Rajdhani', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],  // 10px - Micro data
        '3xs': ['0.5rem', { lineHeight: '0.75rem' }],     // 8px - Tiny labels
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderWidth: {
        '1': '1px',
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
        'slide-left': 'slide-left 0.2s ease-out',
        'slide-right': 'slide-right 0.2s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scan': 'scan 2s linear infinite',
        'typing': 'typing 1s steps(1) infinite',
        'blink': 'blink 1s step-end infinite',
        'data-stream': 'data-stream 0.5s linear infinite',
        'radar-sweep': 'radar-sweep 4s linear infinite',
        'corner-pulse': 'corner-pulse 2s ease-in-out infinite',
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
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 4px rgba(255, 69, 26, 0.4)' },
          '50%': { boxShadow: '0 0 12px rgba(255, 69, 26, 0.8)' },
        },
        'scan': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'typing': {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'data-stream': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-20px)' },
        },
        'radar-sweep': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'corner-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(to right, #1A1A1A 1px, transparent 1px), linear-gradient(to bottom, #1A1A1A 1px, transparent 1px)',
        'grid-dots': 'radial-gradient(circle at center, #1A1A1A 1px, transparent 1px)',
        'scan-line': 'linear-gradient(90deg, transparent, rgba(255, 69, 26, 0.1), transparent)',
        'vignette': 'radial-gradient(ellipse at center, transparent 0%, rgba(5, 5, 5, 0.8) 100%)',
      },
      boxShadow: {
        'glow': '0 0 10px rgba(255, 69, 26, 0.3)',
        'glow-lg': '0 0 20px rgba(255, 69, 26, 0.4)',
        'glow-success': '0 0 10px rgba(0, 255, 136, 0.3)',
        'inner-glow': 'inset 0 0 20px rgba(255, 69, 26, 0.1)',
      },
    },
  },
  plugins: [],
} satisfies Config
