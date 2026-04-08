# Email Bison Spintax & Patronen

> Officiele syntax voor Email Bison sequences. Gebaseerd op werkelijk gebruik in PlusVibe sequences.

---

## Syntax Regels

### 1. Spintax Formaat
Gebruik `{optie1|optie2|optie3}` voor willekeurige rotatie per email:

```
{Hi|Hallo|Goedendag} {FIRST_NAME},
```

Elk bericht krijgt willekeurig één optie:
- "Hi John,"
- "Hallo John,"
- "Goedendag John,"

### 2. Variabelen (UPPERCASE)
| Variabele | Voorbeeld | Beschrijving |
|-----------|-----------|--------------|
| `{FIRST_NAME}` | John, Sjoerd | Contact voornaam |
| `{COMPANY_NAME}` | Acme Corp | Bedrijfsnaam prospect |
| `{SENDER_FULL_NAME}` | Jan Jansen | Volledige naam afzender |
| `{ICP}` | SaaS, Consulting | Industrie segment |

### 3. Nested Spintax
Variabelen kunnen binnen spintax staan:

```
{Goedendag {FIRST_NAME}|Hi {FIRST_NAME}}
```

Dit wisselt complete aanheffen:
- "Goedendag John,"
- "Hi John,"

**Opmerking**: Dit is minder leesbaar dan `{Goedendag|Hi} {FIRST_NAME},` maar functioneel equivalent.

---

## Standaard Patronen

### Aanhef - Nederlands

| Stijl | Pattern |
|-------|---------|
| **Standaard** | `{Hi|Hallo|Goedendag|Dag|Hoi} {FIRST_NAME},` |
| Formeel | `{Goede dag|Beste} {FIRST_NAME},` |
| Neutraal | `{Hi|Hallo} {FIRST_NAME},` |
| Informeel | `{Hey|Hi|Hoi} {FIRST_NAME},` |
| Kort | `{Hi|Hallo|Dag} {FIRST_NAME},` |
| Geen | `{FIRST_NAME},` |

### Aanhef - English

| Stijl | Pattern |
|-------|---------|
| **Standaard** | `{Hi|Hello|Hey} {FIRST_NAME},` |
| Formeel | `{Good day|Hello} {FIRST_NAME},` |
| Neutraal | `{Hi|Hello|Hey} {FIRST_NAME},` |
| Informeel | `{Hey|Hi there|Yo} {FIRST_NAME},` |
| Kort | `{Hi|Hey} {FIRST_NAME},` |
| Geen | `{FIRST_NAME},` |

### Afsluiting - Nederlands

| Stijl | Pattern |
|-------|---------|
| **Formeel** | `Met vriendelijke groet,\n{SENDER_FULL_NAME}` |
| **Spintax** | `{Met vriendelijke groet|Vriendelijke groet|Met hartelijke groet|Hartelijke groet|Groet|Groeten},\n{SENDER_FULL_NAME}` |

### Afsluiting - English

| Stijl | Pattern |
|-------|---------|
| **Spintax** | `{Best regards|Kind regards|Warm regards|Sincerely|All the best|Best|Cheers|Regards},\n{SENDER_FULL_NAME}` |

---

## Subject Lines

Voorbeelden uit PlusVibe sequences:

```
{Request {FIRST_NAME}|request|quick question|Quick question {FIRST_NAME}}
{Quick intro|Introduction|Connecting} {FIRST_NAME}
{Question about|Quick question about} {COMPANY_NAME}
```

---

## Body Fragmenten (Suggesties)

Niet verplicht - gebruik waar relevant:

**EN:**
- `{connect you|introduce you|put you in touch}`
- `{companies|businesses|firms}`
- `{entirely|completely|purely|strictly}`
- `{open to hearing more|interested in learning more}`
- `{help|assist|support}`
- `{improve|enhance|optimize}`

**NL:**
- `{helpen|ondersteunen|assisteren}`
- `{verbeteren|optimaliseren|versterken}`
- `{bedrijven|organisaties|ondernemingen}`
- `{geinteresseerd in|nieuwsgierig naar|open voor}`

---

## Volledige Voorbeelden

### Nederlands
```
{Hi|Hallo|Goedendag} {FIRST_NAME},

Wij hebben ervaring met {bedrijven|organisaties} zoals {COMPANY_NAME}.

Is een kort gesprek van 10 minuten interessant?

{Met vriendelijke groet|Vriendelijke groet},
{SENDER_FULL_NAME}

P.S. Niet relevant? Reply 'stop'.
```

### English
```
{Hi|Hello|Hey} {FIRST_NAME},

We {help|assist} {companies|businesses} like {COMPANY_NAME}.

{Worth a brief conversation|Open to a quick chat}?

{Best regards|Kind regards|Best},
{SENDER_FULL_NAME}

P.S. Reply 'stop' if not relevant.
```

---

## Legacy Syntax (Oude Sequences)

Sommige oudere sequences gebruiken dubbele braces:

```
{{random|Hallo|Hi|Hey}} {{first_name}},
{{random|Best regards|Kind regards}},
{{sender_first_name}} {{sender_last_name}}
```

**Migratie**: Converteer naar Email Bison syntax:
- `{{...}}` → `{...}`
- `{{random|a|b}}` → `{a|b}`
- `{{first_name}}` → `{FIRST_NAME}`

---

## Referenties

- Email Bison Help: https://help.emailbison.com/en/articles/spintax
- Liquid Templates: https://shopify.github.io/liquid/
