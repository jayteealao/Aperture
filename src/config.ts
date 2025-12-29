import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  APERTURE_API_TOKEN: z.string().min(1, "APERTURE_API_TOKEN is mandatory"),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default('0.0.0.0'),
  CLAUDE_CODE_EXECUTABLE: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  MAX_SESSIONS: z.coerce.number().default(50),
  SESSION_TIMEOUT_MS: z.coerce.number().default(10 * 60 * 1000), // 10 minutes
  MAX_MESSAGE_SIZE: z.coerce.number().default(256 * 1024), // 256KB
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }
  return result.data;
};

export const config = parseEnv();
