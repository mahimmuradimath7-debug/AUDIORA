/**
 * Client-side Supabase helper for Audiora.
 * Uses native browser fetch to communicate with Supabase REST & Storage APIs.
 */

let supabaseConfig = null;

export function setSupabaseConfig(config) {
  supabaseConfig = config?.supabase?.enabled ? config.supabase : null;
}

export function getSupabaseConfig() {
  return supabaseConfig;
}

export async function checkSupabaseHealth() {
  if (!supabaseConfig) return { connected: false, message: 'Supabase not configured' };
  try {
    const res = await fetch(`${supabaseConfig.url}/storage/v1/bucket`, {
      headers: {
        apikey: supabaseConfig.key,
        Authorization: `Bearer ${supabaseConfig.key}`,
      },
    });
    return {
      connected: res.ok,
      url: supabaseConfig.url,
      project: supabaseConfig.url.replace(/^https?:\/\/([^.]+).*/, '$1'),
    };
  } catch {
    return { connected: false, url: supabaseConfig.url };
  }
}
