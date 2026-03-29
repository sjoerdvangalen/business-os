"""
Google OAuth2 authentication for Sheets and Docs API.
"""
import os
import pickle
from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

# Scopes for Sheets, Docs, and Drive
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive.file'
]

# Paths
CREDENTIALS_PATH = Path.home() / '.claude' / '.google' / 'credentials.json'
TOKEN_PATH = Path.home() / '.claude' / '.google' / 'token.pickle'


def get_credentials():
    """
    Get or refresh Google OAuth2 credentials.
    Returns Credentials object for use with Google API clients.
    """
    creds = None

    # Load existing token if available
    if TOKEN_PATH.exists():
        with open(TOKEN_PATH, 'rb') as token:
            creds = pickle.load(token)

    # If no valid credentials, do OAuth flow
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_PATH.exists():
                raise FileNotFoundError(
                    f"Google credentials not found at {CREDENTIALS_PATH}\n"
                    "Please download credentials.json from Google Cloud Console "
                    "and place it in ~/.claude/.google/"
                )

            flow = InstalledAppFlow.from_client_secrets_file(
                str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)

        # Save token for future runs
        with open(TOKEN_PATH, 'wb') as token:
            pickle.dump(creds, token)

    return creds


def setup_auth():
    """
    One-time setup script to generate token.pickle.
    Run this after placing credentials.json in ~/.claude/.google/
    """
    print("Setting up Google OAuth...")
    print(f"Credentials path: {CREDENTIALS_PATH}")
    print(f"Token will be saved to: {TOKEN_PATH}")

    try:
        creds = get_credentials()
        print("Authentication successful!")
        print(f"Token saved to {TOKEN_PATH}")
        return True
    except Exception as e:
        print(f"Authentication failed: {e}")
        return False


if __name__ == '__main__':
    setup_auth()
