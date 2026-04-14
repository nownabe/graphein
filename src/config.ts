import type { SessionHelpers } from "./auth/session";
import type { UserService } from "./users/service";
import type { TaskService } from "./tasks/service";
import type { SnippetService } from "./snippets/service";
import type { SettingsService } from "./settings/service";
import type { MrkdwnOptions } from "./slack/mrkdwn";
import type { HonoReceiver } from "./slack/receiver";

export type BuildMrkdwnLabels = (texts: (string | null | undefined)[]) => Promise<MrkdwnOptions>;
export type ResolveChannelName = (channelId: string) => Promise<string | undefined>;

export interface HonoAppConfig {
  devMode: boolean;
  baseUrl: string;
  slackClientId: string;
  slackClientSecret: string;
  slackTeamId: string;
  session: SessionHelpers;
  userService: UserService;
  taskService: TaskService;
  snippetService: SnippetService;
  settingsService: SettingsService;
  buildMrkdwnLabels: BuildMrkdwnLabels;
  resolveChannelName: ResolveChannelName;
  slackReceiver?: HonoReceiver;
  timezone: string;
}
