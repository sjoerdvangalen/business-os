import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function analyze() {
  console.log('🔍 EMAIL THREADS ANALYSE\n')
  console.log('='.repeat(60))

  // 1. Totalen
  const { count: totalThreads } = await supabase
    .from('email_threads')
    .select('*', { count: 'exact', head: true })
  
  const { count: totalContacts } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })

  const { count: orphanCount } = await supabase
    .from('email_threads')
    .select('*', { count: 'exact', head: true })
    .is('lead_id', null)

  console.log(`\n📊 TOTALEN`)
  console.log(`   Total threads:     ${totalThreads?.toLocaleString() || 0}`)
  console.log(`   Total contacts:    ${totalContacts?.toLocaleString() || 0}`)
  console.log(`   Orphan threads:    ${orphanCount?.toLocaleString() || 0} (${((orphanCount || 0) / (totalThreads || 1) * 100).toFixed(1)}%)`)

  // 2. Sample orphan threads
  const { data: orphanSample } = await supabase
    .from('email_threads')
    .select('id, from_email, to_email, direction, sent_at, thread_id')
    .is('lead_id', null)
    .order('sent_at', { ascending: false })
    .limit(10)

  console.log(`\n📝 SAMPLE ORPHAN THREADS (laatste 10)`)
  orphanSample?.forEach(t => {
    const email = t.direction === 'inbound' ? t.from_email : t.to_email
    console.log(`   ${email?.padEnd(35)} | ${t.direction?.padEnd(8)} | ${t.sent_at?.split('T')[0]}`)
  })

  // 3. Check welke orphan emails bestaan in contacts
  const { data: orphanEmails } = await supabase
    .from('email_threads')
    .select('from_email')
    .is('lead_id', null)
    .eq('direction', 'inbound')

  const uniqueEmails = [...new Set(orphanEmails?.map(e => e.from_email?.toLowerCase().trim()).filter(Boolean) || [])]
  
  console.log(`\n📧 UNIEKE EMAIL ADRESSEN IN ORPHAN THREADS: ${uniqueEmails.length}`)

  if (uniqueEmails.length > 0) {
    // Check welke bestaan in contacts (per batch van 100)
    const batchSize = 100
    let matchableCount = 0
    
    for (let i = 0; i < Math.min(uniqueEmails.length, 500); i += batchSize) {
      const batch = uniqueEmails.slice(i, i + batchSize)
      const { data: matches } = await supabase
        .from('leads')
        .select('email')
        .in('email', batch)
      
      matchableCount += matches?.length || 0
    }

    console.log(`\n✅ KUNNEN GEKOPPELD WORDEN: ${matchableCount} emails`)
    console.log(`❌ MOETEN NOG GESYNCT WORDEN: ${uniqueEmails.length - matchableCount} emails`)

    if (matchableCount > 0) {
      console.log(`\n🚀 RUN SUPABASE MIGRATIE OM TE REPAREREN:`)
      console.log(`   20260309000001_repair_thread_contacts.sql`)
    }
  }

  // 4. Check orphaned FKs
  const { data: allThreadsWithContact } = await supabase
    .from('email_threads')
    .select('lead_id')
    .not('lead_id', 'is', null)
    .limit(1000)

  const contactIds = [...new Set(allThreadsWithContact?.map(t => t.lead_id) || [])]
  
  if (contactIds.length > 0) {
    const { data: existingContacts } = await supabase
      .from('leads')
      .select('id')
      .in('id', contactIds.slice(0, 100))
    
    const existingIds = new Set(existingContacts?.map(c => c.id) || [])
    const orphanedFks = contactIds.filter(id => !existingIds.has(id))
    
    if (orphanedFks.length > 0) {
      console.log(`\n⚠️  ORPHANED FOREIGN KEYS: ${orphanedFks.length} threads verwijzen naar niet-bestaande contacts`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Analyse compleet')
}

analyze().catch(console.error)