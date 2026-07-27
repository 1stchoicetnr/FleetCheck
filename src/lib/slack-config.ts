export type SlackRoute = "rad_cab" | "equipment";

export const SLACK_WORKSPACE_ID = "THPMZQD8S";

export const SLACK_CHANNEL_DEFAULTS = {
  rad_cab: {
    id: "C09K8F5F05U",
    name: "rad-cab-repairs",
    url: "https://app.slack.com/client/THPMZQD8S/C09K8F5F05U",
  },
  equipment: {
    id: "CJU3KD10D",
    name: "equipment-issues",
    url: "https://app.slack.com/client/THPMZQD8S/CJU3KD10D",
  },
} as const;

export function slackChannelIdForRoute(route: SlackRoute): string {
  if (route === "rad_cab") {
    return (
      process.env.SLACK_CHANNEL_RAD_CAB_REPAIRS ??
      SLACK_CHANNEL_DEFAULTS.rad_cab.id
    );
  }
  return (
    process.env.SLACK_CHANNEL_EQUIPMENT_ISSUES ??
    SLACK_CHANNEL_DEFAULTS.equipment.id
  );
}

export function slackChannelLabel(route: SlackRoute): string {
  return route === "rad_cab"
    ? `#${SLACK_CHANNEL_DEFAULTS.rad_cab.name}`
    : `#${SLACK_CHANNEL_DEFAULTS.equipment.name}`;
}
