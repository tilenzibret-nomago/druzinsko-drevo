// Pretvorba people/partnerships/parent_child -> format, ki ga pričakuje family-chart
// family-chart format: [{ id, data: {...}, rels: { father, mother, spouses: [], children: [] } }]

let rawPeople = [];
let rawPartnerships = [];
let rawParentChild = [];
let f3ChartInstance = null;
let currentMainId = null;

async function fetchFamilyData() {
  const [{ data: people, error: peopleErr },
         { data: partnerships, error: partErr },
         { data: parentChild, error: pcErr }] = await Promise.all([
    supabaseClient.from("people").select("*"),
    supabaseClient.from("partnerships").select("*"),
    supabaseClient.from("parent_child").select("*"),
  ]);

  if (peopleErr || partErr || pcErr) {
    console.error("Napaka pri nalaganju podatkov:", peopleErr || partErr || pcErr);
    return [];
  }

  rawPeople = people;
  rawPartnerships = partnerships;
  rawParentChild = parentChild;

  return buildFamilyChartData(people, partnerships, parentChild);
}

function isoToEuDisplay(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

function buildFamilyChartData(people, partnerships, parentChild, relationLabels) {
  const byId = {};
  people.forEach(p => {
    const birthLine = p.birth_date ? `* ${isoToEuDisplay(p.birth_date)}` : "";
    const deathLine = p.is_deceased ? `† ${isoToEuDisplay(p.death_date) || "neznan datum"}` : "";

    byId[p.id] = {
      id: p.id,
      data: {
        "first name": p.first_name,
        "last name": p.last_name || p.maiden_name || "",
        gender: p.gender || "O",
        birthday: birthLine,
        deathday: deathLine,
        avatar: p.photo_url || "",
        relation: relationLabels?.[p.id] || "",
      },
      rels: { spouses: [], children: [] },
    };
  });

  partnerships.forEach(rel => {
    if (byId[rel.person1_id]) byId[rel.person1_id].rels.spouses.push(rel.person2_id);
    if (byId[rel.person2_id]) byId[rel.person2_id].rels.spouses.push(rel.person1_id);
  });

  parentChild.forEach(rel => {
    const parent = byId[rel.parent_id];
    const child = byId[rel.child_id];
    if (!parent || !child) return;

    parent.rels.children.push(rel.child_id);

    // father/mother na otroku - ugotovimo spol starša
    const parentPerson = people.find(p => p.id === rel.parent_id);
    if (parentPerson?.gender === "M") child.rels.father = rel.parent_id;
    else if (parentPerson?.gender === "F") child.rels.mother = rel.parent_id;
    else if (!child.rels.father) child.rels.father = rel.parent_id; // varovalka: manjkajoč spol, a naj se vseeno poveže
  });

  return Object.values(byId);
}

// Izračuna sorodstvene nazive vseh oseb glede na osebo v središču (mainId)
function computeRelationLabels(mainId, people, partnerships, parentChild) {
  const genderById = {};
  people.forEach(p => { genderById[p.id] = p.gender; });

  const parentsOf = {};
  const childrenOf = {};
  parentChild.forEach(r => {
    (parentsOf[r.child_id] ??= []).push(r.parent_id);
    (childrenOf[r.parent_id] ??= []).push(r.child_id);
  });

  const spousesOf = {};
  partnerships.forEach(r => {
    (spousesOf[r.person1_id] ??= []).push(r.person2_id);
    (spousesOf[r.person2_id] ??= []).push(r.person1_id);
  });

  const label = (id, male, female, neutral) => {
    const g = genderById[id];
    if (g === "M") return male;
    if (g === "F") return female;
    return neutral || male;
  };

  // Vrne tip zveze med dvema osebama ('marriage' | 'partnership' | null)
  const partnershipType = (id1, id2) => {
    const rel = partnerships.find(r =>
      (r.person1_id === id1 && r.person2_id === id2) ||
      (r.person1_id === id2 && r.person2_id === id1)
    );
    return rel?.type || null;
  };

  const spouseLabel = (mainPersonId, spouseId, maleMarried, femaleMarried, malePartner, femalePartner) => {
    const isMarried = partnershipType(mainPersonId, spouseId) === "marriage";
    return isMarried
      ? label(spouseId, maleMarried, femaleMarried)
      : label(spouseId, malePartner, femalePartner, "Partner/-ka");
  };

  const labels = {};
  if (!mainId || !genderById[mainId]) return labels;
  labels[mainId] = "— izbrana oseba —";

  // Prednika (starši, dedki, pradedki...)
  const ancestorDist = {};
  {
    let frontier = [mainId];
    const visited = new Set([mainId]);
    let dist = 0;
    while (frontier.length && dist < 6) {
      const next = [];
      for (const id of frontier) {
        for (const pid of (parentsOf[id] || [])) {
          if (!visited.has(pid)) {
            visited.add(pid);
            ancestorDist[pid] = dist + 1;
            next.push(pid);
          }
        }
      }
      frontier = next;
      dist++;
    }
  }

  // Potomci (otroci, vnuki, pravnuki...)
  const descendantDist = {};
  {
    let frontier = [mainId];
    const visited = new Set([mainId]);
    let dist = 0;
    while (frontier.length && dist < 6) {
      const next = [];
      for (const id of frontier) {
        for (const cid of (childrenOf[id] || [])) {
          if (!visited.has(cid)) {
            visited.add(cid);
            descendantDist[cid] = dist + 1;
            next.push(cid);
          }
        }
      }
      frontier = next;
      dist++;
    }
  }

  Object.entries(ancestorDist).forEach(([id, d]) => {
    if (d === 1) labels[id] = label(id, "Oče", "Mati");
    else if (d === 2) labels[id] = label(id, "Dedek", "Babica");
    else if (d === 3) labels[id] = label(id, "Pradedek", "Prababica");
    else labels[id] = `Prednik (${d}. koleno)`;
  });

  Object.entries(descendantDist).forEach(([id, d]) => {
    if (d === 1) labels[id] = label(id, "Sin", "Hči");
    else if (d === 2) labels[id] = label(id, "Vnuk", "Vnukinja");
    else if (d === 3) labels[id] = label(id, "Pravnuk", "Pravnukinja");
    else labels[id] = `Potomec (${d}. koleno)`;
  });

  // Partner
  (spousesOf[mainId] || []).forEach(id => {
    if (!labels[id]) labels[id] = spouseLabel(mainId, id, "Mož", "Žena", "Partner", "Partnerka");
  });

  // Bratje/sestre (skupni starš)
  const mainParents = parentsOf[mainId] || [];
  const siblingIds = new Set();
  mainParents.forEach(pid => (childrenOf[pid] || []).forEach(cid => { if (cid !== mainId) siblingIds.add(cid); }));
  siblingIds.forEach(id => { if (!labels[id]) labels[id] = label(id, "Brat", "Sestra"); });

  // Stric/teta (starševi bratje/sestre)
  const auntUncleIds = new Set();
  mainParents.forEach(parentId => {
    (parentsOf[parentId] || []).forEach(gpId => {
      (childrenOf[gpId] || []).forEach(id => {
        if (id !== parentId) auntUncleIds.add(id);
      });
    });
  });
  auntUncleIds.forEach(id => { if (!labels[id]) labels[id] = label(id, "Stric", "Teta"); });

  // Nečak/nečakinja (otroci bratov/sester)
  siblingIds.forEach(sibId => {
    (childrenOf[sibId] || []).forEach(id => {
      if (!labels[id]) labels[id] = label(id, "Nečak", "Nečakinja");
    });
  });

  // Bratranec/sestrična (otroci stricev/tet)
  auntUncleIds.forEach(auId => {
    (childrenOf[auId] || []).forEach(id => {
      if (!labels[id]) labels[id] = label(id, "Bratranec", "Sestrična");
    });
  });

  // Partnerji NEPOSREDNIH otrok = snaha/zet (samo prva generacija potomcev!)
  Object.entries(descendantDist).forEach(([id, d]) => {
    if (d !== 1) return;
    (spousesOf[id] || []).forEach(spId => {
      if (!labels[spId] && spId !== mainId) {
        labels[spId] = spouseLabel(id, spId, "Zet", "Snaha", "Partner", "Partnerka");
      }
    });
  });

  // Partnerji vnukov = "vnukov mož" / "vnukova žena" (druga generacija potomcev)
  Object.entries(descendantDist).forEach(([id, d]) => {
    if (d !== 2) return;
    (spousesOf[id] || []).forEach(spId => {
      if (!labels[spId] && spId !== mainId) {
        labels[spId] = label(spId, "Vnukinjin mož", "Vnukova žena", "Vnukov partner/-ka");
      }
    });
  });

  // Partnerji bratov/sester = svak/svakinja
  siblingIds.forEach(id => {
    (spousesOf[id] || []).forEach(spId => {
      if (!labels[spId] && spId !== mainId) {
        labels[spId] = label(spId, "Svak", "Svakinja", "Sorodnik po svaštvu");
      }
    });
  });

  // Vsi preostali partnerji že označenih sorodnikov - splošna oznaka
  Object.keys(labels).slice().forEach(id => {
    (spousesOf[id] || []).forEach(spId => {
      if (!labels[spId] && spId !== mainId) {
        labels[spId] = label(spId, "Sorodnik po svaštvu", "Sorodnica po svaštvu", "Sorodnik po svaštvu");
      }
    });
  });

  return labels;
}

function addArrowsToTreeLinks() {
  const svg = document.querySelector("#FamilyChart svg");
  if (!svg) return;

  if (!svg.querySelector("#f3-arrow-marker")) {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <marker id="f3-arrow-marker" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a6d4f"></path>
      </marker>`;
    svg.insertBefore(defs, svg.firstChild);
  }

  svg.querySelectorAll("path.link, path[class*='link'], .link path").forEach(path => {
    path.setAttribute("marker-end", "url(#f3-arrow-marker)");
    path.setAttribute("stroke", "#8a6d4f");
    path.setAttribute("stroke-width", "2");
  });
}

function centerOnPerson(id) {
  // Family-chart postavi izbrano osebo strukturno v središče drevesa (main),
  // tukaj poskrbimo, da je tudi VIZUALNO v središču zaslona (scroll).
  const trySelectors = [
    `[data-id="${id}"]`,
    `#${CSS.escape(id)}`,
    `g[id="${id}"]`,
  ];
  let el = null;
  for (const sel of trySelectors) {
    el = document.querySelector(sel);
    if (el) break;
  }
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  } else {
    // Če kartice ne najdemo neposredno, vsaj poskrbi, da je drevo samo vidno na sredini strani
    document.getElementById("FamilyChart").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function recomputeLabelsAndRerender(mainId) {
  currentMainId = mainId;
  const labels = computeRelationLabels(mainId, rawPeople, rawPartnerships, rawParentChild);
  const newData = buildFamilyChartData(rawPeople, rawPartnerships, rawParentChild, labels);

  if (f3ChartInstance.updateData) {
    f3ChartInstance.updateData(newData);
  }
  if (f3ChartInstance.updateMainId) {
    f3ChartInstance.updateMainId(mainId);
  }
  f3ChartInstance.updateTree({});
  setTimeout(addArrowsToTreeLinks, 400);
  setTimeout(() => centerOnPerson(mainId), 450);
}

async function loadAndRenderTree() {
  const data = await fetchFamilyData();
  const container = document.getElementById("FamilyChart");

  if (data.length === 0) {
    container.innerHTML = "<p class='empty-state'>Še ni dodanih oseb. Klikni \"+ Dodaj osebo\" za začetek.</p>";
    return;
  }

  // Privzeto izberi prvo osebo kot izhodišče za nazive
  currentMainId = data[0].id;
  const initialLabels = computeRelationLabels(currentMainId, rawPeople, rawPartnerships, rawParentChild);
  const initialData = buildFamilyChartData(rawPeople, rawPartnerships, rawParentChild, initialLabels);

  const f3Chart = f3.createChart("#FamilyChart", initialData)
    .setTransitionTime(800)
    .setCardXSpacing(280)
    .setCardYSpacing(190)
    .setOrientationVertical();
  f3ChartInstance = f3Chart;

  const f3Card = f3Chart.setCard(f3.CardHtml)
    .setCardDisplay([["first name", "last name"], ["relation"], ["birthday"], ["deathday"]])
    .setCardDim({ width: 230, height: 90 })
    .setMiniTree(true)
    .setStyle("imageRect")
    .setOnHoverPathToMain();

  f3Card.setOnCardClick((e, d) => {
    // Klik na osebo jo postavi v središče drevesa in preračuna nazive relativno nanjo
    selectPerson(d.data.id, d.data);
    recomputeLabelsAndRerender(d.data.id);
  });

  f3Chart.updateTree({ initial: true });

  setTimeout(addArrowsToTreeLinks, 400);
  setTimeout(addArrowsToTreeLinks, 1000);
  setTimeout(() => centerOnPerson(currentMainId), 450);
}

function selectPerson(id, cardData) {
  const bar = document.getElementById("selected-bar");
  const nameEl = document.getElementById("selected-person-name");

  const firstName = cardData?.["first name"] || cardData?.data?.["first name"] || "";
  const lastName = cardData?.["last name"] || cardData?.data?.["last name"] || "";
  nameEl.textContent = `${firstName} ${lastName}`.trim();
  window.currentSelectedPersonId = id;
  bar.style.display = "flex";
}
