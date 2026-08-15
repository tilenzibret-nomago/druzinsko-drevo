// Iskalni in sortirni seznam vseh oseb

let allPeopleCache = [];

function isoToEu(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

async function loadPeopleList() {
  const container = document.getElementById("people-list");
  const { data, error } = await supabaseClient.from("people").select("*").order("first_name");
  if (error) {
    container.innerHTML = "<p class='empty-state'>Napaka pri nalaganju.</p>";
    return;
  }
  allPeopleCache = data;
  renderList();
}

function renderList() {
  const container = document.getElementById("people-list");
  const search = document.getElementById("search-input").value.trim().toLowerCase();
  const sortBy = document.getElementById("sort-select").value;

  let filtered = allPeopleCache.filter(p => {
    const full = `${p.first_name} ${p.last_name || ""} ${p.maiden_name || ""}`.toLowerCase();
    return full.includes(search);
  });

  filtered.sort((a, b) => {
    if (sortBy === "birth") return (a.birth_date || "9999").localeCompare(b.birth_date || "9999");
    if (sortBy === "last_name") return (a.last_name || "").localeCompare(b.last_name || "");
    return `${a.first_name}`.localeCompare(b.first_name);
  });

  document.getElementById("result-count").textContent = `${filtered.length} od ${allPeopleCache.length} oseb`;

  container.innerHTML = filtered.map(p => {
    const lifespan = p.is_deceased
      ? `${isoToEu(p.birth_date) || "?"} – † ${isoToEu(p.death_date) || "?"}`
      : (p.birth_date ? `r. ${isoToEu(p.birth_date)}` : "");
    const maiden = p.maiden_name ? ` <span class="maiden">(roj. ${p.maiden_name})</span>` : "";
    const genderClass = p.gender === "M" ? "male" : p.gender === "F" ? "female" : "other";

    return `
      <div class="person-row ${genderClass}" data-id="${p.id}">
        <div class="person-avatar">${p.photo_url ? `<img src="${p.photo_url}" alt="">` : "👤"}</div>
        <div class="person-info">
          <div class="person-name">${p.first_name} ${p.last_name || ""}${maiden}</div>
          <div class="person-meta">${lifespan}${p.birth_place ? " · " + p.birth_place : ""}</div>
        </div>
        <div class="person-arrow">→</div>
      </div>`;
  }).join("") || "<p class='empty-state'>Ni najdenih oseb.</p>";

  container.querySelectorAll(".person-row").forEach(row => {
    row.addEventListener("click", () => openEditPanel(row.dataset.id));
  });
}

document.getElementById("search-input").addEventListener("input", renderList);
document.getElementById("sort-select").addEventListener("change", renderList);
