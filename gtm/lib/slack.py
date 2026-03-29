"""
Slack incoming webhook notifications for GTM campaigns.
Pure HTTP POST — no slack-sdk needed.
"""
import os
import json
import requests


def _get_webhook_url() -> str:
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if not url:
        raise ValueError("SLACK_WEBHOOK_URL not set")
    return url


def send_notification(message: str, blocks: list = None):
    url = _get_webhook_url()
    payload = {"text": message}
    if blocks:
        payload["blocks"] = blocks
    resp = requests.post(url, json=payload, timeout=10)
    resp.raise_for_status()
    return resp.text


def notify_plan_ready(campaign_name: str, doc_url: str):
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"Campaign Plan Ready: {campaign_name}"}
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"Een nieuw campagne plan staat klaar voor review.\n\n<{doc_url}|Open Google Doc>"
            }
        },
        {
            "type": "context",
            "elements": [
                {"type": "mrkdwn", "text": "Review het plan in Google Docs en keur goed, wijs af of geef feedback."}
            ]
        }
    ]
    return send_notification(f"Campaign plan klaar: {campaign_name}", blocks)


def notify_campaign_complete(campaign_name: str, stats: dict):
    stats_text = "\n".join(f"*{k}:* {v}" for k, v in stats.items())
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"Campaign Complete: {campaign_name}"}
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": stats_text}
        },
    ]
    if stats.get("sheet_url"):
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"<{stats['sheet_url']}|Open Google Sheet>"}
        })
    return send_notification(f"Campaign klaar: {campaign_name}", blocks)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(os.path.expanduser("~/.claude/.env"))
    notify_plan_ready("TEST-CAMP", "https://docs.google.com/document/d/test")
    print("Slack notification sent")
