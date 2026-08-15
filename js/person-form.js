// Dodajanje / urejanje osebe

const urlParams = new URLSearchParams(window.location.search);
const personId = urlParams.get("id");

async function init() {
  await requireAuth();
  if (personId) {
    document.getElementById("delete-btn").style.display = "inline-block";
    await loadPerson(personId);
  }
}

async function loadPerson(id) {
  const { data, error } = await supabaseClient.from("people").select("*").eq("id", id).single();
  if (error) {
    console.error("Napaka pri nalaganju osebe:", error.message);
    return;
  }
  document.getElementById("first_name").value = data.first_name || "";
  document.getElementById("last_name").value = data.last_name || "";
  document.getElementById("maiden_name").value = data.maiden_name || "";
  document.getElementById("gender").value = data.gender || "O";
  document.getElementById("birth_date").value = data.birth_date || "";
  document.getElementById("birth_place").value = data.birth_place || "";
  document.getElementById("is_deceased").checked = data.is_deceased || false;
  document.getElementById("death_date").value = data.death_date || "";
  document.getElementById("bio").value = data.bio || "";
}

function collectFormData() {
  return {
    first_name: document.getElementById("first_name").value,
    last_name: document.getElementById("last_name").value || null,
    maiden_name: document.getElementById("maiden_name").value || null,
    gender: document.getElementById("gender").value,
    birth_date: document.getElementById("birth_date").value || null,
    birth_place: document.getElementById("birth_place").value || null,
    is_deceased: document.getElementById("is_deceased").checked,
    death_date: document.getElementById("death_date").value || null,
    bio: document.getElementById("bio").value || null,
  };
}

document.getElementById("person-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = collectFormData();

  let error;
  if (personId) {
    ({ error } = await supabaseClient.from("people").update(formData).eq("id", personId));
  } else {
    const user = await getCurrentUser();
    ({ error } = await supabaseClient.from("people").insert({ ...formData, created_by: user.id }));
  }

  if (error) {
    alert("Napaka pri shranjevanju: " + error.message);
    return;
  }
  window.location.href = "index.html";
});

document.getElementById("delete-btn").addEventListener("click", async () => {
  if (!confirm("Si prepričan/-a, da želiš izbrisati to osebo?")) return;
  const { error } = await supabaseClient.from("people").delete().eq("id", personId);
  if (error) {
    alert("Napaka pri brisanju: " + error.message);
    return;
  }
  window.location.href = "index.html";
});

init();
