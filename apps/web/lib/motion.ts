'use client';

import { useEffect, useState } from 'react';

// Motion utilities. The CSS in `globals.css` already zeroes durations
// when prefers-reduced-motion is on, so the only thing we need on the
// JS side is a hook for components that gate behavior (like staggered
// reveals or opt-in entrance animations) and a small constant table
// for components that pass durations to libraries (Radix, sonner).

export const MOTION_FAST = 150;
export const MOTION_BASE = 200;
export const MOTION_SLOW = 300;
export const MOTION_SHIMMER = 1600;

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Returns true when the user has system reduced-motion enabled. Defaults
 * to false on the server so SSR never strips animations from the
 * initial paint -- the CSS media query takes over once the user-agent
 * style sheet evaluates.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Build a stagger delay for the n-th item in a list. Returns 0ms when
 * reduced motion is set. Caller passes the index plus the current
 * `useReducedMotion()` value so this stays a pure function and can be
 * used inline in `style={{ animationDelay: ... }}`.
 */
export function staggerDelay(index: number, reduced: boolean, stepMs = 60): string {
  if (reduced) return '0ms';
  return `${index * stepMs}ms`;
}
