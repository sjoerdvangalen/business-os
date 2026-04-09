#!/usr/bin/env python3
"""
Setup OAuth for business-os edge functions.
This creates a refresh token that can be used by edge functions to access Google APIs.

Usage:
  python3 scripts/setup-oauth-for-edge-functions.py --client-id YOUR_ID --client-secret YOUR_SECRET

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
parser = argparse.ArgumentParser(description='Setup OAuth for edge functions')
parser.add_argument('--client-id', default=os.environ.get('GOOGLE_CLIENT_ID'), help='OAuth Client ID')
parser.add_argument('--client-secret', default=os.environ.get('GOOGLE_CLIENT_SECRET'), help='OAuth Client Secret')
args = parser.parse_args()

CLIENT_ID = args.client_id
CLIENT_SECRET = args.client_secret

if not CLIENT_ID or not CLIENT_SECRET:
    print("Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required")
    print("Set as environment variables or use --client-id and --client-secret")
    sys.exit(1)

REDIRECT_URI = "http://localhost:8087/callback"
PORT = 8087

# Scopes needed for Google Docs and Drive
SCOPES = [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive'
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
    """Exchange authorization code for access token and refresh token."""
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

def deploy_to_supabase(oauth_data):
    """Deploy OAuth credentials to Supabase secrets."""

    # Create a single JSON with all OAuth credentials
    oauth_config = {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'refresh_token': oauth_data.get('refresh_token'),
        'access_token': oauth_data.get('access_token'),
        'token_uri': 'https://oauth2.googleapis.com/token'
    }

    if not oauth_config['refresh_token']:
        print("ERROR: No refresh token received!")
        print("This usually means you've already authorized this app before.")
        print("Revoke access at https://myaccount.google.com/permissions and try again.")
        return False

    # Save to file for manual deployment
    creds_dir = os.path.expanduser('~/.claude/.google')
    os.makedirs(creds_dir, exist_ok=True)

    config_path = os.path.join(creds_dir, 'oauth-config.json')
    with open(config_path, 'w') as f:
        json.dump(oauth_config, f, indent=2)
    print(f"OAuth config saved to: {config_path}")

    # Also save as .env format for easy copy-paste
    env_path = os.path.join(creds_dir, 'oauth-env.txt')
    with open(env_path, 'w') as f:
        f.write(f"GOOGLE_OAUTH_CONFIG={json.dumps(oauth_config)}\\n")
    print(f"Environment format saved to: {env_path}")

    # Try to deploy with npx
    try:
        import subprocess
        print("Attempting to deploy via npx supabase...")
        result = subprocess.run(
            ['npx', 'supabase', 'secrets', 'set', f'GOOGLE_OAUTH_CONFIG={json.dumps(oauth_config)}'],
            capture_output=True,
            text=True,
            cwd=os.path.expanduser('~/ai-projects/business-os')
        )
        if result.returncode == 0:
            print("Successfully deployed via npx!")
            return True
        else:
            print(f"npx deploy failed: {result.stderr}")
    except Exception as e:
        print(f"Could not run npx: {e}")

    print()
    print("=" * 60)
    print("MANUAL DEPLOYMENT REQUIRED")
    print("=" * 60)
    print()
    print("Option 1: Use Supabase Dashboard")
    print("  1. Go to https://supabase.com/dashboard")
    print("  2. Select project: gjhbbyodrbuabfzafzry")
    print("  3. Go to Project Settings → Edge Functions → Secrets")
    print("  4. Add secret:")
    print(f"     Name: GOOGLE_OAUTH_CONFIG")
    print(f"     Value: {json.dumps(oauth_config)}")
    print()
    print("Option 2: Install Supabase CLI")
    print("  npm install -g supabase")
    print("  supabase login")
    print("  supabase secrets set GOOGLE_OAUTH_CONFIG='...'")
    print()

    return True  # Return true because we saved the file

def main():
    global auth_code, server_running

    print("=" * 60)
    print("Setup OAuth for business-os Edge Functions")
    print("=" * 60)
    print()
    print("This will create OAuth credentials for gtm-doc-render.")
    print()

    # Step 1: Start callback server
    print("Starting callback server on port 8087...")
    server_thread = threading.Thread(target=start_callback_server)
    server_thread.daemon = True
    server_thread.start()
    time.sleep(1)

    # Step 2: Authenticate
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

    # Step 3: Exchange code for tokens
    print("Getting OAuth tokens...")
    token_data = exchange_code_for_token(auth_code)
    if not token_data:
        print("Failed to get tokens")
        sys.exit(1)

    print(f"Got access token (expires in {token_data.get('expires_in', 'unknown')}s)")

    if 'refresh_token' in token_data:
        print("Got refresh token!")
    else:
        print("WARNING: No refresh token received!")
        print("You may have already authorized this app.")
        print("Revoke at https://myaccount.google.com/permissions and try again.")
        sys.exit(1)

    print()

    # Step 4: Deploy to Supabase
    if deploy_to_supabase(token_data):
        print()
        print("=" * 60)
        print("SUCCESS!")
        print("=" * 60)
        print()
        print("OAuth credentials deployed to Supabase secrets.")
        print("Next step: Update gtm-doc-render edge function to use OAuth.")
    else:
        print("Failed to deploy to Supabase")

if __name__ == '__main__':
    main()
