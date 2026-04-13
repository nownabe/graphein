import type { SessionHelpers } from "./auth/session";
import type { UserService } from "./users/service";
import type { TaskService } from "./tasks/service";
import type { MrkdwnOptions } from "./slack/mrkdwn";
import type { HonoReceiver } from "./slack/receiver";

export type BuildMrkdwnLabels = (texts: (string | null | undefined)[]) => Promise<MrkdwnOptions>;

export interface HonoAppConfig {
  devMode: boolean;
  baseUrl: string;
  slackClientId: string;
  slackClientSecret: string;
  slackTeamId: string;
  session: SessionHelpers;
  userService: UserService;
  taskService: TaskService;
  buildMrkdwnLabels: BuildMrkdwnLabels;
  slackReceiver?: HonoReceiver;
}
