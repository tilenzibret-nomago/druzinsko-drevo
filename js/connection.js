// Poišče in nariše natančno sorodstveno pot med dvema izbranima osebama

let allPeopleForConnection = [];
let rawPartnershipsC = [];
let rawParentChildC = [];
let selectedA = null, selectedB = null;

async function loadConnectionData() {
  const [{ data: people }, { data: partnerships }, { data: parentChild }] = await Promise.all([
    supabaseClient.from("people").select("*"),
    supabaseClient.from("partnerships").select("*"),
    supabaseClient.from("parent_child").select("*"),
  ]);
  allPeopleForConnection = people || [];
  rawPartnershipsC = partnerships || [];
  rawParentChildC = parentChild || [];

  setupSearch("search-a", "results-a", "selected-a", (p) => { selectedA = p; checkReady(); });
  setupSearch("search-b", "results-b", "selected-b", (p) => { selectedB = p; checkReady(); });

  document.getElementById("find-btn").addEventListener("click", findAndRenderConnection);
}

function setupSearch(inputId, resultsId, selectedId, onSelect) {
  const input = document.getElementById(inputId);
  const resultsEl = document.getElementById(resultsId);
  const selectedEl = document.getElementById(selectedId);

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { resultsEl.innerHTML = ""; resultsEl.style.display = "none"; return; }
    const matches = allPeopleForConnection.filter(p =>
      `${p.first_name} ${p.last_name || ""} ${p.maiden_name || ""}`.toLowerCase().includes(q)
    ).slice(0, 8);
    resultsEl.innerHTML = matches.map(p =>
      `<div class="connection-result-item" data-id="${p.id}">${p.first_name} ${p.last_name || ""}${p.maiden_name ? " (roj. " + p.maiden_name + ")" : ""}</div>`
    ).join("") || "<div class='connection-result-item muted'>Ni najdenih oseb</div>";
    resultsEl.style.display = "block";

    resultsEl.querySelectorAll(".connection-result-item[data-id]").forEach(el => {
      el.addEventListener("click", () => {
        const person = allPeopleForConnection.find(p => p.id === el.dataset.id);
        selectedEl.textContent = `✓ ${person.first_name} ${person.last_name || ""}`;
        input.value = "";
        resultsEl.style.display = "none";
        onSelect(person);
      });
    });
  });
}

function checkReady() {
  document.getElementById("find-btn").disabled = !(selectedA && selectedB);
}

function findAndRenderConnection() {
  const resultEl = document.getElementById("connection-result");
  if (selectedA.id === selectedB.id) {
    resultEl.innerHTML = "<p class='hint'>Izberi dve različni osebi.</p>";
    return;
  }

  const parentsOf = {};
  rawParentChildC.forEach(r => { (parentsOf[r.child_id] ??= []).push(r.parent_id); });

  // BFS navzgor od A: zabeleži pot do vsakega prednika
  function ancestorPaths(startId) {
    const paths = { [startId]: [startId] };
    let frontier = [startId];
    while (frontier.length) {
      const next = [];
      for (const id of frontier) {
        for (const pid of (parentsOf[id] || [])) {
          if (!paths[pid]) {
            paths[pid] = [...paths[id], pid];
            next.push(pid);
          }
        }
      }
      frontier = next;
    }
    return paths;
  }

  const pathsA = ancestorPaths(selectedA.id);
  const pathsB = ancestorPaths(selectedB.id);

  // Poišči najbližjega skupnega prednika (najkrajša skupna pot)
  let bestCommon = null, bestLen = Infinity;
  for (const ancId in pathsA) {
    if (pathsB[ancId]) {
      const len = pathsA[ancId].length + pathsB[ancId].length;
      if (len < bestLen) { bestLen = len; bestCommon = ancId; }
    }
  }

  if (!bestCommon) {
    // Ni skupnega prednika po krvi - preveri, ali sta povezana prek partnerstva (npr. zakonca)
    const directPartner = rawPartnershipsC.find(pt =>
      (pt.person1_id === selectedA.id && pt.person2_id === selectedB.id) ||
      (pt.person2_id === selectedA.id && pt.person1_id === selectedB.id)
    );
    if (directPartner) {
      renderChain([selectedA.id, selectedB.id], "partner");
    } else {
      resultEl.innerHTML = "<p class='hint'>Ni najdene skupne krvne povezave med tema dvema osebama v trenutnih podatkih.</p>";
    }
    return;
  }

  const upPath = pathsA[bestCommon];        // A -> ... -> skupni prednik
  const downPath = [...pathsB[bestCommon]].reverse(); // skupni prednik -> ... -> B
  const fullChain = [...upPath, ...downPath.slice(1)];
  renderChain(fullChain, "blood");
}

function personById(id) {
  return allPeopleForConnection.find(p => p.id === id);
}

function isoToEuC(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function renderChain(chain, type) {
  const resultEl = document.getElementById("connection-result");

  if (type === "partner") {
    resultEl.innerHTML = `
      <div class="chain-wrap">
        <div class="chain-row">
          ${personCardHtml(chain[0])}
          <div class="chain-connector partner-connector">💍 partnerja</div>
          ${personCardHtml(chain[1])}
        </div>
      </div>`;
    return;
  }

  const cards = chain.map((id, i) => {
    const arrow = i < chain.length - 1 ? `<div class="chain-connector">↓</div>` : "";
    return personCardHtml(id) + arrow;
  }).join("");

  resultEl.innerHTML = `
    <div class="chain-wrap">
      <p class="chain-summary">Pot: ${chain.length} oseb, ${chain.length - 1} korakov</p>
      <div class="chain-column">${cards}</div>
    </div>`;
}

function personCardHtml(id) {
  const p = personById(id);
  if (!p) return "";
  const genderClass = p.gender === "M" ? "male" : p.gender === "F" ? "female" : "other";
  const lifespan = p.birth_date ? `r. ${isoToEuC(p.birth_date)}` : "";
  return `
    <div class="chain-card ${genderClass}" onclick="openEditPanel('${p.id}')" data-id="${p.id}">
      <div class="chain-card-avatar">${p.photo_url ? `<img src="${p.photo_url}" alt="">` : "👤"}</div>
      <div class="chain-card-info">
        <div class="chain-card-name">${p.first_name} ${p.last_name || p.maiden_name || ""}</div>
        <div class="chain-card-meta">${lifespan}</div>
      </div>
    </div>`;
}
