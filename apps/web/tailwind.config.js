/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Type scale matching the CSS vars in globals.css. These augment
      // (don't replace) Tailwind's defaults so existing `text-2xl`,
      // `text-sm`, etc. keep working.
      fontSize: {
        display: ['var(--text-display)', { lineHeight: 'var(--text-display-lh)', letterSpacing: '-0.02em' }],
        h1: ['var(--text-h1)', { lineHeight: 'var(--text-h1-lh)', letterSpacing: '-0.015em' }],
        h2: ['var(--text-h2)', { lineHeight: 'var(--text-h2-lh)', letterSpacing: '-0.01em' }],
        h3: ['var(--text-h3)', { lineHeight: 'var(--text-h3-lh)', letterSpacing: '-0.005em' }],
        body: ['var(--text-body)', { lineHeight: 'var(--text-body-lh)' }],
        caption: ['var(--text-caption)', { lineHeight: 'var(--text-caption-lh)' }],
      },
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
        overlay: 'var(--shadow-overlay)',
        glow: 'var(--shadow-glow)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
      transitionTimingFunction: {
        'out-expo': 'var(--ease-out)',
        smooth: 'var(--ease-in-out)',
        spring: 'var(--ease-spring)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-from-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer var(--duration-shimmer) linear infinite',
        'fade-in': 'fade-in var(--duration-base) var(--ease-out) both',
        'fade-up': 'fade-up var(--duration-slow) var(--ease-out) both',
        'slide-down': 'slide-down var(--duration-base) var(--ease-out) both',
        'slide-from-right': 'slide-from-right var(--duration-slow) var(--ease-out) both',
        'scale-in': 'scale-in var(--duration-base) var(--ease-spring) both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
