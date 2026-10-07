/* STICHA Supabase client bridge. */
(function () {
  'use strict';
  const config = window.STICHA_SUPABASE_CONFIG;
  if (!config || !config.url || !config.anonKey) {
    console.warn('STICHA: Supabase configuration is missing.');
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('STICHA: Supabase JS client failed to load.');
    return;
  }
  try {
    window.STICHA_SUPABASE = window.STICHA_SUPABASE || {};
    window.STICHA_SUPABASE.client = window.supabase.createClient(
      config.url.replace(/\/$/, ''),
      config.anonKey
    );
    window.STICHA_SUPABASE.isReady = true;
    console.info('STICHA: Supabase client ready.');
  } catch (error) {
    console.error('STICHA: Could not initialize Supabase.', error);
  }
})();
