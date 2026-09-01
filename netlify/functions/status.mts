import { supabaseRequest } from './_shared/supabase.mts'

// GET /api/status - the freshness stamp. When the Austin feed was last imported.

export default async () => {
  try {
    const response = await supabaseRequest(
      'data_sources?select=retrieved_at&status=eq.success&order=retrieved_at.desc&limit=1',
    )
    const rows = (await response.json()) as Array<{ retrieved_at: string }>
    return new Response(JSON.stringify({ lastImportAt: rows[0]?.retrieved_at ?? null }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400, durable',
      },
    })
  } catch (error) {
    console.error(`Status lookup failed: ${error instanceof Error ? error.message : error}`)
    return Response.json({ lastImportAt: null })
  }
}

export const config = { path: '/api/status' }
