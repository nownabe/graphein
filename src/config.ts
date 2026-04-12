export interface AppConfig {
  devMode: boolean;
  databaseUrl: string;
  jwtSecret: string;
  baseUrl: string;
  slackClientId: string;
  slackClientSecret: string;
  slackTeamId: string;
  slackSigningSecret: string;
  slackBotToken: string;
  slackAppToken: string;
  slackSocketMode: boolean;
  geminiApiKey: string;
}
