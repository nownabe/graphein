import type { Database } from "./db/client";
import type { SessionHelpers } from "./auth/session";
import type { UserService } from "./users/service";
import type { TaskService } from "./tasks/service";
import type { SnippetService } from "./snippets/service";
import type { KudosService } from "./kudos/service";
import type { UsergroupService } from "./usergroups/service";
import type { SettingsService } from "./settings/service";
import type { ApiKeyService } from "./api-keys/service";
import type { OAuthService } from "./oauth/service";
import type { MrkdwnOptions } from "./adapters/slack/mrkdwn";
import type { HonoReceiver } from "./adapters/slack/receiver";

export type BuildMrkdwnLabels = (texts: (string | null | undefined)[]) => Promise<MrkdwnOptions>;
export type ResolveChannelName = (channelId: string) => Promise<string | undefined>;

export interface HonoAppConfig {
  db: Database;
  devMode: boolean;
  baseUrl: string;
  slackClientId: string;
  slackClientSecret: string;
  slackTeamId: string;
  session: SessionHelpers;
  userService: UserService;
  taskService: TaskService;
  snippetService: SnippetService;
  usergroupService: UsergroupService;
  kudosService: KudosService;
  settingsService: SettingsService;
  apiKeyService: ApiKeyService;
  oauthService: OAuthService;
  jwtSecret: string;
  buildMrkdwnLabels: BuildMrkdwnLabels;
  resolveChannelName: ResolveChannelName;
  slackReceiver?: HonoReceiver;
  timezone: string;
}
