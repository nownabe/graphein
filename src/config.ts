import type { Database } from "./infrastructure/db/client";
import type { CacheStore } from "./infrastructure/cache/store";
import type { SessionHelpers } from "./application/auth/session";
import type { UserService } from "./application/users/service";
import type { TaskService } from "./application/tasks/service";
import type { SnippetService } from "./application/snippets/service";
import type { KudosService } from "./application/kudos/service";
import type { UsergroupService } from "./application/usergroups/service";
import type { SettingsService } from "./application/settings/service";
import type { ApiKeyService } from "./application/api-keys/service";
import type { OAuthService } from "./application/oauth/service";
import type { MrkdwnOptions } from "./adapters/slack/mrkdwn";
import type { HonoReceiver } from "./adapters/slack/receiver";

export type BuildMrkdwnLabels = (texts: (string | null | undefined)[]) => Promise<MrkdwnOptions>;
export type ResolveChannelName = (channelId: string) => Promise<string | undefined>;

export interface HonoAppConfig {
  db: Database;
  cache: CacheStore;
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
