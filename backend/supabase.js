/**
 * Supabase client and sync service for Audiora using Node.js native fetch.
 * Works out of the box with publishable/anon and service-role keys.
 */

export class SupabaseService {
  constructor(options = {}) {
    this.url = (options.url ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
    this.key = (options.key ?? process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_KEY ?? '').trim();
    this.enabled = Boolean(this.url && this.key);
  }

  get headers() {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Health check / ping to Supabase.
   */
  async checkStatus() {
    if (!this.enabled) {
      return { enabled: false, message: 'Supabase credentials not configured.' };
    }
    try {
      const response = await fetch(`${this.url}/storage/v1/bucket`, {
        headers: this.headers,
        signal: AbortSignal.timeout(5000),
      });
      const ok = response.ok;
      return {
        enabled: true,
        url: this.url,
        reachable: ok,
        status: response.status,
      };
    } catch (err) {
      return {
        enabled: true,
        url: this.url,
        reachable: false,
        error: err.message,
      };
    }
  }

  /**
   * Fetch all episodes stored in the Supabase 'episodes' table.
   * Returns null if table does not exist or request fails.
   */
  async fetchEpisodes() {
    if (!this.enabled) return null;
    try {
      const response = await fetch(
        `${this.url}/rest/v1/episodes?select=*&order=publishedAt.desc`,
        {
          headers: this.headers,
          signal: AbortSignal.timeout(6000),
        },
      );
      if (!response.ok) return null;
      const data = await response.json();
      return Array.isArray(data) ? data : null;
    } catch {
      return null;
    }
  }

  /**
   * Save / sync an episode to the Supabase 'episodes' table.
   */
  async saveEpisode(episode) {
    if (!this.enabled || !episode) return false;
    try {
      const response = await fetch(`${this.url}/rest/v1/episodes`, {
        method: 'POST',
        headers: {
          ...this.headers,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(episode),
        signal: AbortSignal.timeout(8000),
      });
      return response.ok;
    } catch (err) {
      console.warn('Supabase episode sync skipped:', err.message);
      return false;
    }
  }
}

export function createSupabase(options) {
  return new SupabaseService(options);
}
