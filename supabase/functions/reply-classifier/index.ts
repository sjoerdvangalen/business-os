import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Reply Classifier — categorizes every reply into actionable buckets
 *
 * Categories:
 * - NOT_INTERESTED: Explicit rejection
 * - BLOCKLIST: Hostile / legal threats / spam complaints
 * - FUTURE_REQUEST: Timing not right, reach out later
 * - MEETING_REQUEST: Wants to schedule a call
 * - INFO_REQUEST: Wants more information
 * - OOO: Out of office / automatic reply
 * - POSITIVE: General positive interest
 * - NEUTRAL: No clear intent
 *
 * Method: Keyword matching + pattern recognition (no LLM needed for 90%+ accuracy)
 * Called by webhook-receiver after each reply.
 */

// Classification keywords — ordered by priority (first match wins)
const CLASSIFICATION_RULES: Array<{
  category: string
  keywords: string[]
  patterns?: RegExp[]
}> = [
  {
    category: 'OOO',
    keywords: [
      'out of office', 'on vacation', 'away from', 'automatic reply', 'auto-reply',
      'autoreply', 'afwezig', 'niet bereikbaar', 'op vakantie', 'buiten kantoor',
      'i am currently out', 'i will be out', 'limited access to email',
      'return on', 'back on', 'will return', 'be back',
    ],
    patterns: [
      /I('m| am| will be) (out of|away|on leave)/i,
      /automatic(ally)? (generated|reply|response)/i,
      /This is an auto(matic|mated)/i,
    ],
  },
  {
    category: 'BLOCKLIST',
    keywords: [
      'spam', 'reported', 'legal action', 'lawyer', 'attorney',
      'cease and desist', 'gdpr violation', 'data protection', 'regulatory',
      'reported to', 'filing a complaint', 'blocking your',
      'aangifte', 'advocaat', 'juridische stappen',
    ],
  },
  {
    category: 'NOT_INTERESTED',
    keywords: [
      'not interested', 'no thanks', 'no thank you', 'unsubscribe',
      'remove me', 'stop emailing', 'stop sending', 'take me off',
      'don\'t contact', 'do not contact', 'don\'t email', 'not for us',
      'not relevant', 'we\'re not looking', 'we are not looking',
      'pass on this', 'not a fit', 'no need', 'doesn\'t apply',
      'niet geinteresseerd', 'geen interesse', 'nee bedankt', 'uitschrijven',
      'verwijder mij', 'stop met mailen', 'niet van toepassing',
      'we don\'t need', 'we already have', 'happy with our current',
    ],
  },
  {
    category: 'MEETING_REQUEST',
    keywords: [
      'let\'s chat', 'schedule a call', 'book a meeting', 'set up a call',
      'when are you available', 'let\'s connect', 'happy to chat',
      'let\'s discuss', 'book some time', 'schedule a demo', 'set up a meeting',
      'put some time', 'calendar link', 'calendly', 'send me your calendar',
      'let\'s hop on', 'jump on a call', 'quick call', 'free for a call',
      'laten we bellen', 'afspraak maken', 'wanneer kun je', 'laten we een call',
      'plan een meeting', 'stuur je agenda', 'demo inplannen',
      'let me know when', 'pick a time', 'works for me',
    ],
    patterns: [
      /(?:how about|what about|does)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|next week)/i,
      /(?:free|available)\s+(?:this|next)\s+(?:week|Monday|Tuesday|Wednesday|Thursday|Friday)/i,
      /let'?s?\s+(?:set up|schedule|book|plan)/i,
    ],
  },
  {
    category: 'INFO_REQUEST',
    keywords: [
      'tell me more', 'send more info', 'more information',
      'how does it work', 'what\'s the pricing', 'pricing',
      'case study', 'case studies', 'examples', 'references',
      'sounds interesting', 'intrigued', 'curious',
      'can you explain', 'what exactly', 'how do you',
      'meer informatie', 'hoe werkt het', 'wat kost het', 'kosten',
      'vertel meer', 'voorbeelden', 'referenties', 'klinkt interessant',
      'send me details', 'share more', 'elaborate',
    ],
  },
  {
    category: 'FUTURE_REQUEST',
    keywords: [
      'not now', 'not right now', 'reach out later', 'not the right time',
      'next quarter', 'next year', 'in a few months', 'circle back',
      'touch base later', 'revisit', 'come back to me', 'maybe later',
      'after the summer', 'after q1', 'after q2', 'after q3', 'after q4',
      'busy right now', 'too busy', 'in the future',
      'nu niet', 'later terug', 'niet het juiste moment', 'volgend kwartaal',
      'na de zomer', 'over een paar maanden', 'later opnieuw',
      'check back in', 'follow up in', 'ping me in',
    ],
    patterns: [
      /(?:reach out|contact me|try again|circle back)\s+(?:in|after|next)\s+/i,
      /(?:maybe|perhaps)\s+(?:in|after|next)\s+(?:Q[1-4]|January|February|March|April|May|June|July|August|September|October|November|December)/i,
    ],
  },
  {
    category: 'POSITIVE',
    keywords: [
      'interested', 'love to learn', 'would like to', 'sounds great',
      'sounds good', 'i\'m in', 'count me in', 'definitely',
      'absolutely', 'yes please', 'sign me up', 'let\'s do it',
      'great timing', 'perfect timing', 'exactly what we need',
      'ja graag', 'heel interessant', 'klinkt goed', 'helemaal mee eens',
      'we need this', 'been looking for', 'this is great',
    ],
  },
]

function classifyReply(body: string, subject: string): { category: string; confidence: number; matchedKeyword: string } {
  const text = `${subject} ${body}`.toLowerCase()

  // Strip HTML tags
  const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

  for (const rule of CLASSIFICATION_RULES) {
    // Check keywords
    for (const kw of rule.keywords) {
      if (cleanText.includes(kw.toLowerCase())) {
        return { category: rule.category, confidence: 0.85, matchedKeyword: kw }
      }
    }

    // Check regex patterns
    if (rule.patterns) {
      for (const pattern of rule.patterns) {
        if (pattern.test(cleanText)) {
          return { category: rule.category, confidence: 0.75, matchedKeyword: pattern.source }
        }
      }
    }
  }

  return { category: 'NEUTRAL', confidence: 0.5, matchedKeyword: 'none' }
}

// Extract follow-up date from text for FUTURE_REQUEST
function extractFollowUpDate(text: string): string | null {
  const now = new Date()
  const lower = text.toLowerCase()

  if (lower.includes('next quarter') || lower.includes('volgend kwartaal')) {
    const month = now.getMonth()
    const nextQuarterMonth = Math.ceil((month + 1) / 3) * 3
    const date = new Date(now.getFullYear(), nextQuarterMonth, 1)
    return date.toISOString().split('T')[0]
  }
  if (lower.includes('next year') || lower.includes('volgend jaar')) {
    return `${now.getFullYear() + 1}-01-15`
  }
  if (lower.includes('few months') || lower.includes('paar maanden')) {
    const date = new Date(now)
    date.setMonth(date.getMonth() + 3)
    return date.toISOString().split('T')[0]
  }
  if (lower.includes('after the summer') || lower.includes('na de zomer')) {
    return `${now.getFullYear()}-09-01`
  }
  // Default: 3 months from now
  const date = new Date(now)
  date.setMonth(date.getMonth() + 3)
  return date.toISOString().split('T')[0]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const {
      contact_id,
      contact_email,
      campaign_id,
      campaign_name,
      client_id,
      plusvibe_camp_id,
      reply_body,
      subject,
    } = await req.json()

    // Classify the reply
    const { category, confidence, matchedKeyword } = classifyReply(reply_body || '', subject || '')
    console.log(`Classified ${contact_email}: ${category} (${confidence}) via "${matchedKeyword}"`)

    // Update contact with classification
    if (contact_id) {
      const updateData: Record<string, unknown> = {
        reply_classification: category,
        classified_at: new Date().toISOString(),
      }

      // Set follow_up_date for FUTURE_REQUEST
      if (category === 'FUTURE_REQUEST') {
        updateData.follow_up_date = extractFollowUpDate(reply_body || '')
      }

      // Update lead_status based on classification
      if (category === 'MEETING_REQUEST') updateData.lead_status = 'meeting_booked'
      else if (category === 'POSITIVE' || category === 'INFO_REQUEST') updateData.lead_status = 'interested'
      else if (category === 'NOT_INTERESTED') updateData.lead_status = 'not_interested'
      else if (category === 'BLOCKLIST') updateData.lead_status = 'blocklisted'

      await supabase.from('contacts').update(updateData).eq('id', contact_id)
    }

    // Log classification to agent_memory
    await supabase.from('agent_memory').insert({
      agent_id: 'reply-classifier',
      memory_type: 'classification_log',
      content: `${contact_email} → ${category} (${confidence}) in ${campaign_name || 'unknown'}`,
      metadata: {
        contact_id,
        contact_email,
        campaign_id,
        campaign_name,
        client_id,
        category,
        confidence,
        matched_keyword: matchedKeyword,
        reply_preview: (reply_body || '').substring(0, 200),
      },
    })

    // Call lead-router for actionable classifications
    if (['MEETING_REQUEST', 'POSITIVE', 'INFO_REQUEST', 'NOT_INTERESTED', 'BLOCKLIST', 'FUTURE_REQUEST'].includes(category)) {
      const routerUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/lead-router`
      await fetch(routerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          contact_id,
          contact_email,
          campaign_id,
          campaign_name,
          client_id,
          plusvibe_camp_id,
          category,
          confidence,
          reply_preview: (reply_body || '').substring(0, 200),
          follow_up_date: category === 'FUTURE_REQUEST' ? extractFollowUpDate(reply_body || '') : null,
        }),
      })
    }

    return new Response(
      JSON.stringify({ success: true, category, confidence, matchedKeyword }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Classifier error:', (error as Error).message)
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
