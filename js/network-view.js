// Celoten pregled - razporeditev po generacijah (layered layout), ne kaotičen force graph

async function loadAndRenderNetwork() {
  const container = document.getElementById("NetworkView");
  container.innerHTML = "";

  const [{ data: people }, { data: partnerships }, { data: parentChild }] = await Promise.all([
    supabaseClient.from("people").select("*"),
    supabaseClient.from("partnerships").select("*"),
    supabaseClient.from("parent_child").select("*"),
  ]);

  if (!people || people.length === 0) {
    container.innerHTML = "<p class='empty-state'>Še ni dodanih oseb.</p>";
    return;
  }

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

  const byId = {};
  people.forEach(p => { byId[p.id] = p; });

  // --- 1. Izračun generacije vsake osebe (0 = najstarejši predniki) ---
  const generation = {};
  const allIds = people.map(p => p.id);

  function computeGeneration(id, visiting = new Set()) {
    if (generation[id] !== undefined) return generation[id];
    if (visiting.has(id)) return 0; // varovalka pred ciklom
    visiting.add(id);
    const parents = parentsOf[id] || [];
    if (parents.length === 0) {
      generation[id] = 0;
    } else {
      const parentGens = parents.map(pid => computeGeneration(pid, visiting));
      generation[id] = Math.max(...parentGens) + 1;
    }
    return generation[id];
  }
  allIds.forEach(id => computeGeneration(id));

  // Partnerji naj bodo v isti generaciji (nižja od obeh, da se poravnajo)
  let changed = true;
  let guard = 0;
  while (changed && guard < 10) {
    changed = false;
    guard++;
    partnerships.forEach(r => {
      const g1 = generation[r.person1_id], g2 = generation[r.person2_id];
      if (g1 !== g2) {
        const min = Math.min(g1, g2);
        generation[r.person1_id] = min;
        generation[r.person2_id] = min;
        changed = true;
      }
    });
  }

  // --- 2. Grupiranje po generacijah ---
  const genGroups = {};
  allIds.forEach(id => {
    const g = generation[id];
    (genGroups[g] ??= []).push(id);
  });
  const genLevels = Object.keys(genGroups).map(Number).sort((a, b) => a - b);

  // --- 3. Razporeditev x pozicij: začni pri generaciji 0, nato uredi po povprečni poziciji staršev ---
  const xPos = {};
  const NODE_SPACING = 110;

  genLevels.forEach((g, idx) => {
    let ids = genGroups[g];
    if (idx === 0) {
      ids.sort((a, b) => (byId[a].last_name || "").localeCompare(byId[b].last_name || ""));
    } else {
      ids.sort((a, b) => {
        const pa = (parentsOf[a] || []).map(p => xPos[p] ?? 0);
        const pb = (parentsOf[b] || []).map(p => xPos[p] ?? 0);
        const avgA = pa.length ? pa.reduce((s, v) => s + v, 0) / pa.length : 999999;
        const avgB = pb.length ? pb.reduce((s, v) => s + v, 0) / pb.length : 999999;
        return avgA - avgB;
      });
    }
    // Partnerje postavi drug ob drugem
    const placed = new Set();
    const ordered = [];
    ids.forEach(id => {
      if (placed.has(id)) return;
      ordered.push(id);
      placed.add(id);
      (spousesOf[id] || []).forEach(spId => {
        if (generation[spId] === g && !placed.has(spId)) {
          ordered.push(spId);
          placed.add(spId);
        }
      });
    });
    ordered.forEach((id, i) => { xPos[id] = i * NODE_SPACING; });
  });

  const ROW_HEIGHT = 130;
  const maxWidth = Math.max(...genLevels.map(g => genGroups[g].length)) * NODE_SPACING + 200;
  const totalHeight = (genLevels.length + 1) * ROW_HEIGHT;

  // --- 4. Izris ---
  const svg = d3.select("#NetworkView")
    .append("svg")
    .attr("width", "100%")
    .attr("height", Math.min(window.innerHeight - 220, 750))
    .attr("viewBox", [0, 0, maxWidth, totalHeight]);

  const g = svg.append("g").attr("transform", "translate(100, 60)");

  svg.call(d3.zoom().scaleExtent([0.2, 3]).on("zoom", (event) => {
    g.attr("transform", event.transform);
  }));

  function nodeX(id) { return xPos[id] || 0; }
  function nodeY(id) { return generation[id] * ROW_HEIGHT; }

  // Povezave starš-otrok (ravne diagonalne črte)
  g.append("g").selectAll("line.pc")
    .data(parentChild.filter(r => byId[r.parent_id] && byId[r.child_id]))
    .join("line")
    .attr("class", "pc")
    .attr("x1", d => nodeX(d.parent_id))
    .attr("y1", d => nodeY(d.parent_id) + 14)
    .attr("x2", d => nodeX(d.child_id))
    .attr("y2", d => nodeY(d.child_id) - 14)
    .attr("stroke", "#c3b4a0")
    .attr("stroke-width", 1.3);

  // Povezave partnerstev (vodoravne črtkane črte)
  g.append("g").selectAll("line.sp")
    .data(partnerships.filter(r => byId[r.person1_id] && byId[r.person2_id] && generation[r.person1_id] === generation[r.person2_id]))
    .join("line")
    .attr("class", "sp")
    .attr("x1", d => nodeX(d.person1_id))
    .attr("y1", d => nodeY(d.person1_id))
    .attr("x2", d => nodeX(d.person2_id))
    .attr("y2", d => nodeY(d.person2_id))
    .attr("stroke", "#c98a9c")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "3,3");

  // Vozlišča (osebe)
  const node = g.append("g")
    .selectAll("g")
    .data(people)
    .join("g")
    .attr("cursor", "pointer")
    .attr("transform", d => `translate(${nodeX(d.id)},${nodeY(d.id)})`);

  node.append("circle")
    .attr("r", 13)
    .attr("fill", d => d.gender === "M" ? "#6e93a3" : d.gender === "F" ? "#c17c94" : "#a89a86")
    .attr("stroke", d => d.is_deceased ? "#3d3229" : "#fff")
    .attr("stroke-width", d => d.is_deceased ? 2 : 1.3);

  node.append("text")
    .text(d => `${d.first_name} ${d.last_name || ""}`.trim())
    .attr("x", 0)
    .attr("y", 26)
    .attr("text-anchor", "middle")
    .attr("font-size", "9.5px")
    .attr("fill", "#2b2622")
    .attr("font-family", "system-ui, sans-serif")
    .style("pointer-events", "none");

  node.append("title").text(d => `${d.first_name} ${d.last_name || ""}`.trim());

  node.on("click", (event, d) => openEditPanel(d.id));

  // Oznake generacij ob levem robu
  g.append("g").selectAll("text.gen-label")
    .data(genLevels)
    .join("text")
    .attr("class", "gen-label")
    .attr("x", -70)
    .attr("y", g => g * ROW_HEIGHT + 5)
    .attr("font-size", "11px")
    .attr("fill", "#a89a86")
    .attr("font-family", "system-ui, sans-serif")
    .text(g => `Rod ${g + 1}`);
}
