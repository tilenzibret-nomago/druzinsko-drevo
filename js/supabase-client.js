// Supabase konfiguracija
// POZOR: anon key je javen ključ (varen za frontend), NE service_role key!
// Najdeš ga v Supabase dashboardu: Project Settings -> API -> anon public

const SUPABASE_URL = "https://kzwxmvhrxecfmtaskzxb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6d3htdmhyeGVjZm10YXNrenhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3OTEzMzMsImV4cCI6MjEwMjM2NzMzM30.6lYqjAjJbqDAf87BzUMvm9NCGsIdE8mUJLSWNtax0dU";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
