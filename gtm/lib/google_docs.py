"""
Google Docs operations for campaign and GTM plans.
"""
from googleapiclient.discovery import build
from lib.google_auth import get_credentials
from typing import Dict, Any, Optional, List


def get_docs_service():
    """Get authorized Docs API service."""
    creds = get_credentials()
    return build('docs', 'v1', credentials=creds)


def get_drive_service():
    """Get authorized Drive API service."""
    creds = get_credentials()
    return build('drive', 'v3', credentials=creds)


def create_document(title: str, folder_id: Optional[str] = None) -> str:
    """
    Create a new Google Document.

    Args:
        title: Document title
        folder_id: Optional Drive folder ID

    Returns:
        Document ID
    """
    service = get_docs_service()

    doc = {
        'title': title
    }

    result = service.documents().create(body=doc).execute()
    doc_id = result['documentId']

    # Move to folder if specified
    if folder_id:
        drive_service = get_drive_service()
        drive_service.files().update(
            fileId=doc_id,
            addParents=folder_id
        ).execute()

    return doc_id


def write_content(doc_id: str, content: List[Dict[str, Any]]):
    """
    Write content to a document using batch updates.

    Args:
        doc_id: Document ID
        content: List of content operations
    """
    service = get_docs_service()

    requests = []
    for item in content:
        requests.append(item)

    body = {'requests': requests}
    service.documents().batchUpdate(
        documentId=doc_id,
        body=body
    ).execute()


def add_heading(doc_id: str, text: str, level: int = 1):
    """Add a heading to the document."""
    service = get_docs_service()

    requests = [{
        'insertText': {
            'location': {
                'index': 1
            },
            'text': f"{text}\n"
        }
    }, {
        'updateParagraphStyle': {
            'range': {
                'startIndex': 1,
                'endIndex': len(text) + 1
            },
            'paragraphStyle': {
                'namedStyleType': f'HEADING_{level}'
            },
            'fields': 'namedStyleType'
        }
    }]

    body = {'requests': requests}
    service.documents().batchUpdate(
        documentId=doc_id,
        body=body
    ).execute()


def add_paragraph(doc_id: str, text: str, bold: bool = False):
    """Add a paragraph to the document."""
    service = get_docs_service()

    # Get current document to find end index
    doc = service.documents().get(documentId=doc_id).execute()
    end_index = doc['body']['content'][-1]['endIndex'] - 1

    requests = [{
        'insertText': {
            'location': {
                'index': end_index
            },
            'text': f"{text}\n\n"
        }
    }]

    if bold:
        requests.append({
            'updateTextStyle': {
                'range': {
                    'startIndex': end_index,
                    'endIndex': end_index + len(text)
                },
                'textStyle': {
                    'bold': True
                },
                'fields': 'bold'
            }
        })

    body = {'requests': requests}
    service.documents().batchUpdate(
        documentId=doc_id,
        body=body
    ).execute()


def add_table(doc_id: str, rows: List[List[str]]):
    """Add a table to the document."""
    service = get_docs_service()

    # Get current document to find end index
    doc = service.documents().get(documentId=doc_id).execute()
    end_index = doc['body']['content'][-1]['endIndex'] - 1

    num_rows = len(rows)
    num_cols = len(rows[0]) if rows else 0

    requests = [{
        'insertTable': {
            'location': {
                'index': end_index
            },
            'table': {
                'rows': num_rows,
                'columns': num_cols
            }
        }
    }]

    body = {'requests': requests}
    service.documents().batchUpdate(
        documentId=doc_id,
        body=body
    ).execute()

    # Insert cell content
    # Note: This is simplified; real implementation needs proper index calculation


def create_campaign_plan_doc(context: Dict[str, Any], folder_id: Optional[str] = None) -> str:
    """
    Create a campaign plan document from template.

    Args:
        context: Campaign context with keys:
            - name: Campaign name
            - client: Client name
            - icp: ICP criteria dict
            - search_criteria: A-leads search criteria
            - validation_prompt: AI validation prompt
            - personas: List of target personas
            - volume: Target volume
        folder_id: Optional Drive folder ID

    Returns:
        Document URL
    """
    doc_id = create_document(f"Campagne Plan: {context['name']}", folder_id)

    # Build content
    content = []

    # Title
    content.append({
        'insertText': {
            'location': {'index': 1},
            'text': f"Campagne Plan: {context['name']}\n\n"
        }
    })

    # Status section
    content.append({
        'insertText': {
            'location': {'index': 1},
            'text': "Status: PENDING REVIEW\n\n"
        }
    })

    # Context section
    content.append({
        'insertText': {
            'location': {'index': 1},
            'text': f"Client: {context.get('client', 'N/A')}\n"
                    f"Target Volume: {context.get('volume', 'N/A')} businesses\n"
                    f"Created: {context.get('created_at', 'Today')}\n\n"
        }
    })

    # ICP Section
    content.append({
        'insertText': {
            'location': {'index': 1},
            'text': "## ICP Definitie\n\n"
        }
    })

    icp = context.get('icp', {})
    for key, value in icp.items():
        content.append({
            'insertText': {
                'location': {'index': 1},
                'text': f"- {key}: {value}\n"
            }
        })

    content.append({
        'insertText': {
            'location': {'index': 1},
            'text': "\n"
        }
    })

    # A-leads Search
    content.append({
        'insertText': {
            'location': {'index': 1},
            'text': "## A-leads Search Criteria\n\n"
        }
    })

    search = context.get('search_criteria', {})
    content.append({
        'insertText': {
            'location': {'index': 1},
            'text': f"```json\n{search}\n```\n\n"
        }
    })

    # Review section
    content.append({
        'insertText': {
            'location': {'index': 1},
            'text': "## Review\n\n"
                    "Actions:\n"
                    "- [ ] ACCEPT - Start execution\n"
                    "- [ ] REJECT - Cancel this plan\n"
                    "- [ ] SUGGEST - Add comments below\n\n"
                    "Feedback:\n"
        }
    })

    write_content(doc_id, content)

    return f"https://docs.google.com/document/d/{doc_id}/edit"


def create_gtm_plan_doc(context: Dict[str, Any], folder_id: Optional[str] = None) -> str:
    """
    Create a GTM plan document from template.

    Args:
        context: GTM context
        folder_id: Optional Drive folder ID

    Returns:
        Document URL
    """
    doc_id = create_document(f"GTM Plan: {context.get('client', 'Unknown')}", folder_id)

    content = []

    content.append({
        'insertText': {
            'location': {'index': 1},
            'text': f"GTM Plan: {context.get('client', 'Unknown')}\n\n"
                    "## Market Analysis\n\n"
                    "### TAM/SAM/SOM\n"
                    "- TAM: \n"
                    "- SAM: \n"
                    "- SOM: \n\n"
                    "## ICP & Personas\n\n"
                    "[Link to persona documents]\n\n"
                    "## Messaging Framework\n\n"
                    "### Value Propositions\n"
                    "- Persona 1: \n"
                    "- Persona 2: \n\n"
                    "## Channel Strategy\n\n"
                    "### Outbound\n"
                    "- Channels: \n"
                    "- Target volume: \n\n"
                    "### Inbound\n"
                    "- Content strategy: \n"
                    "- SEO/SEM: \n\n"
                    "## Campaign Planning\n\n"
                    "| Campaign | ICP | Volume | Timeline | Status |\n"
                    "|----------|-----|--------|----------|--------|\n"
                    "|          |     |        |          |        |\n\n"
                    "## Tools & Stack\n\n"
                    "- CRM: \n"
                    "- Outreach: \n"
                    "- Enrichment: \n\n"
                    "## KPIs & Metrics\n\n"
                    "- MQL target: \n"
                    "- SQL target: \n"
                    "- Revenue target: \n\n"
                    "## Budget & Resources\n\n"
                    "- Tool costs: \n"
                    "- Agency/freelancers: \n"
                    "- Ad spend: \n"
        }
    })

    write_content(doc_id, content)

    return f"https://docs.google.com/document/d/{doc_id}/edit"


if __name__ == '__main__':
    # Test
    context = {
        'name': 'SentioCX-SaaS-March',
        'client': 'SentioCX',
        'icp': {
            'industry': 'Software',
            'country': 'NL,BE',
            'headcount': '50-500',
            'technologies': 'Salesforce'
        },
        'search_criteria': {
            'industry': ['Software'],
            'country': ['NL', 'BE'],
            'headcount': {'min': 50, 'max': 500}
        },
        'volume': 1000
    }

    url = create_campaign_plan_doc(context)
    print(f"Created: {url}")
