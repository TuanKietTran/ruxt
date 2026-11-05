import type { HealthResult, ProviderAdapter } from './types.ts';

export async function aggregateHealth(adapters: ProviderAdapter[]): Promise<HealthResult[]> {
  const results: HealthResult[] = [];
  for (const adapter of adapters) {
    try {
      results.push(await adapter.health());
    } catch (err) {
      results.push({ adapterId: adapter.id, status: 'down', detail: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
