import { supabase } from '@/lib/supabase';

export type TeamMember = {
  user_id: string;
  member_name: string;
  role: 'owner' | 'staff';
  joined_at: string;
};

export async function listBusinessTeam(): Promise<TeamMember[]> {
  if (!supabase) throw new Error('Connect to the internet to load your shop team.');
  const { data, error } = await supabase.rpc('list_business_team');
  if (error) throw new Error(error.message || 'The shop team could not be loaded.');
  return (data ?? []) as TeamMember[];
}
