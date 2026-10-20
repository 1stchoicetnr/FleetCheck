import { errorResponse } from "@/lib/server/api-error";
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
    // Webhooks come only from server env vars; any webhookUrl/channelId in the body is ignored.
    const channelId = slackChannelIdForRoute(channel);

    if (channel !== "rad_cab" && channel !== "equipment") {
      return NextResponse.json({ ok: false, error: "Unknown channel" }, { status: 400 });
    }
    if (typeof message !== "string" || message.length > 3000) {
      return NextResponse.json({ ok: false, error: "Message is missing or too long" }, { status: 400 });
    }
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

    const url = envUrl;
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
        username: "Inspekt",
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
      console.error("[api] slack alert failed:", slackRes.status, await slackRes.text());
      return NextResponse.json(
        { ok: false, error: "Slack request failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Unknown error");
  }
}
