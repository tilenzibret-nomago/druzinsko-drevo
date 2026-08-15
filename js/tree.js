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

function buildFamilyChartData(people, partnerships, parentChild) {
  const byId = {};
  people.forEach(p => {
    byId[p.id] = {
      id: p.id,
      data: {
        "first name": p.first_name,
        "last name": p.last_name || "",
        gender: p.gender || "O",
        birthday: p.birth_date || "",
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

  const f3Card = f3Chart.setCard(f3.CardHtml)
    .setCardDisplay([["first name", "last name"], ["birthday"]])
    .setCardDim({})
    .setMiniTree(true)
    .setStyle("imageRect")
    .setOnHoverPathToMain();

  f3Card.setOnCardClick((e, d) => {
    window.location.href = `person.html?id=${d.data.id}`;
  });

  f3Chart.updateTree({ initial: true });
}
