import type { Repos } from "@infra/types";

export interface DeployStrategy {
   readonly label: string;
   readonly importPath: string;
   readonly weight: number;
   predicate(): boolean | Promise<boolean>;
   buildRepos(): Repos;
}

const REGISTRY_KEY = "__infra_deploy_registry__";
if (!((globalThis as any)[REGISTRY_KEY])) {
   (globalThis as any)[REGISTRY_KEY] = [];
}
const REGISTRY: DeployStrategy[] = (globalThis as any)[REGISTRY_KEY];

export function createDeployStrategy(config: DeployStrategy): DeployStrategy {
   REGISTRY.push(config);
   return config;
}

export async function resolveStrategy(): Promise<DeployStrategy> {
   const sorted = [...REGISTRY].sort((a, b) => b.weight - a.weight);
   for (const strategy of sorted) {
      if (await strategy.predicate()) return strategy;
   }
   throw new Error("No deploy strategy matched");
}
