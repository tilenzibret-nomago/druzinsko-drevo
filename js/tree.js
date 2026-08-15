// Pretvorba people/partnerships/parent_child -> format, ki ga pričakuje family-chart
// family-chart format: [{ id, data: {...}, rels: { father, mother, spouses: [], children: [] } }]

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

  return buildFamilyChartData(people, partnerships, parentChild);
}

function isoToEuDisplay(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

function buildFamilyChartData(people, partnerships, parentChild) {
  const byId = {};
  people.forEach(p => {
    byId[p.id] = {
      id: p.id,
      data: {
        "first name": p.first_name,
        "last name": p.last_name || "",
        gender: p.gender || "O",
        birthday: isoToEuDisplay(p.birth_date),
        avatar: p.photo_url || "",
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
  });

  return Object.values(byId);
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

let f3ChartInstance = null;

async function loadAndRenderTree() {
  const data = await fetchFamilyData();
  const container = document.getElementById("FamilyChart");

  if (data.length === 0) {
    container.innerHTML = "<p class='empty-state'>Še ni dodanih oseb. Klikni \"+ Dodaj osebo\" za začetek.</p>";
    return;
  }

  const f3Chart = f3.createChart("#FamilyChart", data)
    .setTransitionTime(800)
    .setCardXSpacing(250)
    .setCardYSpacing(150)
    .setOrientationVertical();
  f3ChartInstance = f3Chart;

  const f3Card = f3Chart.setCard(f3.CardHtml)
    .setCardDisplay([["first name", "last name"], ["birthday"]])
    .setCardDim({})
    .setMiniTree(true)
    .setStyle("imageRect")
    .setOnHoverPathToMain();

  f3Card.setOnCardClick((e, d) => {
    // Klik na osebo jo postavi v središče drevesa (namesto takojšnje navigacije na urejanje)
    selectPerson(d.data.id, d.data);
    if (f3Chart.updateMainId) {
      f3Chart.updateMainId(d.data.id);
    }
    f3Chart.updateTree({});
    setTimeout(addArrowsToTreeLinks, 400);
  });

  f3Chart.updateTree({ initial: true });

  // Puščice na povezavah se izrišejo z zamikom, ko family-chart konča z animacijo
  setTimeout(addArrowsToTreeLinks, 400);
  setTimeout(addArrowsToTreeLinks, 1000);
}

function selectPerson(id, cardData) {
  const bar = document.getElementById("selected-bar");
  const nameEl = document.getElementById("selected-person-name");
  const editLink = document.getElementById("edit-selected-link");

  const firstName = cardData?.["first name"] || cardData?.data?.["first name"] || "";
  const lastName = cardData?.["last name"] || cardData?.data?.["last name"] || "";
  nameEl.textContent = `${firstName} ${lastName}`.trim();
  editLink.href = `person.html?id=${id}`;
  bar.style.display = "flex";
}
