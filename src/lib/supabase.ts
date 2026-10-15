import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);
export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;
