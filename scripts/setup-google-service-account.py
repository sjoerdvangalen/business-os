#!/usr/bin/env python3
"""
Setup Google Service Account for business-os edge functions.

Usage:
  python3 scripts/setup-google-service-account.py --client-id YOUR_ID --client-secret YOUR_SECRET

Or set environment variables:
  GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
"""

import os
import sys
import json
import urllib.parse
import requests
import http.server
import socketserver
import threading
import webbrowser
import time
import argparse

# Parse arguments or use env vars
parser = argparse.ArgumentParser(description='Setup Google Service Account')
parser.add_argument('--client-id', default=os.environ.get('GOOGLE_CLIENT_ID'), help='OAuth Client ID')
parser.add_argument('--client-secret', default=os.environ.get('GOOGLE_CLIENT_SECRET'), help='OAuth Client Secret')
parser.add_argument('--project-id', default=os.environ.get('GOOGLE_PROJECT_ID', 'n8n-setup-473013'), help='GCP Project ID')
args = parser.parse_args()

CLIENT_ID = args.client_id
CLIENT_SECRET = args.client_secret
PROJECT_ID = args.project_id

if not CLIENT_ID or not CLIENT_SECRET:
    print("Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required")
    print("Set as environment variables or use --client-id and --client-secret")
    sys.exit(1)

REDIRECT_URI = "http://localhost:8085/callback"
PORT = 8085

SERVICE_ACCOUNT_NAME = "gtm-doc-render"
SERVICE_ACCOUNT_DISPLAY_NAME = "GTM Doc Render"
SERVICE_ACCOUNT_DESCRIPTION = "Service account for GTM strategy doc rendering in business-os edge functions"

# Scopes needed for IAM management
SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/iam'
]

auth_code = None
server_running = True

def get_auth_url():
    """Generate OAuth authorization URL."""
    params = {
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT_URI,
        'scope': ' '.join(SCOPES),
        'response_type': 'code',
        'access_type': 'offline',
        'prompt': 'consent'
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"

class CallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code, server_running

        if '/callback' in self.path:
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)

            if 'code' in params:
                auth_code = params['code'][0]
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(b"""
                <html>
                <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h1>Authentication Successful!</h1>
                    <p>You can close this window and return to the terminal.</p>
                </body>
                </html>
                """)
                server_running = False
            else:
                error = params.get('error', ['unknown'])[0]
                self.send_response(400)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(f"""
                <html>
                <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h1>Authentication Failed</h1>
                    <p>Error: {error}</p>
                </body>
                </html>
                """.encode())
                server_running = False
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass

def start_callback_server():
    """Start HTTP server to receive OAuth callback."""
    with socketserver.TCPServer(("", PORT), CallbackHandler) as httpd:
        httpd.timeout = 1
        while server_running:
            try:
                httpd.handle_request()
            except Exception:
                break

def exchange_code_for_token(auth_code):
    """Exchange authorization code for access token."""
    url = "https://oauth2.googleapis.com/token"
    payload = {
        'code': auth_code,
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'redirect_uri': REDIRECT_URI,
        'grant_type': 'authorization_code'
    }

    response = requests.post(url, data=payload)
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error exchanging code: {response.status_code}")
        print(response.text)
        return None

def create_service_account(access_token):
    """Create service account via IAM API."""
    url = f"https://iam.googleapis.com/v1/projects/{PROJECT_ID}/serviceAccounts"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    payload = {
        'accountId': SERVICE_ACCOUNT_NAME,
        'serviceAccount': {
            'displayName': SERVICE_ACCOUNT_DISPLAY_NAME,
            'description': SERVICE_ACCOUNT_DESCRIPTION
        }
    }

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code == 409:
        print(f"Service account '{SERVICE_ACCOUNT_NAME}' already exists")
        list_url = f"https://iam.googleapis.com/v1/projects/{PROJECT_ID}/serviceAccounts"
        list_resp = requests.get(list_url, headers=headers)
        if list_resp.status_code == 200:
            for sa in list_resp.json().get('accounts', []):
                if sa['email'].startswith(SERVICE_ACCOUNT_NAME + '@'):
                    return sa
        return None
    elif response.status_code == 200:
        print(f"Created service account: {response.json()['email']}")
        return response.json()
    else:
        print(f"Error creating service account: {response.status_code}")
        print(response.text)
        return None

def enable_apis(access_token):
    """Enable Google Docs and Drive APIs."""
    url = f"https://serviceusage.googleapis.com/v1/projects/{PROJECT_ID}/services:batchEnable"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    payload = {
        'serviceIds': [
            'docs.googleapis.com',
            'drive.googleapis.com'
        ]
    }

    response = requests.post(url, headers=headers, json=payload)
    if response.status_code in [200, 202]:
        print("Enabled Google Docs and Drive APIs")
        return True
    else:
        print(f"Note: API enablement returned {response.status_code} (may already be enabled)")
        return True

def create_key(access_token, service_account_email):
    """Create JSON key for service account."""
    url = f"https://iam.googleapis.com/v1/projects/{PROJECT_ID}/serviceAccounts/{service_account_email}/keys"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    payload = {
        'keyAlgorithm': 'KEY_ALG_RSA_2048',
        'privateKeyType': 'TYPE_GOOGLE_CREDENTIALS_FILE'
    }

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code == 200:
        key_data = response.json()
        import base64
        private_key = base64.b64decode(key_data['privateKeyData']).decode('utf-8')
        return json.loads(private_key)
    else:
        print(f"Error creating key: {response.status_code}")
        print(response.text)
        return None

def deploy_to_supabase(key_json):
    """Deploy service account key to Supabase secrets."""
    import subprocess
    import tempfile

    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(key_json, f)
        temp_path = f.name

    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        result = subprocess.run(
            [f"{script_dir}/deploy-google-secrets.sh", temp_path],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(script_dir)
        )

        print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)

        return result.returncode == 0
    finally:
        os.unlink(temp_path)

def main():
    global auth_code, server_running

    print("=" * 60)
    print("Google Service Account Setup for business-os")
    print("=" * 60)
    print()
    print(f"Project: {PROJECT_ID}")
    print()

    print("Starting callback server on port 8085...")
    server_thread = threading.Thread(target=start_callback_server)
    server_thread.daemon = True
    server_thread.start()
    time.sleep(1)

    auth_url = get_auth_url()
    print()
    print("Opening browser for authorization...")
    print("If browser doesn't open, use this URL:")
    print(auth_url)
    print()
    webbrowser.open(auth_url)

    print("Waiting for authorization...")
    timeout = 120
    elapsed = 0
    while server_running and auth_code is None and elapsed < timeout:
        time.sleep(1)
        elapsed += 1
        if elapsed % 10 == 0:
            print(f"  Waiting... ({elapsed}s)")

    if auth_code is None:
        print()
        print("Timeout or authentication failed.")
        print("Please try again.")
        server_running = False
        sys.exit(1)

    print()
    print("Authorization received!")
    print()

    print("Exchanging code for access token...")
    token_data = exchange_code_for_token(auth_code)
    if not token_data:
        print("Failed to get access token")
        sys.exit(1)

    access_token = token_data['access_token']
    print("Authenticated successfully!")
    print()

    print("Creating service account...")
    sa = create_service_account(access_token)
    if not sa:
        print("Failed to create or find service account")
        sys.exit(1)

    service_account_email = sa['email']
    print(f"Service account: {service_account_email}")
    print()

    print("Enabling Google Docs and Drive APIs...")
    enable_apis(access_token)
    print()

    print("Creating JSON key...")
    key_json = create_key(access_token, service_account_email)
    if not key_json:
        print("Failed to create key")
        sys.exit(1)

    creds_dir = os.path.expanduser('~/.claude/.google')
    os.makedirs(creds_dir, exist_ok=True)
    key_path = os.path.join(creds_dir, f'{SERVICE_ACCOUNT_NAME}-key.json')
    with open(key_path, 'w') as f:
        json.dump(key_json, f, indent=2)
    print(f"Key saved to: {key_path}")
    print()

    print("Deploying to Supabase secrets...")
    if deploy_to_supabase(key_json):
        print()
        print("=" * 60)
        print("SUCCESS!")
        print("=" * 60)
        print()
        print("Next steps:")
        print("1. Go to https://drive.google.com")
        print("2. Create a folder for GTM strategy docs (or use existing)")
        print("3. Share the folder with:")
        print(f"   {service_account_email}")
        print("   (Give 'Editor' permissions)")
        print("4. Copy the folder ID from the URL")
        print("5. Run: supabase secrets set GOOGLE_DRIVE_FOLDER_ID='YOUR_FOLDER_ID'")
        print()
        print("Then test by triggering gtm-synthesis for a client!")
    else:
        print("Failed to deploy to Supabase")
        print(f"Key is saved at: {key_path}")
        print("You can deploy manually with:")
        print(f"  ./scripts/deploy-google-secrets.sh {key_path}")

if __name__ == '__main__':
    main()
