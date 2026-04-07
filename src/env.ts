function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const env = {
  PORT: Number(optionalEnv("PORT", "3000")),
  DATABASE_URL: requireEnv("DATABASE_URL"),

  SLACK_BOT_TOKEN: requireEnv("SLACK_BOT_TOKEN"),
  SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN ?? "",
  SLACK_SOCKET_MODE: process.env.SLACK_SOCKET_MODE === "true",
  SLACK_SIGNING_SECRET: requireEnv("SLACK_SIGNING_SECRET"),
  SLACK_CLIENT_ID: requireEnv("SLACK_CLIENT_ID"),
  SLACK_CLIENT_SECRET: requireEnv("SLACK_CLIENT_SECRET"),

  GEMINI_API_KEY: requireEnv("GEMINI_API_KEY"),

  JWT_SECRET: requireEnv("JWT_SECRET"),
  BASE_URL: requireEnv("BASE_URL"),
} as const;
