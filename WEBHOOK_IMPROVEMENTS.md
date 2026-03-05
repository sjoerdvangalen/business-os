# Webhook System Improvements

## ✅ Recent Changes
- BOUNCED_EMAIL events are now ignored (not stored)
- Test records cleaned up

## 🔍 Current Issues & Improvement Opportunities

### 1. **EMAIL_SENT Handling - Redundant?**
**Current:** Every sent email is stored in email_threads
**Question:** Do you need to track sent emails, or only replies?
**Suggestion:** If only replies matter, disable EMAIL_SENT to reduce noise

### 2. **Thread Building - Performance**
**Current:** For each reply, we query ALL previous emails with same thread_id
**Issue:** As threads get longer, this gets slower
**Suggestion:** 
- Option A: Only store last 5-10 emails in thread body
- Option B: Store thread once, reference it
- Option C: Keep as-is (simple, works for now)

### 3. **Contact Auto-Creation**
**Current:** If contact doesn't exist, we create it + account
**Issue:** Creates many incomplete contacts from random replies
**Suggestion:** 
- Only create contacts if email domain matches client domain?
- Or: Don't auto-create, just store email without contact link?
- Or: Keep as-is?

### 4. **Reply Classifier**
**Current:** Every reply triggers reply-classifier Edge Function
**Question:** Is this classification actually used?
**Suggestion:** If not used, remove to save compute time

### 5. **Duplicate Prevention**
**Current:** Uses plusvibe_id (should prevent duplicates)
**Check:** Are you seeing duplicate emails in email_threads?
**If yes:** Need to add UNIQUE constraint on plusvibe_id

### 6. **Webhook Logging**
**Current:** Every webhook is logged to webhook_logs
**Issue:** Table grows fast, not cleaned up
**Suggestion:** 
- Add retention (auto-delete logs older than X days)
- Or: Only log errors, not successes

### 7. **EMAIL_SENT Body Storage**
**Current:** Stores full body of every sent email
**Issue:** Takes up space, might not be needed
**Suggestion:** Only store subject + metadata, not full body?

### 8. **Missing Data Enrichment**
**Could add:**
- Reply classification (positive/negative/neutral)
- Intent detection (meeting request, info request, etc.)
- Auto-tagging based on content
- Sentiment analysis

### 9. **Reply Functionality**
**Current:** We store last_email_id for replies
**Missing:** Actual reply sending endpoint
**Need:** Edge function to send reply via PlusVibe API?

### 10. **Monitoring/Alerts**
**Missing:**
- Alert if webhook fails X times
- Alert if no emails received for X hours
- Dashboard for webhook health

---

## ❓ Questions for You:

1. **Do you need EMAIL_SENT tracking?** (Yes/No)
2. **Is reply classification used?** (Yes/No)
3. **Should we auto-create contacts?** (Yes/No)
4. **Do you see duplicate emails?** (Yes/No)
5. **Do you need reply-sending functionality?** (Yes/No)

Tell me which improvements you want, I'll implement them.
