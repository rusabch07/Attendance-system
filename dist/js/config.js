// Paste the public values from Supabase Settings → API. Never put a service-role key here.
export const SUPABASE_URL = 'https://qsczhptvebegufasmtmz.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_xbuQTwRROFsCFbY_fkM4yA_AG2jFOFw';

export const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR_') && SUPABASE_ANON_KEY.length > 40 && !SUPABASE_ANON_KEY.includes('YOUR_');
