/**
 * Shared Railway client for edge functions.
 *
 * Pattern: Edge function = thin trigger → Railway = heavy work.
 * All processing edge functions call Railway via this helper.
 */

const RAILWAY_URL = Deno.env.get('RAILWAY_BATCH_WORKER_URL') ?? ''

export interface RailwayResult {
  success: boolean
  data?: unknown
  error?: string
}

export async function callRailway(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<RailwayResult> {
  if (!RAILWAY_URL) {
    return { success: false, error: 'RAILWAY_BATCH_WORKER_URL not configured' }
  }
  try {
    const response = await fetch(`${RAILWAY_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    if (!response.ok) {
      return {
        success: false,
        error: `Railway ${endpoint} ${response.status}: ${JSON.stringify(data).substring(0, 200)}`,
      }
    }
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: `Railway ${endpoint} invoke failed: ${(error as Error).message}`,
    }
  }
}
