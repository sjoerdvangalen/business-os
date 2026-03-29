"""
Google Sheets operations for prospect list exports.
"""
from googleapiclient.discovery import build
from lib.google_auth import get_credentials
from typing import List, Dict, Any, Optional


def get_sheets_service():
    """Get authorized Sheets API service."""
    creds = get_credentials()
    return build('sheets', 'v4', credentials=creds)


def get_drive_service():
    """Get authorized Drive API service."""
    creds = get_credentials()
    return build('drive', 'v3', credentials=creds)


def create_spreadsheet(title: str, folder_id: Optional[str] = None) -> str:
    """
    Create a new Google Spreadsheet.

    Args:
        title: Name of the spreadsheet
        folder_id: Optional Drive folder ID to place spreadsheet in

    Returns:
        Spreadsheet ID
    """
    service = get_sheets_service()

    spreadsheet = {
        'properties': {
            'title': title
        }
    }

    result = service.spreadsheets().create(body=spreadsheet).execute()
    spreadsheet_id = result['spreadsheetId']

    # Move to folder if specified
    if folder_id:
        drive_service = get_drive_service()
        drive_service.files().update(
            fileId=spreadsheet_id,
            addParents=folder_id
        ).execute()

    return spreadsheet_id


def create_sheets(spreadsheet_id: str, sheet_names: List[str]):
    """
    Add multiple sheets to a spreadsheet.

    Args:
        spreadsheet_id: The spreadsheet ID
        sheet_names: List of sheet names to create
    """
    service = get_sheets_service()

    requests = []
    for name in sheet_names:
        requests.append({
            'addSheet': {
                'properties': {
                    'title': name
                }
            }
        })

    body = {'requests': requests}
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body=body
    ).execute()


def write_data(spreadsheet_id: str, sheet_name: str, data: List[List[Any]]):
    """
    Write data to a sheet.

    Args:
        spreadsheet_id: The spreadsheet ID
        sheet_name: Sheet name (e.g., 'Businesses')
        data: 2D array of values
    """
    service = get_sheets_service()

    range_name = f"{sheet_name}!A1"

    body = {
        'values': data
    }

    result = service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=range_name,
        valueInputOption='RAW',
        body=body
    ).execute()

    return result


def format_header(spreadsheet_id: str, sheet_name: str, num_columns: int):
    """
    Format header row with bold text and background color.

    Args:
        spreadsheet_id: The spreadsheet ID
        sheet_name: Sheet name
        num_columns: Number of columns to format
    """
    service = get_sheets_service()

    # Get sheet ID
    spreadsheet = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id
    ).execute()

    sheet_id = None
    for sheet in spreadsheet['sheets']:
        if sheet['properties']['title'] == sheet_name:
            sheet_id = sheet['properties']['sheetId']
            break

    if sheet_id is None:
        raise ValueError(f"Sheet '{sheet_name}' not found")

    requests = [{
        'repeatCell': {
            'range': {
                'sheetId': sheet_id,
                'startRowIndex': 0,
                'endRowIndex': 1,
                'startColumnIndex': 0,
                'endColumnIndex': num_columns
            },
            'cell': {
                'userEnteredFormat': {
                    'backgroundColor': {
                        'red': 0.9,
                        'green': 0.9,
                        'blue': 0.9
                    },
                    'textFormat': {
                        'bold': True
                    }
                }
            },
            'fields': 'userEnteredFormat(backgroundColor,textFormat)'
        }
    }]

    body = {'requests': requests}
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body=body
    ).execute()


def create_prospect_export(
    title: str,
    enriched: List[Dict],
    folder_id: Optional[str] = None,
) -> tuple[str, str]:
    """
    Create a prospect export spreadsheet from a flat enriched list.

    Args:
        title: Spreadsheet title (campaign name)
        enriched: Flat list of dicts with keys:
            company_name, domain, first_name, last_name,
            email, source, method
        folder_id: Optional Drive folder ID

    Returns:
        Tuple of (spreadsheet_id, spreadsheet_url)
    """
    # Create spreadsheet
    spreadsheet_id = create_spreadsheet(title, folder_id)

    # Create extra sheets (Sheet1 is the default)
    create_sheets(spreadsheet_id, ['Valid Contacts', 'Invalid Contacts'])

    # Split on whether email is present/valid
    header = ['Company', 'Domain', 'First Name', 'Last Name', 'Email', 'Source', 'Method']
    all_data = [header]
    valid_data = [header]
    invalid_data = [['Company', 'Domain', 'First Name', 'Last Name', 'Attempted Email', 'Source', 'Method']]

    for row in enriched:
        record = [
            row.get('company_name', row.get('company', '')),
            row.get('domain', ''),
            row.get('first_name', ''),
            row.get('last_name', ''),
            row.get('email', ''),
            row.get('source', row.get('email_source', '')),
            row.get('method', row.get('email_method', '')),
        ]
        all_data.append(record)

        if row.get('email'):
            valid_data.append(record)
        else:
            invalid_data.append(record)

    # Write All Contacts (default Sheet1, renamed)
    write_data(spreadsheet_id, 'Sheet1', all_data)
    format_header(spreadsheet_id, 'Sheet1', len(header))
    rename_sheet(spreadsheet_id, 'Sheet1', 'All Contacts')

    # Write Valid Contacts
    write_data(spreadsheet_id, 'Valid Contacts', valid_data)
    format_header(spreadsheet_id, 'Valid Contacts', len(header))

    # Write Invalid Contacts
    write_data(spreadsheet_id, 'Invalid Contacts', invalid_data)
    format_header(spreadsheet_id, 'Invalid Contacts', len(header))

    url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"
    return spreadsheet_id, url


def rename_sheet(spreadsheet_id: str, old_name: str, new_name: str):
    """Rename a sheet."""
    service = get_sheets_service()

    # Get sheet ID
    spreadsheet = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id
    ).execute()

    sheet_id = None
    for sheet in spreadsheet['sheets']:
        if sheet['properties']['title'] == old_name:
            sheet_id = sheet['properties']['sheetId']
            break

    if sheet_id is None:
        raise ValueError(f"Sheet '{old_name}' not found")

    requests = [{
        'updateSheetProperties': {
            'properties': {
                'sheetId': sheet_id,
                'title': new_name
            },
            'fields': 'title'
        }
    }]

    body = {'requests': requests}
    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body=body
    ).execute()


if __name__ == '__main__':
    # Test: Create a sample spreadsheet
    test_enriched = [
        {
            'company_name': 'Acme Corp',
            'domain': 'acme.com',
            'first_name': 'John',
            'last_name': 'Doe',
            'email': 'john.doe@acme.com',
            'source': 'trykitt',
            'method': 'pattern',
        },
        {
            'company_name': 'Beta Inc',
            'domain': 'beta.com',
            'first_name': 'Jane',
            'last_name': 'Smith',
            'email': '',
            'source': 'failed',
            'method': '',
        },
    ]

    sheet_id, url = create_prospect_export('Test Export', test_enriched)
    print(f"Created: {url}")
