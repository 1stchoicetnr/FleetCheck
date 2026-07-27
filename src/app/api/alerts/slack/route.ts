import { NextRequest, NextResponse } from "next/server";
import {
  SLACK_CHANNEL_DEFAULTS,
  SlackRoute,
  slackChannelIdForRoute,
} from "@/lib/slack-config";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const channel = body.channel as SlackRoute;
    const message = body.message as string;
    const webhookUrl = body.webhookUrl as string | undefined;
    const channelId =
      (body.channelId as string | undefined) ?? slackChannelIdForRoute(channel);

    if (!message || !channel) {
      return NextResponse.json(
        { ok: false, error: "Missing message or channel" },
        { status: 400 }
      );
    }

    const envUrl =
      channel === "rad_cab"
        ? process.env.SLACK_WEBHOOK_RAD_CAB_REPAIRS
        : process.env.SLACK_WEBHOOK_EQUIPMENT_ISSUES;

    const url = envUrl || webhookUrl;
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "No Slack webhook configured for this channel" },
        { status: 400 }
      );
    }

    const channelName =
      channel === "rad_cab"
        ? SLACK_CHANNEL_DEFAULTS.rad_cab.name
        : SLACK_CHANNEL_DEFAULTS.equipment.name;

    const slackRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: channelId,
        text: message,
        username: "FleetCheck",
        icon_emoji: ":warning:",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: message },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Channel: #${channelName} (\`${channelId}\`)`,
              },
            ],
          },
        ],
      }),
    });

    if (!slackRes.ok) {
      const detail = await slackRes.text();
      return NextResponse.json(
        { ok: false, error: detail || "Slack request failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
