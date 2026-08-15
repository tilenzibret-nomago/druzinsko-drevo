// Avtentikacija - magic link prijava

async function signInWithEmail(email) {
  const { error } = await supabaseClient.auth.signInWithOtp({ email });
  if (error) {
    console.error("Napaka pri prijavi:", error.message);
    return false;
  }
  return true;
}

async function signOut() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

async function getCurrentUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

// Zaščita strani - preusmeri na login, če ni prijavljen
async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
  }
  return user;
}
