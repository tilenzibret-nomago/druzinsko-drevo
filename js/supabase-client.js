// Supabase konfiguracija
// POZOR: anon key je javen ključ (varen za frontend), NE service_role key!
// Najdeš ga v Supabase dashboardu: Project Settings -> API -> anon public

const SUPABASE_URL = "https://kzwxmvhrxecfmtaskzxb.supabase.co";
const SUPABASE_ANON_KEY = "VSTAVI_SEM_ANON_KEY";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
