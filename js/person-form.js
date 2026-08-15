// Dodajanje / urejanje osebe

const urlParams = new URLSearchParams(window.location.search);
const personId = urlParams.get("id");

async function init() {
  await requireAuth();
  if (personId) {
    document.getElementById("delete-btn").style.display = "inline-block";
    document.getElementById("relations-section").style.display = "block";
    document.getElementById("relations-hint").style.display = "none";
    await loadPerson(personId);
    await initRelations();
  }
}

// ---------- POVEZAVE ----------

let allPeople = [];

async function initRelations() {
  const { data, error } = await supabaseClient.from("people").select("id, first_name, last_name").neq("id", personId);
  if (error) { console.error(error.message); return; }
  allPeople = data;

  populateSelect("parent-select", allPeople);
  populateSelect("partner-select", allPeople);
  populateSelect("child-select", allPeople);

  await renderParents();
  await renderPartners();
  await renderChildren();
}

function populateSelect(selectId, people) {
  const select = document.getElementById(selectId);
  select.innerHTML = people.map(p => `<option value="${p.id}">${p.first_name} ${p.last_name || ""}</option>`).join("");
}

function personLabel(id) {
  const p = allPeople.find(p => p.id === id);
  return p ? `${p.first_name} ${p.last_name || ""}` : "?";
}

async function renderParents() {
  const { data } = await supabaseClient.from("parent_child").select("id, parent_id, relation_type").eq("child_id", personId);
  const list = document.getElementById("parents-list");
  list.innerHTML = (data || []).map(r => `
    <li>${personLabel(r.parent_id)} <span class="tag">${r.relation_type}</span>
      <button type="button" class="remove-btn" data-table="parent_child" data-id="${r.id}">×</button>
    </li>`).join("") || "<li class='muted'>Ni dodanih staršev.</li>";
  attachRemoveHandlers();
}

async function renderPartners() {
  const { data } = await supabaseClient.from("partnerships").select("id, person1_id, person2_id, type")
    .or(`person1_id.eq.${personId},person2_id.eq.${personId}`);
  const list = document.getElementById("partners-list");
  list.innerHTML = (data || []).map(r => {
    const otherId = r.person1_id === personId ? r.person2_id : r.person1_id;
    return `<li>${personLabel(otherId)} <span class="tag">${r.type}</span>
      <button type="button" class="remove-btn" data-table="partnerships" data-id="${r.id}">×</button>
    </li>`;
  }).join("") || "<li class='muted'>Ni dodanih partnerjev.</li>";
  attachRemoveHandlers();
}

async function renderChildren() {
  const { data } = await supabaseClient.from("parent_child").select("id, child_id, relation_type").eq("parent_id", personId);
  const list = document.getElementById("children-list");
  list.innerHTML = (data || []).map(r => `
    <li>${personLabel(r.child_id)} <span class="tag">${r.relation_type}</span>
      <button type="button" class="remove-btn" data-table="parent_child" data-id="${r.id}">×</button>
    </li>`).join("") || "<li class='muted'>Ni dodanih otrok.</li>";
  attachRemoveHandlers();
}

function attachRemoveHandlers() {
  document.querySelectorAll(".remove-btn").forEach(btn => {
    btn.onclick = async () => {
      const table = btn.dataset.table;
      const id = btn.dataset.id;
      await supabaseClient.from(table).delete().eq("id", id);
      await renderParents();
      await renderPartners();
      await renderChildren();
    };
  });
}

document.getElementById("add-parent-btn").addEventListener("click", async () => {
  const parentId = document.getElementById("parent-select").value;
  const relationType = document.getElementById("parent-relation-type").value;
  if (!parentId) return;
  const { error } = await supabaseClient.from("parent_child").insert({
    parent_id: parentId, child_id: personId, relation_type: relationType,
  });
  if (error) { alert("Napaka: " + error.message); return; }
  await renderParents();
});

document.getElementById("add-partner-btn").addEventListener("click", async () => {
  const otherId = document.getElementById("partner-select").value;
  const type = document.getElementById("partner-type").value;
  if (!otherId) return;
  const { error } = await supabaseClient.from("partnerships").insert({
    person1_id: personId, person2_id: otherId, type,
  });
  if (error) { alert("Napaka: " + error.message); return; }
  await renderPartners();
});

document.getElementById("add-child-btn").addEventListener("click", async () => {
  const childId = document.getElementById("child-select").value;
  const relationType = document.getElementById("child-relation-type").value;
  if (!childId) return;
  const { error } = await supabaseClient.from("parent_child").insert({
    parent_id: personId, child_id: childId, relation_type: relationType,
  });
  if (error) { alert("Napaka: " + error.message); return; }
  await renderChildren();
});

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

  let error, newId;
  if (personId) {
    ({ error } = await supabaseClient.from("people").update(formData).eq("id", personId));
  } else {
    const user = await getCurrentUser();
    const result = await supabaseClient.from("people").insert({ ...formData, created_by: user.id }).select("id").single();
    error = result.error;
    newId = result.data?.id;
  }

  if (error) {
    alert("Napaka pri shranjevanju: " + error.message);
    return;
  }

  if (!personId && newId) {
    // Novo osebo preusmeri nazaj na isto stran z ID-jem, da lahko doda povezave
    window.location.href = `person.html?id=${newId}`;
  } else {
    window.location.href = "index.html";
  }
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
