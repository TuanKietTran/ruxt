import { clerkAdapter } from './clerk.ts';
import { cloudflareAdapter } from './cloudflare.ts';
import { denoAdapter } from './deno.ts';
import { nativeAdapter } from './native.ts';
import type { ProviderAdapter } from '../types.ts';

export { clerkAdapter, cloudflareAdapter, denoAdapter, nativeAdapter };

export const adapters: Record<string, ProviderAdapter> = {
  native: nativeAdapter,
  clerk: clerkAdapter,
  cloudflare: cloudflareAdapter,
  deno: denoAdapter,
};
