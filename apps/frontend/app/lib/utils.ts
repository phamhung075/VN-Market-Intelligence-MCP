/**
 * shadcn/ui standard utility — merges Tailwind class names safely.
 * Required by all shadcn/ui components. Do not remove.
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
