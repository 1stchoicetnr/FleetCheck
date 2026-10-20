import assert from "node:assert/strict";
import test from "node:test";
import {
  feedbackDeliveryChannel,
  feedbackSavedMessage,
  feedbackSlackBody,
  formatFeedbackSlack,
} from "./feedback.ts";

test("Slack webhook wins, then Resend, otherwise Office keeps it", () => {
  assert.equal(
    feedbackDeliveryChannel({
      slackWebhook: "https://hooks.slack.com/services/example",
      resendApiKey: "re_example",
    }),
    "slack"
  );
  assert.equal(
    feedbackDeliveryChannel({ slackWebhook: "  ", resendApiKey: "re_example" }),
    "email"
  );
  assert.equal(feedbackDeliveryChannel({}), "office");
});

test("Slack text includes type, note, who, role, page, and unit", () => {
  const { text, imageUrl } = formatFeedbackSlack({
    payload: {
      type: "Bug",
      note: "The button did nothing",
      userName: "James",
      userRole: "management",
      pagePhase: "inspect",
      pageUrl: "https://fleet-check-eight.vercel.app/checkout/abc",
      unitNumber: "12",
      plate: "RC-0012",
      driverName: "Pat",
    },
    screenshotUrl: "https://blob.vercel-storage.com/feedback/shot.jpg",
  });
  assert.match(text, /Bug/);
  assert.match(text, /The button did nothing/);
  assert.match(text, /James · Office/);
  assert.match(text, /Checkout name:\* Pat/);
  assert.match(text, /Precheck/);
  assert.match(text, /fleet-check-eight\.vercel\.app\/checkout\/abc/);
  assert.match(text, /12 · RC-0012/);
  assert.equal(imageUrl, "https://blob.vercel-storage.com/feedback/shot.jpg");
  assert.match(text, /blob\.vercel-storage\.com/);
});

test("a private screenshot is not pasted into Slack", () => {
  const { text, imageUrl } = formatFeedbackSlack({
    payload: { type: "Idea", note: "Add a map" },
    screenshotUrl: "data:image/jpeg;base64,abc",
  });
  assert.equal(imageUrl, undefined);
  assert.doesNotMatch(text, /base64/);
  assert.match(text, /saved in Office/);
  assert.match(text, /Unknown · Unknown role/);
});

test("Office-only copy names the Slack env var", () => {
  assert.match(feedbackSavedMessage("office"), /SLACK_WEBHOOK_FEEDBACK/);
  assert.match(feedbackSavedMessage("office"), /@ashley/);
  assert.match(feedbackSavedMessage("slack"), /Ashley/);
});

test("the Slack payload does not pick a channel", () => {
  const body = feedbackSlackBody({
    payload: { type: "Bug", note: "Hello", userName: "James", userRole: "driver" },
  });
  assert.equal("channel" in body, false);
  assert.equal("username" in body, false);
  assert.match(body.text, /James · Driver/);
});
