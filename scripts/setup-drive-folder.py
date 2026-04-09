#!/usr/bin/env python3
"""
Create Google Drive folder for GTM strategy docs and save ID to Supabase.
"""

import json
import subprocess
import requests
import os

# Load OAuth config
with open(os.path.expanduser('~/.claude/.google/oauth-config.json')) as f:
    config = json.load(f)

# Refresh access token
print("Refreshing access token...")
token_res = requests.post(
    config['token_uri'],
    data={
        'grant_type': 'refresh_token',
        'client_id': config['client_id'],
        'client_secret': config['client_secret'],
        'refresh_token': config['refresh_token'],
    }
)

if not token_res.ok:
    print(f"Error refreshing token: {token_res.text}")
    exit(1)

access_token = token_res.json()['access_token']
print("Got fresh access token!")

# Create folder
print("\nCreating Drive folder...")
folder_res = requests.post(
    'https://www.googleapis.com/drive/v3/files',
    headers={
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
    },
    json={
        'name': 'GTM Strategy Docs',
        'mimeType': 'application/vnd.google-apps.folder',
    }
)

if not folder_res.ok:
    print(f"Error creating folder: {folder_res.text}")
    exit(1)

folder_id = folder_res.json()['id']
print(f"Created folder with ID: {folder_id}")

# Save to Supabase
print("\nSaving to Supabase secrets...")
result = subprocess.run(
    ['npx', 'supabase', 'secrets', 'set', f'GOOGLE_DRIVE_FOLDER_ID={folder_id}'],
    capture_output=True,
    text=True,
    cwd=os.path.expanduser('~/ai-projects/business-os')
)

if result.returncode != 0:
    print(f"Error saving to Supabase: {result.stderr}")
    print(f"\nManual deployment required:")
    print(f"  npx supabase secrets set GOOGLE_DRIVE_FOLDER_ID='{folder_id}'")
else:
    print("Saved to Supabase secrets!")

print(f"\n{'='*60}")
print("DRIVE FOLDER SETUP COMPLETE")
print(f"{'='*60}")
print(f"Folder ID: {folder_id}")
print(f"Folder URL: https://drive.google.com/drive/folders/{folder_id}")
