// Dodajanje / urejanje osebe

// Pretvorba dd.mm.llll <-> yyyy-mm-dd (baza pričakuje ISO format)
function euToIso(euDate) {
  if (!euDate) return null;
  const match = euDate.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function isoToEu(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

const urlParams = new URLSearchParams(window.location.search);
const personId = urlParams.get("id");

async function init() {
  await requireAuth();
  if (urlParams.get("saved") === "1") {
    const statusEl = document.getElementById("save-status");
    statusEl.textContent = "✓ Oseba je bila uspešno shranjena! Zdaj lahko spodaj dodaš starše, partnerja ali otroke.";
    statusEl.classList.add("visible");
  }
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
  if (people.length === 0) {
    select.innerHTML = `<option value="">— najprej dodaj drugo osebo —</option>`;
  } else {
    select.innerHTML = `<option value="">— izberi osebo —</option>` +
      people.map(p => `<option value="${p.id}">${p.first_name} ${p.last_name || ""}</option>`).join("");
  }
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
  if (!parentId) {
    alert("Najprej izberi osebo iz seznama. Če seznam ne vsebuje osebe, ki jo iščeš, jo najprej dodaj (Nazaj na drevo → + Dodaj osebo).");
    return;
  }
  const { error } = await supabaseClient.from("parent_child").insert({
    parent_id: parentId, child_id: personId, relation_type: relationType,
  });
  if (error) { alert("Napaka: " + error.message); return; }
  await renderParents();
});

document.getElementById("add-partner-btn").addEventListener("click", async () => {
  const otherId = document.getElementById("partner-select").value;
  const type = document.getElementById("partner-type").value;
  if (!otherId) {
    alert("Najprej izberi osebo iz seznama. Če seznam ne vsebuje osebe, ki jo iščeš, jo najprej dodaj (Nazaj na drevo → + Dodaj osebo).");
    return;
  }
  const { error } = await supabaseClient.from("partnerships").insert({
    person1_id: personId, person2_id: otherId, type,
  });
  if (error) { alert("Napaka: " + error.message); return; }
  await renderPartners();
});

document.getElementById("add-child-btn").addEventListener("click", async () => {
  const childId = document.getElementById("child-select").value;
  const relationType = document.getElementById("child-relation-type").value;
  if (!childId) {
    alert("Najprej izberi osebo iz seznama. Če seznam ne vsebuje osebe, ki jo iščeš, jo najprej dodaj (Nazaj na drevo → + Dodaj osebo).");
    return;
  }
  const { error } = await supabaseClient.from("parent_child").insert({
    parent_id: personId, child_id: childId, relation_type: relationType,
  });
  if (error) { alert("Napaka: " + error.message); return; }
  await renderChildren();
});

async function loadPerson(id) {
  const { data, error } = await supabaseClient.from("people").select("*").eq("id", id).single();
  if (error) {
    alert("Te osebe ni bilo mogoče najti (morda je bila izbrisana, ali je povezava zastarela). Preusmerjam te nazaj na drevo.");
    window.location.href = "index.html";
    return;
  }
  document.getElementById("first_name").value = data.first_name || "";
  document.getElementById("last_name").value = data.last_name || "";
  document.getElementById("maiden_name").value = data.maiden_name || "";
  document.getElementById("gender").value = data.gender || "O";
  document.getElementById("birth_date").value = isoToEu(data.birth_date);
  document.getElementById("birth_place").value = data.birth_place || "";
  document.getElementById("is_deceased").checked = data.is_deceased || false;
  document.getElementById("death_date").value = isoToEu(data.death_date);
  document.getElementById("bio").value = data.bio || "";
}

function collectFormData() {
  const birthEu = document.getElementById("birth_date").value;
  const deathEu = document.getElementById("death_date").value;

  if (birthEu && !euToIso(birthEu)) {
    alert("Datum rojstva ni v pravilni obliki. Uporabi dd.mm.llll, npr. 15.08.1950.");
    return null;
  }
  if (deathEu && !euToIso(deathEu)) {
    alert("Datum smrti ni v pravilni obliki. Uporabi dd.mm.llll, npr. 3.4.2010.");
    return null;
  }

  return {
    first_name: document.getElementById("first_name").value,
    last_name: document.getElementById("last_name").value || null,
    maiden_name: document.getElementById("maiden_name").value || null,
    gender: document.getElementById("gender").value,
    birth_date: euToIso(birthEu),
    birth_place: document.getElementById("birth_place").value || null,
    is_deceased: document.getElementById("is_deceased").checked,
    death_date: euToIso(deathEu),
    bio: document.getElementById("bio").value || null,
  };
}

document.getElementById("person-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = collectFormData();
  if (!formData) return;

  let error, newId;
  if (personId) {
    const updateResult = await supabaseClient.from("people").update(formData).eq("id", personId).select("id");
    error = updateResult.error;
    if (!error && (!updateResult.data || updateResult.data.length === 0)) {
      alert("Ta oseba ne obstaja več v bazi (posodobljenih 0 vrstic). Preusmerjam te na drevo.");
      window.location.href = "index.html";
      return;
    }
  } else {
    const user = await getCurrentUser();
    if (!user) {
      alert("Nisi prijavljen. Osveži stran in se ponovno prijavi.");
      return;
    }
    const result = await supabaseClient.from("people").insert({ ...formData, created_by: user.id }).select("id").single();
    console.log("Insert rezultat:", result);
    if (result.error) {
      alert("Napaka pri shranjevanju: " + result.error.message + "\n(Podrobnosti: " + JSON.stringify(result.error) + ")");
      return;
    }
    if (!result.data || !result.data.id) {
      alert("Shranjevanje ni vrnilo ID-ja nove osebe. Preveri Supabase nastavitve.");
      return;
    }
    newId = result.data.id;
  }

  if (error) {
    alert("Napaka pri shranjevanju: " + error.message);
    return;
  }

  if (!personId && newId) {
    // Novo osebo preusmeri nazaj na isto stran z ID-jem, da lahko doda povezave
    window.location.href = `person.html?id=${newId}&saved=1`;
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
