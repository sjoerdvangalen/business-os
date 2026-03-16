// Manual sync script for PlusVibe leads
// Usage: node scripts/manual-sync-leads.js

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gjhbbyodrbuabfzafzry.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLUSVIBE_API_KEY = process.env.PLUSVIBE_API_KEY;
const PLUSVIBE_WORKSPACE_ID = process.env.PLUSVIBE_WORKSPACE_ID;

if (!SUPABASE_SERVICE_ROLE_KEY || !PLUSVIBE_API_KEY || !PLUSVIBE_WORKSPACE_ID) {
  console.error('Missing required environment variables:');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  console.error('- PLUSVIBE_API_KEY');
  console.error('- PLUSVIBE_WORKSPACE_ID');
  process.exit(1);
}

async function syncLeads() {
  console.log('Starting manual leads sync...');
  
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/sync-plusvibe-leads`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: PLUSVIBE_API_KEY,
          workspace_id: PLUSVIBE_WORKSPACE_ID,
        }),
      }
    );
    
    const result = await response.json();
    console.log('Sync result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Sync failed:', error.message);
  }
}

syncLeads();
