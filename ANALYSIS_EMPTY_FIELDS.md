# Analyse: Waarom velden leeg zijn in email_threads

## 🔴 Probleem 1: plusvibe_id wordt niet correct gevuld

### Huidige code:
```javascript
const emailId = payload.last_email_id || 
                payload.message_id || 
                payload.email_id || 
                payload.id || 
                `reply-${Date.now()}-${random}`

plusvibe_id: emailId,
```

### Wat er mis gaat:
- Als PlusVibe webhook GEEN `last_email_id`, `message_id`, `email_id`, of `id` stuurt
- Dan valt de code terug op een **zelf-gegenereerde** ID: `reply-123456789-abc`
- Dit is NIET het echte PlusVibe ID
- Resultaat: `plusvibe_id` lijkt gevuld, maar is een fake ID

### PlusVibe stuurt WEL (volgens documentatie):
- `last_email_id` - Dit is het belangrijkste ID
- `message_id` - RFC-822 message ID

### Oplossing:
Loggen wat PlusVibe werkelijk stuurt om te zien welke velden ontbreken.

---

## 🔴 Probleem 2: contact_id is NULL

### Waarom:
- Contact wordt gezocht via `leadEmail` of `plusvibeLeadId`
- Als contact niet bestaat in database → `contact_id` blijft NULL
- Dit is OK als we niet willen auto-createn

### Oplossing:
Contact creatie werkt al correct (alleen als niet gevonden).

---

## 🔴 Probleem 3: campaign_id is NULL

### Waarom:
- Campaign wordt gezocht via `plusvibeCampId` (camp_id) of `campaignName`
- Als campaign niet bestaat → `campaign_id` is NULL
- Dit is een lookup probleem

### Oplossing:
Zorg dat campaigns gesynced zijn van PlusVibe naar Supabase.

---

## 🔴 Probleem 4: email_inbox_id is NULL

### Waarom:
- Inbox wordt gezocht via `plusvibeEmailAccountId` (uit payload.email_account_id)
- Als inbox niet bestaat in `email_inboxes` tabel → NULL

### Oplossing:
Zorg dat email inboxes gesynced zijn van PlusVibe.

---

## 🔴 Probleem 5: thread_id is NULL

### Waarom:
- `thread_id` komt uit `payload.thread_id`
- Als PlusVibe dit niet stuurt (bijv. bij EMAIL_SENT ipv REPLY), dan is het NULL

### Dit is OK:
- Alleen replies hebben een thread_id
- Nieuwe emails (EMAIL_SENT) hebben geen thread_id

---

## 🛠️ Actieplan

### Stap 1: Debug logging toevoegen
Zie wat PlusVibe werkelijk stuurt in de webhook payload.

### Stap 2: Verplichte velden check
Als essentiële velden ontbreken, log error maar sla nog steeds op.

### Stap 3: Kolom naam check
Is er misschien een typefout in kolomnamen?
