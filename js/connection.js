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

  const parentsOf = {}, childrenOf = {};
  rawParentChildC.forEach(r => {
    (parentsOf[r.child_id] ??= []).push(r.parent_id);
    (childrenOf[r.parent_id] ??= []).push(r.child_id);
  });
  const spousesOf = {};
  rawPartnershipsC.forEach(r => {
    (spousesOf[r.person1_id] ??= []).push(r.person2_id);
    (spousesOf[r.person2_id] ??= []).push(r.person1_id);
  });

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

  let bestCommon = null, bestLen = Infinity;
  for (const ancId in pathsA) {
    if (pathsB[ancId]) {
      const len = pathsA[ancId].length + pathsB[ancId].length;
      if (len < bestLen) { bestLen = len; bestCommon = ancId; }
    }
  }

  const relationLabel = computeRelationLabel(selectedA, selectedB, parentsOf, childrenOf, spousesOf, pathsA, pathsB, bestCommon);

  if (!bestCommon) {
    const directPartner = rawPartnershipsC.find(pt =>
      (pt.person1_id === selectedA.id && pt.person2_id === selectedB.id) ||
      (pt.person2_id === selectedA.id && pt.person1_id === selectedB.id)
    );
    if (directPartner) {
      renderChain([selectedA.id, selectedB.id], "partner", relationLabel);
    } else {
      resultEl.innerHTML = "<p class='hint'>Ni najdene skupne krvne povezave med tema dvema osebama v trenutnih podatkih.</p>";
    }
    return;
  }

  const upPath = pathsA[bestCommon];
  const downPath = [...pathsB[bestCommon]].reverse();
  const fullChain = [...upPath, ...downPath.slice(1)];
  renderChain(fullChain, "blood", relationLabel);
}

// Izračuna berljiv naziv sorodstva osebe B glede na osebo A
function computeRelationLabel(personA, personB, parentsOf, childrenOf, spousesOf, pathsA, pathsB, bestCommon) {
  const label = (id, male, female, neutral) => {
    return personB.gender === "M" ? male : personB.gender === "F" ? female : (neutral || male);
  };
  const name = `${personB.first_name} ${personB.last_name || personB.maiden_name || ""}`.trim();

  if (!bestCommon) return `${name} ni krvni sorodnik.`;

  const upSteps = pathsA[bestCommon].length - 1; // koliko generacij gor od A do skupnega prednika
  const downSteps = pathsB[bestCommon].length - 1; // koliko generacij dol od skupnega prednika do B

  let relation;
  if (bestCommon === personB.id) {
    // B je neposredni prednik A
    if (upSteps === 1) relation = label(personB.id, "oče", "mati");
    else if (upSteps === 2) relation = label(personB.id, "dedek", "babica");
    else if (upSteps === 3) relation = label(personB.id, "pradedek", "prababica");
    else relation = `prednik (${upSteps}. koleno)`;
  } else if (bestCommon === personA.id) {
    // B je neposredni potomec A
    if (downSteps === 1) relation = label(personB.id, "sin", "hči");
    else if (downSteps === 2) relation = label(personB.id, "vnuk", "vnukinja");
    else if (downSteps === 3) relation = label(personB.id, "pravnuk", "pravnukinja");
    else relation = `potomec (${downSteps}. koleno)`;
  } else if (upSteps === 1 && downSteps === 1) {
    relation = label(personB.id, "brat", "sestra");
  } else if (upSteps === 2 && downSteps === 1) {
    relation = label(personB.id, "stric", "teta");
  } else if (upSteps === 1 && downSteps === 2) {
    relation = label(personB.id, "nečak", "nečakinja");
  } else if (upSteps === 2 && downSteps === 2) {
    relation = label(personB.id, "bratranec", "sestrična") + " (v prvem kolenu) — oba sta vnuka istega starega starša";
  } else if (upSteps === 3 && downSteps === 3) {
    relation = label(personB.id, "bratranec", "sestrična") + " (v drugem kolenu) — oba sta pravnuka istega prastarega starša";
  } else if (upSteps === 3 && downSteps === 1) {
    relation = label(personB.id, "stric", "teta") + " (starš staršev generacija)";
  } else if (Math.abs(upSteps - downSteps) === 1 && Math.min(upSteps, downSteps) >= 1) {
    // Razlika ene generacije - to je "mrzli" sorodnik (bližje, kot zveni)
    const isAuntUncleLevel = Math.min(upSteps, downSteps) === 1;
    const term = isAuntUncleLevel
      ? label(personB.id, "mrzli stric", "mrzla teta")
      : label(personB.id, "mrzli bratranec", "mrzla sestrična");
    const direction = downSteps > upSteps
      ? " (otrok tvojega bratranca/sestrične oz. nečaka/nečakinje — mlajša generacija)"
      : " (bratranec/sestrična oz. stric/teta enega od tvojih staršev — starejša generacija)";
    relation = term + direction;
  } else {
    // Res oddaljeno in nesimetrično sorodstvo (razlika 2+ generacij)
    const ancestorName = `${personById(bestCommon)?.first_name || ""} ${personById(bestCommon)?.last_name || personById(bestCommon)?.maiden_name || ""}`.trim();
    return `${name} in ti imata skupnega prednika (<strong>${ancestorName}</strong>): ti si od njega/nje oddaljen/-a ${upSteps} generacije, ${name} pa ${downSteps} generacije. Sorodstvo je precej oddaljeno in nesimetrično — natančen potek si oglej v spodnji verigi.`;
  }

  return `${name} je tvoj/-a <strong>${relation}</strong>.`;
}

function personById(id) {
  return allPeopleForConnection.find(p => p.id === id);
}

function isoToEuC(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function renderChain(chain, type, relationLabel) {
  const resultEl = document.getElementById("connection-result");
  const labelHtml = relationLabel ? `<p class="relation-label">${relationLabel}</p>` : "";

  if (type === "partner") {
    resultEl.innerHTML = `
      ${labelHtml}
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
    ${labelHtml}
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
