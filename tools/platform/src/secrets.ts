export function checkEnv(names: string[], environment?: string): Array<{ environment?: string; name: string; present: boolean }> {
  return names.map(name => ({
    environment,
    name,
    present: process.env[name] !== undefined && process.env[name] !== '',
  }));
}
