import { z } from 'zod';
import { config } from 'dotenv';

config();

const EnvSchema = z.object({
  GOOGLE_CLIENT_ID:     z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI:  z.string().default('http://localhost:5173/api/auth/google/callback'),
  AZURE_AI_ENDPOINT:    z.string().default(''),
  AZURE_AI_KEY:         z.string().default(''),
  DEEPSEEK_MODEL:       z.string().default('DeepSeek-V3.2'),
  GROK_MODEL:           z.string().default('grok-4-fast-reasoning'),
  DB_PATH:              z.string().default('./data/spent.db'),
  SESSION_SECRET:       z.string().default('dev_secret_change_in_production'),
  PORT:                 z.coerce.number().default(5173),
});

export const env = EnvSchema.parse(process.env);

export function assertConfigured() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
  }
  if (!env.AZURE_AI_ENDPOINT || !env.AZURE_AI_KEY) {
    throw new Error('AZURE_AI_ENDPOINT and AZURE_AI_KEY must be set in .env');
  }
}
