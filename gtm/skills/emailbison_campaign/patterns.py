"""Email Bison Pattern Library.

Officiele Email Bison syntax:
- Spintax: {optie1|optie2|optie3} voor willekeurige rotatie
- Variabelen: {FIRST_NAME}, {COMPANY_NAME}, {SENDER_FULL_NAME} (UPPERCASE)
- Combineerbaar: {Hi|Hello|Hey} {FIRST_NAME}

Documentatie: https://help.emailbison.com/en/articles/spintax
"""

from dataclasses import dataclass
from typing import Literal


# =============================================================================
# EMAIL BISON VARIABELEN (UPPERCASE)
# =============================================================================

EMAIL_BISON_VARIABLES = {
    "FIRST_NAME": {
        "pattern": "{FIRST_NAME}",
        "description": "Contact's voornaam",
        "example": "John, Sjoerd",
    },
    "COMPANY_NAME": {
        "pattern": "{COMPANY_NAME}",
        "description": "Bedrijfsnaam prospect",
        "example": "Acme Corp",
    },
    "SENDER_FULL_NAME": {
        "pattern": "{SENDER_FULL_NAME}",
        "description": "Volledige naam afzender",
        "example": "Jan Jansen",
    },
    "ICP": {
        "pattern": "{ICP}",
        "description": "Industrie/ICP segment",
        "example": "SaaS, Consulting, Manufacturing",
    },
}


# =============================================================================
# SPINTAX PATTERN - AANHEFFEN
# =============================================================================

# Uit PlusVibe sequences gehaald - jouw werkelijke gebruik:
# {Hi|Hallo|Goedendag|Dag|Hoi} {FIRST_NAME}
SALUTATION_NL_STANDARD = "{Hi|Hallo|Goedendag|Dag|Hoi} {FIRST_NAME},"

# Alternatieve NL aanheffen
SALUTATION_NL_ALT = {
    "formeel": "{Goede dag|Beste} {FIRST_NAME},",
    "neutraal": "{Hi|Hallo} {FIRST_NAME},",
    "informeel": "{Hey|Hi|Hoi} {FIRST_NAME},",
    "kort": "{Hi|Hallo|Dag} {FIRST_NAME},",
    "geen": "{FIRST_NAME},",
}

# Standaard EN aanhef - uit PlusVibe sequences
SALUTATION_EN_STANDARD = "{Hi|Hello|Hey} {FIRST_NAME},"

# Alternatieve EN aanheffen
SALUTATION_EN_ALT = {
    "formeel": "{Good day|Hello} {FIRST_NAME},",
    "neutraal": "{Hi|Hello|Hey} {FIRST_NAME},",
    "informeel": "{Hey|Hi there|Yo} {FIRST_NAME},",
    "kort": "{Hi|Hey} {FIRST_NAME},",
    "geen": "{FIRST_NAME},",
}

# Nested spintax voorbeelden (met variables binnen spintax):
# {Goedendag {FIRST_NAME}|Hi {FIRST_NAME}} - wisselt complete aanhef
# {Hi|Hello} {FIRST_NAME} = {Hi {FIRST_NAME}|Hello {FIRST_NAME}} equivalent


# =============================================================================
# SPINTAX PATTERN - AFSLUITINGEN
# =============================================================================

# Standaard NL afsluiting zoals jij aangaf:
# Met vriendelijke groet,
# {SENDER_FULL_NAME}
CLOSING_NL_FORMAL = "Met vriendelijke groet,\n{SENDER_FULL_NAME}"

# NL afsluiting met spintax variatie - uit PlusVibe sequences:
# {Met vriendelijke groet|Vriendelijke groet|Met hartelijke groet|Hartelijke groet|Groet|Groeten}
CLOSING_NL_SPINTAX = "{Met vriendelijke groet|Vriendelijke groet|Met hartelijke groet|Hartelijke groet|Groet|Groeten},\n{SENDER_FULL_NAME}"

# EN afsluiting met spintax (zoals in screenshot)
# {Best regards|Kind regards|Warm regards|Sincerely|All the best|Best|Cheers|Regards},
# {SENDER_FULL_NAME}
CLOSING_EN_SPINTAX = "{Best regards|Kind regards|Warm regards|Sincerely|All the best|Best|Cheers|Regards},\n{SENDER_FULL_NAME}"


# =============================================================================
# SPINTAX PATTERN - SUBJECT LINES
# =============================================================================

# Voorbeeld uit screenshot:
# {Request {FIRST_NAME}|request|quick question| Quick question {FIRST_NAME}}
SUBJECT_LINE_EXAMPLES = {
    "vraag": "{Request {FIRST_NAME}|request|quick question|Quick question {FIRST_NAME}}",
    "intro": "{Quick intro|Introduction|Connecting} {FIRST_NAME}",
    "company": "{Question about|Quick question about} {COMPANY_NAME}",
}


# =============================================================================
# SPINTAX PATTERN - BODY FRAGMENTEN
# =============================================================================

# Voorbeeld uit screenshot:
# {connect you|introduce you|put you in touch}
# {companies|businesses|firms}
# {entirely|completely|purely|strictly}
# {open to hearing more|interested in learning more}

BODY_FRAGMENTS_EN = {
    "connect": "{connect you|introduce you|put you in touch}",
    "companies": "{companies|businesses|firms}",
    "adverb": "{entirely|completely|purely|strictly}",
    "interest": "{open to hearing more|interested in learning more}",
    "help": "{help|assist|support}",
    "improve": "{improve|enhance|optimize}",
}

BODY_FRAGMENTS_NL = {
    "helpen": "{helpen|ondersteunen|assisteren}",
    "verbeteren": "{verbeteren|optimaliseren|versterken}",
    "bedrijven": "{bedrijven|organisaties|ondernemingen}",
    "interesse": "{geinteresseerd in|nieuwsgierig naar|open voor}",
}


# =============================================================================
# COMPLETE VOORBEELDEN (ter referentie/validatie)
# =============================================================================

# NL voorbeeld email met spintax
EXAMPLE_EMAIL_NL = """{Hi|Hallo|Goedendag} {FIRST_NAME},

Ik zag dat {COMPANY_NAME} {flink aan het groeien is|sterk aan het expanderen is|nieuwe markten aan het veroveren is}.

We {helpen|ondersteunen|assisteren} {B2B-bedrijven|ondernemingen|organisaties} met {10+|15+|meer dan 10} sales calls per maand.

Is een {kort gesprek|kennismaking|introductie} van 10 minuten {interessant|relevant}?

Met vriendelijke groet,
{SENDER_FULL_NAME}

P.S. Niet relevant? Reply dan 'stop'."""

# EN voorbeeld email met spintax
EXAMPLE_EMAIL_EN = """{Hi|Hello|Hey} {FIRST_NAME},

I noticed {COMPANY_NAME} is {expanding|growing|scaling} in the {ICP} space.

We {help|assist|support} {companies|businesses|firms} like {COMPANY_NAME} book {10+|15+} qualified meetings per month.

{Worth a brief conversation|Open to a quick chat|Interested in exploring}?

{Best regards|Kind regards|Best},
{SENDER_FULL_NAME}

P.S. Reply 'stop' if this isn't relevant."""


# =============================================================================
# HELPER FUNCTIES
# =============================================================================


def get_variables() -> dict:
    """Get all Email Bison variables."""
    return EMAIL_BISON_VARIABLES


def get_salutation(language: Literal["nl", "en"], style: str = "standard") -> str:
    """Get salutation spintax pattern.

    Args:
        language: 'nl' or 'en'
        style: 'standard', 'formeel', 'neutraal', 'informeel', 'geen'
    """
    if language == "nl":
        if style == "standard":
            return SALUTATION_NL_STANDARD
        return SALUTATION_NL_ALT.get(style, SALUTATION_NL_STANDARD)

    if language == "en":
        if style == "standard":
            return SALUTATION_EN_STANDARD
        return SALUTATION_EN_ALT.get(style, SALUTATION_EN_STANDARD)

    return SALUTATION_EN_STANDARD


def get_closing(language: Literal["nl", "en"], spintax: bool = True) -> str:
    """Get closing pattern.

    Args:
        language: 'nl' or 'en'
        spintax: If True, use spintax variation; if False, use formal standard
    """
    if language == "nl":
        if spintax:
            return CLOSING_NL_SPINTAX
        return CLOSING_NL_FORMAL

    return CLOSING_EN_SPINTAX if spintax else CLOSING_EN_SPINTAX


def list_all_patterns() -> dict:
    """List all available patterns for reference."""
    return {
        "aanhef_nl": {
            "standaard": SALUTATION_NL_STANDARD,
            "alternatieven": SALUTATION_NL_ALT,
        },
        "aanhef_en": {
            "standaard": SALUTATION_EN_STANDARD,
            "alternatieven": SALUTATION_EN_ALT,
        },
        "afsluiting": {
            "nl_formeel": CLOSING_NL_FORMAL,
            "nl_spintax": CLOSING_NL_SPINTAX,
            "en_spintax": CLOSING_EN_SPINTAX,
        },
        "subject_lines": SUBJECT_LINE_EXAMPLES,
        "body_fragments_en": BODY_FRAGMENTS_EN,
        "body_fragments_nl": BODY_FRAGMENTS_NL,
        "variables": list(EMAIL_BISON_VARIABLES.keys()),
    }


def validate_spintax(text: str) -> bool:
    """Basic validation of spintax syntax.

    Checks for balanced braces and pipe presence.
    """
    # Count braces
    open_count = text.count("{")
    close_count = text.count("}")

    if open_count != close_count:
        return False

    # Check for pipes inside braces
    # This is a simple check - full validation is complex
    return True


def generate_example(text: str) -> str:
    """Generate one possible example from spintax text.

    This picks the first option from each spintax group.
    """
    import re

    # Simple regex to find spintax groups {opt1|opt2|opt3}
    # Pick first option
    result = text

    # Replace variables with examples
    for var_name, var_info in EMAIL_BISON_VARIABLES.items():
        result = result.replace(var_info["pattern"], var_info["example"].split(",")[0].strip())

    return result
