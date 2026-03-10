-- ============================================================
-- Dashboard Views — optimized for Next.js dashboard queries
-- ============================================================

-- ── v_client_dashboard: Command Center — one row per active client ──
CREATE OR REPLACE VIEW v_client_dashboard AS
SELECT
  cl.id,
  cl.client_code,
  cl.name,
  cl.client_stage,
  cl.slack_channel_id,
  -- Campaign stats
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'ACTIVE') as active_campaigns,
  COUNT(DISTINCT c.id) as total_campaigns,
  COALESCE(SUM(c.emails_sent), 0) as total_emails_sent,
  COALESCE(SUM(c.replies), 0) as total_replies,
  COALESCE(SUM(c.positive_replies), 0) as total_positive_replies,
  COALESCE(SUM(c.bounces), 0) as total_bounces,
  -- Computed rates
  CASE WHEN SUM(c.emails_sent) > 0
    THEN ROUND(SUM(c.replies)::numeric / SUM(c.emails_sent) * 100, 2)
    ELSE 0 END as reply_rate,
  CASE WHEN SUM(c.emails_sent) > 0
    THEN ROUND(SUM(c.bounces)::numeric / SUM(c.emails_sent) * 100, 2)
    ELSE 0 END as bounce_rate,
  -- Health rollup
  COUNT(DISTINCT c.id) FILTER (WHERE c.health_status = 'CRITICAL') as critical_count,
  COUNT(DISTINCT c.id) FILTER (WHERE c.health_status = 'WARNING') as warning_count,
  CASE
    WHEN COUNT(c.id) FILTER (WHERE c.health_status = 'CRITICAL') > 0 THEN 'CRITICAL'
    WHEN COUNT(c.id) FILTER (WHERE c.health_status = 'WARNING') > 0 THEN 'WARNING'
    ELSE 'HEALTHY'
  END as overall_health,
  -- Infrastructure
  (SELECT COUNT(*) FROM email_inboxes ei WHERE ei.client_id = cl.id) as email_account_count,
  (SELECT COUNT(*) FROM email_inboxes ei WHERE ei.client_id = cl.id AND ei.status = 'connected') as connected_accounts,
  (SELECT COUNT(*) FROM domains d WHERE d.client_id = cl.id) as domain_count,
  -- Meetings (last 30 days)
  (SELECT COUNT(*) FROM meetings m WHERE m.client_id = cl.id
   AND m.created_at >= CURRENT_DATE - 30) as meetings_30d,
  (SELECT COUNT(*) FROM meetings m WHERE m.client_id = cl.id
   AND m.created_at >= CURRENT_DATE - 30
   AND m.booking_status = 'qualified') as qualified_30d,
  -- Contacts
  (SELECT COUNT(*) FROM contacts ct WHERE ct.client_id = cl.id) as total_contacts,
  (SELECT COUNT(*) FROM contacts ct WHERE ct.client_id = cl.id
   AND ct.lead_status = 'interested') as interested_contacts
FROM clients cl
LEFT JOIN campaigns c ON c.client_id = cl.id
WHERE cl.client_stage = 'Active'
GROUP BY cl.id;

-- ── v_meeting_pipeline: Meetings page — all meetings with context ──
CREATE OR REPLACE VIEW v_meeting_pipeline AS
SELECT
  m.id,
  m.client_id,
  cl.name as client_name,
  cl.client_code,
  ct.full_name as contact_name,
  ct.email as contact_email,
  ct.company,
  m.start_time,
  m.end_time,
  m.booking_status,
  m.review_status,
  m.review_notes,
  m.reviewed_at,
  m.recording_url,
  m.source,
  m.created_at,
  o.status as opportunity_status,
  o.value as opportunity_value
FROM meetings m
JOIN clients cl ON cl.id = m.client_id
LEFT JOIN contacts ct ON ct.id = m.contact_id
LEFT JOIN opportunities o ON o.meeting_id = m.id
ORDER BY m.start_time DESC;

-- ── v_lead_funnel: Per-client lead status distribution ──
CREATE OR REPLACE VIEW v_lead_funnel AS
SELECT
  cl.client_code,
  cl.name as client_name,
  ct.client_id,
  ct.lead_status,
  COUNT(*) as count
FROM contacts ct
JOIN clients cl ON cl.id = ct.client_id
WHERE ct.lead_status IS NOT NULL
GROUP BY cl.client_code, cl.name, ct.client_id, ct.lead_status;

-- ── v_infrastructure_health: Domain + inbox health per client ──
CREATE OR REPLACE VIEW v_infrastructure_health AS
SELECT
  cl.client_code,
  cl.name as client_name,
  cl.id as client_id,
  d.id as domain_id,
  d.domain,
  d.spf_status,
  d.dkim_status,
  d.dmarc_status,
  d.health_status as domain_health,
  d.avg_inbox_rate,
  COUNT(ei.id) as total_accounts,
  COUNT(ei.id) FILTER (WHERE ei.status = 'connected') as connected,
  COUNT(ei.id) FILTER (WHERE ei.status = 'disconnected') as disconnected,
  COUNT(ei.id) FILTER (WHERE ei.warmup_status = 'active') as warming,
  COALESCE(SUM(ei.daily_limit), 0) as total_daily_limit,
  ROUND(AVG(ei.latest_inbox_rate), 2) as avg_warmup_health,
  ROUND(AVG(ei.bounce_rate_3d), 2) as avg_bounce_rate
FROM domains d
JOIN clients cl ON cl.id = d.client_id
LEFT JOIN email_inboxes ei ON ei.domain_id = d.id
GROUP BY cl.client_code, cl.name, cl.id, d.id;

-- ── v_sequence_performance: Email step A/B performance ──
CREATE OR REPLACE VIEW v_sequence_performance AS
SELECT
  s.id,
  s.campaign_id,
  c.name as campaign_name,
  cl.client_code,
  s.step_number,
  s.name as step_name,
  s.variation,
  s.sent,
  s.replies,
  s.positive_replies,
  CASE WHEN s.sent > 0
    THEN ROUND(s.replies::numeric / s.sent * 100, 2)
    ELSE 0 END as reply_rate,
  CASE WHEN s.sent > 0
    THEN ROUND(s.positive_replies::numeric / s.sent * 100, 2)
    ELSE 0 END as positive_rate,
  s.is_active,
  s.auto_paused,
  s.pause_reason
FROM email_sequences s
JOIN campaigns c ON c.id = s.campaign_id
JOIN clients cl ON cl.id = c.client_id
ORDER BY cl.client_code, c.name, s.step_number;
