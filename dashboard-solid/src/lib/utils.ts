import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Merge Tailwind CSS classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Clamp a value between min and max
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Random number between min and max
export function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// Randomize a value with deviation
export function randomize(
  base: number,
  minDeviation: number = 0.01,
  maxDeviation: number = 0.05
): number {
  const deviation = randomBetween(minDeviation, maxDeviation);
  const sign = Math.random() > 0.5 ? 1 : -1;
  return base + base * deviation * sign;
}

// Debounce function
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | undefined;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  };
}

// Throttle function
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

// Generate unique ID
export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}
