"""CLI interface for Email Bison Campaign Skill.

Usage:
    python -m gtm.skills.emailbison_campaign.cli preview --client FRTC --name "Test Campaign"
    python -m gtm.skills.emailbison_campaign.cli create --client FRTC --name "Test Campaign" --mode immediate
"""

import argparse
import json
import os
import sys
from pathlib import Path


def setup_paths():
    """Add business-os to Python path."""
    # Get the business-os root directory
    current_file = Path(__file__).resolve()
    business_os_root = current_file.parent.parent.parent.parent
    if str(business_os_root) not in sys.path:
        sys.path.insert(0, str(business_os_root))


def load_env():
    """Load environment variables from ~/.claude/.env"""
    env_path = Path.home() / ".claude" / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key, value.strip('"\''))


def cmd_preview(args):
    """Generate campaign preview."""
    from . import AccountAttachmentConfig, CampaignCreateRequest, CampaignManager

    manager = CampaignManager()
    config = AccountAttachmentConfig(
        mode=args.mode,
        min_warmup_score=args.min_warmup_score,
    )
    request = CampaignCreateRequest(
        client_code=args.client,
        campaign_name=args.name,
        template=args.template,
        sequence_id=args.sequence,
        account_config=config,
    )

    preview = manager.preview_campaign(request)

    print(f"\nCampaign Preview")
    print(f"================")
    print(f"Client: {preview.client_code}")
    print(f"Name:   {preview.campaign_name}")
    print(f"Template: {preview.template}")
    print(f"\nSettings:")
    print(f"  Timezone: {preview.settings.timezone}")
    print(f"  Schedule: {preview.settings.send_start_time}-{preview.settings.send_end_time}")
    print(f"  Days: {', '.join(preview.settings.send_days)}")
    print(f"  Track opens: {preview.settings.track_opens}")
    print(f"  Plain text: {preview.settings.send_as_plain_text}")
    print(f"\nInboxes ({len(preview.inboxes)} warmed found):")
    for inbox in preview.inboxes:
        print(f"  {inbox['email']} (score: {inbox['warmup_score']})")

    if preview.warnings:
        print(f"\nWarnings:")
        for warning in preview.warnings:
            print(f"  ⚠ {warning}")

    print(f"\nCan create: {'Yes' if preview.can_create else 'No'}")

    if args.json:
        print(f"\nJSON Output:")
        print(json.dumps(preview.to_dict(), indent=2))


def cmd_create(args):
    """Create a new campaign."""
    from . import AccountAttachmentConfig, CampaignCreateRequest, CampaignManager

    manager = CampaignManager()
    config = AccountAttachmentConfig(
        mode=args.mode,
        min_warmup_score=args.min_warmup_score,
    )
    request = CampaignCreateRequest(
        client_code=args.client,
        campaign_name=args.name,
        template=args.template,
        sequence_id=args.sequence,
        account_config=config,
    )

    result = manager.create_campaign(request)

    if result["success"]:
        if result.get("mode") == "review":
            print(f"\nReview Mode - Campaign NOT created yet")
            print(f"======================================")
            preview = result["preview"]
            print(f"\nClient: {preview['client_code']}")
            print(f"Name:   {preview['campaign_name']}")
            print(f"Inboxes: {len(preview['inboxes'])}")
            print(f"\nTo create, run with --mode immediate")
        else:
            print(f"\nCampaign Created Successfully")
            print(f"=============================")
            print(f"Email Bison ID: {result.get('emailbison_campaign_id')}")
            print(f"Business OS ID: {result.get('business_os_campaign_id')}")
            print(f"Attached accounts: {len(result.get('attached_accounts', []))}")
            if result.get("warnings"):
                print(f"\nWarnings:")
                for warning in result["warnings"]:
                    print(f"  ⚠ {warning}")
    else:
        print(f"\nFailed to create campaign")
        print(f"=========================")
        print(f"Error: {result.get('error')}")
        if result.get("warnings"):
            print(f"\nWarnings:")
            for warning in result["warnings"]:
                print(f"  ⚠ {warning}")
        sys.exit(1)


def cmd_list_sequences(args):
    """List available sequences."""
    from . import CampaignManager

    manager = CampaignManager()
    sequences = manager.list_sequences()

    print(f"\nAvailable Sequences")
    print(f"===================")
    for seq in sequences:
        print(f"  {seq.get('id')}: {seq.get('name', 'Unnamed')}")

    if args.json:
        print(f"\nJSON:")
        print(json.dumps(sequences, indent=2))


def main():
    """Main CLI entrypoint."""
    setup_paths()
    load_env()

    parser = argparse.ArgumentParser(
        description="Email Bison Campaign CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Preview campaign:
    %(prog)s preview --client FRTC --name "FRTC | EN | Test Campaign"

  Create campaign (review mode):
    %(prog)s create --client FRTC --name "FRTC | EN | Test Campaign"

  Create campaign (immediate):
    %(prog)s create --client FRTC --name "FRTC | EN | Test Campaign" --mode immediate

  List sequences:
    %(prog)s sequences
""",
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Preview command
    preview_parser = subparsers.add_parser("preview", help="Preview campaign before creation")
    preview_parser.add_argument("--client", "-c", required=True, help="Client code (e.g., FRTC)")
    preview_parser.add_argument("--name", "-n", required=True, help="Campaign name")
    preview_parser.add_argument("--template", "-t", default="business_os_default", help="Template name")
    preview_parser.add_argument("--sequence", "-s", help="Sequence ID")
    preview_parser.add_argument("--mode", choices=["immediate", "review"], default="review", help="Attachment mode")
    preview_parser.add_argument("--min-warmup-score", type=int, default=80, help="Minimum warmup score")
    preview_parser.add_argument("--json", action="store_true", help="Output JSON")

    # Create command
    create_parser = subparsers.add_parser("create", help="Create a new campaign")
    create_parser.add_argument("--client", "-c", required=True, help="Client code (e.g., FRTC)")
    create_parser.add_argument("--name", "-n", required=True, help="Campaign name")
    create_parser.add_argument("--template", "-t", default="business_os_default", help="Template name")
    create_parser.add_argument("--sequence", "-s", help="Sequence ID")
    create_parser.add_argument("--mode", choices=["immediate", "review"], default="review", help="Attachment mode")
    create_parser.add_argument("--min-warmup-score", type=int, default=80, help="Minimum warmup score")
    create_parser.add_argument("--cell-id", help="Campaign cell ID to link")

    # Sequences command
    seq_parser = subparsers.add_parser("sequences", help="List available sequences")
    seq_parser.add_argument("--json", action="store_true", help="Output JSON")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    commands = {
        "preview": cmd_preview,
        "create": cmd_create,
        "sequences": cmd_list_sequences,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
