import { nativeAdapter } from './native.ts';
import type { ProviderAdapter } from '../types.ts';

export { nativeAdapter };

export const adapters: Record<string, ProviderAdapter> = {
  native: nativeAdapter,
};
