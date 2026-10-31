import * as fs from 'fs';
import * as path from 'path';

export function getOpenRouterApiKey(customApiKey?: string): string {
  if (customApiKey && customApiKey.trim().length > 0) {
    return customApiKey.trim();
  }
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const match = fs.readFileSync(envPath, 'utf8').match(/^OPENROUTER_API_KEY=["']?([^"'\r\n]+)["']?/m);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch {}
  return (process.env.OPENROUTER_API_KEY || '').trim();
}
