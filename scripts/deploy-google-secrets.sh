#!/bin/bash
# Deploy Google Service Account credentials to Supabase Edge Functions
# Usage: ./scripts/deploy-google-secrets.sh /path/to/service-account.json [folder-id]

set -e

if [ $# -lt 1 ]; then
    echo "Usage: $0 /path/to/service-account.json [GOOGLE_DRIVE_FOLDER_ID]"
    echo ""
    echo "Example:"
    echo "  $0 ~/Downloads/gtm-doc-render-abc123.json"
    echo "  $0 ~/Downloads/gtm-doc-render-abc123.json 1ABCxyz123"
    exit 1
fi

JSON_FILE="$1"
FOLDER_ID="${2:-}"

if [ ! -f "$JSON_FILE" ]; then
    echo "Error: File not found: $JSON_FILE"
    exit 1
fi

echo "Minifying service account JSON..."
SERVICE_ACCOUNT_JSON=$(cat "$JSON_FILE" | jq -c .)

echo "Deploying GOOGLE_SERVICE_ACCOUNT_JSON to Supabase..."
cd "$(dirname "$0")/.."
supabase secrets set "GOOGLE_SERVICE_ACCOUNT_JSON=$SERVICE_ACCOUNT_JSON"

if [ -n "$FOLDER_ID" ]; then
    echo "Deploying GOOGLE_DRIVE_FOLDER_ID..."
    supabase secrets set "GOOGLE_DRIVE_FOLDER_ID=$FOLDER_ID"
fi

echo ""
echo "Verifying deployed secrets..."
supabase secrets list | grep -i google || echo "Warning: No Google secrets found in list"

echo ""
echo "Done! Google secrets deployed successfully."
echo ""
echo "Next steps:"
echo "1. Share your Drive folder with the service account email"
echo "2. Test the flow by triggering gtm-synthesis for a client"
