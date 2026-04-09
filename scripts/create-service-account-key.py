#!/usr/bin/env python3
"""
Create service account key after policy has been disabled.
Run this after getting Organisation Policy Administrator role.

Usage:
  python3 scripts/create-service-account-key.py --client-id YOUR_ID --client-secret YOUR_SECRET

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
parser = argparse.ArgumentParser(description='Create service account key')
parser.add_argument('--client-id', default=os.environ.get('GOOGLE_CLIENT_ID'), help='OAuth Client ID')
parser.add_argument('--client-secret', default=os.environ.get('GOOGLE_CLIENT_SECRET'), help='OAuth Client Secret')
parser.add_argument('--project-id', default=os.environ.get('GOOGLE_PROJECT_ID', 'n8n-setup-473013'), help='GCP Project ID')
parser.add_argument('--org-id', default=os.environ.get('GOOGLE_ORG_ID', '850995860650'), help='GCP Organization ID')
args = parser.parse_args()

CLIENT_ID = args.client_id
CLIENT_SECRET = args.client_secret
PROJECT_ID = args.project_id
ORGANIZATION_ID = args.org_id

if not CLIENT_ID or not CLIENT_SECRET:
    print("Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required")
    print("Set as environment variables or use --client-id and --client-secret")
    sys.exit(1)

REDIRECT_URI = "http://localhost:8086/callback"
PORT = 8086

SERVICE_ACCOUNT_EMAIL = f"gtm-doc-render@{PROJECT_ID}.iam.gserviceaccount.com"

# Scopes needed
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

def disable_org_policy(access_token):
    """Disable the service account key creation policy at organization level."""
    url = f"https://orgpolicy.googleapis.com/v2/organizations/{ORGANIZATION_ID}/policies/iam.disableServiceAccountKeyCreation"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    get_resp = requests.get(url, headers=headers)
    if get_resp.status_code != 200:
        print(f"Warning: Could not get current policy: {get_resp.status_code}")
        print(get_resp.text)

    payload = {
        "spec": {
            "rules": [
                {
                    "enforce": False
                }
            ]
        }
    }

    response = requests.patch(url, headers=headers, json=payload)
    if response.status_code in [200, 202]:
        print("Successfully disabled service account key creation policy!")
        return True
    else:
        print(f"Error disabling policy: {response.status_code}")
        print(response.text)
        return False

def create_key(access_token):
    """Create JSON key for service account."""
    url = f"https://iam.googleapis.com/v1/projects/{PROJECT_ID}/serviceAccounts/{SERVICE_ACCOUNT_EMAIL}/keys"
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
    print("Create Service Account Key")
    print("=" * 60)
    print()
    print(f"Project: {PROJECT_ID}")
    print(f"Service Account: {SERVICE_ACCOUNT_EMAIL}")
    print()

    print("Starting callback server on port 8086...")
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
        print("Timeout or authentication failed.")
        server_running = False
        sys.exit(1)

    print("Authorization received!")
    print()

    print("Getting access token...")
    token_data = exchange_code_for_token(auth_code)
    if not token_data:
        print("Failed to get access token")
        sys.exit(1)

    access_token = token_data['access_token']
    print("Authenticated!")
    print()

    print("Disabling organization policy...")
    if not disable_org_policy(access_token):
        print("Warning: Could not disable policy, will try to create key anyway...")
    print()

    print("Waiting 10 seconds for policy to propagate...")
    time.sleep(10)
    print()

    print("Creating service account key...")
    key_json = create_key(access_token)
    if not key_json:
        print("Failed to create key")
        print("The policy might need more time to propagate. Try again in 5 minutes.")
        sys.exit(1)

    creds_dir = os.path.expanduser('~/.claude/.google')
    os.makedirs(creds_dir, exist_ok=True)
    key_path = os.path.join(creds_dir, 'gtm-doc-render-key.json')
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
        print("2. Create a folder for GTM strategy docs")
        print("3. Share the folder with:")
        print(f"   {SERVICE_ACCOUNT_EMAIL}")
        print("   (Give 'Editor' permissions)")
        print("4. Copy the folder ID from the URL")
        print("5. Run: supabase secrets set GOOGLE_DRIVE_FOLDER_ID='YOUR_FOLDER_ID'")
    else:
        print("Failed to deploy to Supabase")
        print(f"Key is saved at: {key_path}")
        print("Deploy manually with:")
        print(f"  ./scripts/deploy-google-secrets.sh {key_path}")

if __name__ == '__main__':
    main()
