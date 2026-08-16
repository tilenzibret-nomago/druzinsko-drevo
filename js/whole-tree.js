// Celotno drevo na enem platnu - generacijska razporeditev, izgled podoben family-chart

let wtSvg, wtG, wtZoom;

async function loadWholeTree() {
  const container = document.getElementById("WholeTree");
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

  const byId = {};
  people.forEach(p => { byId[p.id] = p; });

  const parentsOf = {}, childrenOf = {};
  parentChild.forEach(r => {
    (parentsOf[r.child_id] ??= []).push(r.parent_id);
    (childrenOf[r.parent_id] ??= []).push(r.child_id);
  });
  const spousesOf = {};
  partnerships.forEach(r => {
    (spousesOf[r.person1_id] ??= []).push(r.person2_id);
    (spousesOf[r.person2_id] ??= []).push(r.person1_id);
  });

  // --- 1. Generacija vsake osebe (0 = najstarejši predniki) ---
  const generation = {};
  function computeGeneration(id, visiting = new Set()) {
    if (generation[id] !== undefined) return generation[id];
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = parentsOf[id] || [];
    if (parents.length === 0) {
      generation[id] = 0;
    } else {
      generation[id] = Math.max(...parents.map(pid => computeGeneration(pid, visiting))) + 1;
    }
    return generation[id];
  }
  people.forEach(p => computeGeneration(p.id));

  let changed = true, guard = 0;
  while (changed && guard < 10) {
    changed = false; guard++;
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

  // --- 2. Grupiranje po generacijah in x-pozicije ---
  const genGroups = {};
  people.forEach(p => { (genGroups[generation[p.id]] ??= []).push(p.id); });
  const genLevels = Object.keys(genGroups).map(Number).sort((a, b) => a - b);

  const xPos = {};
  const CARD_W = 190, CARD_H = 96, H_GAP = 40, V_GAP = 130;
  const SLOT = CARD_W + H_GAP;

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
    const placed = new Set(), ordered = [];
    ids.forEach(id => {
      if (placed.has(id)) return;
      ordered.push(id); placed.add(id);
      (spousesOf[id] || []).forEach(spId => {
        if (generation[spId] === g && !placed.has(spId)) { ordered.push(spId); placed.add(spId); }
      });
    });
    ordered.forEach((id, i) => { xPos[id] = i * SLOT; });
  });

  const maxWidth = Math.max(...genLevels.map(g => genGroups[g].length)) * SLOT + 300;
  const totalHeight = (genLevels.length + 1) * V_GAP + 100;

  function nodeX(id) { return xPos[id] || 0; }
  function nodeY(id) { return generation[id] * V_GAP; }

  // --- 3. SVG + zoom/pan ---
  wtSvg = d3.select("#WholeTree").append("svg")
    .attr("width", "100%").attr("height", "82vh")
    .attr("viewBox", [0, 0, Math.min(maxWidth, 2000), 700]);

  const defs = wtSvg.append("defs");
  defs.append("marker")
    .attr("id", "wt-arrow").attr("viewBox", "0 0 10 10")
    .attr("refX", 9).attr("refY", 5)
    .attr("markerWidth", 6).attr("markerHeight", 6)
    .attr("orient", "auto-start-reverse")
    .append("path").attr("d", "M0,0 L10,5 L0,10 z").attr("fill", "#8a6d4f");

  wtG = wtSvg.append("g").attr("transform", "translate(150,60)");

  wtZoom = d3.zoom().scaleExtent([0.1, 3]).on("zoom", (event) => {
    wtG.attr("transform", event.transform);
  });
  wtSvg.call(wtZoom);
  // Začetni zoom - pomanjšaj, da se vidi čim več naenkrat
  const initialScale = Math.min(1, 1400 / maxWidth);
  wtSvg.call(wtZoom.transform, d3.zoomIdentity.translate(150, 60).scale(initialScale));

  // Povezave starš-otrok (krivulje, s puščicami)
  wtG.append("g").selectAll("path.pc")
    .data(parentChild.filter(r => byId[r.parent_id] && byId[r.child_id]))
    .join("path")
    .attr("class", "pc")
    .attr("fill", "none")
    .attr("stroke", "#c3b4a0")
    .attr("stroke-width", 1.8)
    .attr("marker-end", "url(#wt-arrow)")
    .attr("d", d => {
      const x1 = nodeX(d.parent_id) + CARD_W / 2, y1 = nodeY(d.parent_id) + CARD_H;
      const x2 = nodeX(d.child_id) + CARD_W / 2, y2 = nodeY(d.child_id);
      const midY = (y1 + y2) / 2;
      return `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
    });

  // Partnerske povezave
  wtG.append("g").selectAll("line.sp")
    .data(partnerships.filter(r => byId[r.person1_id] && byId[r.person2_id] && generation[r.person1_id] === generation[r.person2_id]))
    .join("line")
    .attr("class", "sp")
    .attr("x1", d => nodeX(d.person1_id) + CARD_W)
    .attr("y1", d => nodeY(d.person1_id) + CARD_H / 2)
    .attr("x2", d => nodeX(d.person2_id))
    .attr("y2", d => nodeY(d.person2_id) + CARD_H / 2)
    .attr("stroke", d => d.type === "unknown" ? "#b0a89c" : "#c98a9c")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", d => d.type === "marriage" ? null : "5,4");

  // --- 4. Kartice oseb (podobne family-chart izgledu) ---
  const node = wtG.append("g").selectAll("g.person")
    .data(people).join("g")
    .attr("class", "person")
    .attr("transform", d => `translate(${nodeX(d.id)},${nodeY(d.id)})`)
    .attr("cursor", "pointer")
    .on("click", (event, d) => openEditPanel(d.id));

  const cardBg = node.append("rect")
    .attr("width", CARD_W).attr("height", CARD_H)
    .attr("rx", 14)
    .attr("fill", d => d.gender === "M" ? "#6e93a3" : d.gender === "F" ? "#c17c94" : "#a89a86")
    .attr("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.15))");

  // Fotografija ali privzeta ikona
  const photoSize = 52;
  const clipId = (d, i) => `wt-clip-${i}`;

  node.each(function(d, i) {
    const g = d3.select(this);
    if (d.photo_url) {
      wtSvg.select("defs").append("clipPath")
        .attr("id", clipId(d, i))
        .append("circle")
        .attr("cx", 8 + photoSize / 2).attr("cy", CARD_H / 2).attr("r", photoSize / 2);
      g.append("image")
        .attr("href", d.photo_url)
        .attr("x", 8).attr("y", (CARD_H - photoSize) / 2)
        .attr("width", photoSize).attr("height", photoSize)
        .attr("clip-path", `url(#${clipId(d, i)})`)
        .attr("preserveAspectRatio", "xMidYMid slice");
    } else {
      g.append("circle")
        .attr("cx", 8 + photoSize / 2).attr("cy", CARD_H / 2).attr("r", photoSize / 2)
        .attr("fill", "rgba(255,255,255,0.25)");
      g.append("text")
        .attr("x", 8 + photoSize / 2).attr("y", CARD_H / 2 + 7)
        .attr("text-anchor", "middle")
        .attr("font-size", "22px")
        .attr("fill", "#fff")
        .text("👤");
    }
  });

  node.append("text")
    .attr("x", 8 + photoSize + 10).attr("y", 32)
    .attr("font-size", "13px").attr("font-weight", "600")
    .attr("fill", "#fff")
    .text(d => `${d.first_name} ${d.last_name || d.maiden_name || ""}`.trim())
    .each(function(d) {
      // Prelomi predolga imena
      const el = d3.select(this);
      const maxChars = 17;
      const full = `${d.first_name} ${d.last_name || d.maiden_name || ""}`.trim();
      if (full.length > maxChars) {
        el.text(full.slice(0, maxChars) + "…");
      }
    });

  node.append("text")
    .attr("x", 8 + photoSize + 10).attr("y", 50)
    .attr("font-size", "10.5px")
    .attr("fill", "rgba(255,255,255,0.85)")
    .text(d => d.birth_date ? `* ${isoToEuShort(d.birth_date)}` : "");

  node.append("text")
    .attr("x", 8 + photoSize + 10).attr("y", 66)
    .attr("font-size", "10.5px")
    .attr("fill", "rgba(255,255,255,0.85)")
    .text(d => d.is_deceased ? `† ${d.death_date ? isoToEuShort(d.death_date) : "neznano"}` : "");

  node.append("title").text(d => `${d.first_name} ${d.last_name || ""}`.trim());
}

function isoToEuShort(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function wtZoomIn() { wtSvg.transition().call(wtZoom.scaleBy, 1.3); }
function wtZoomOut() { wtSvg.transition().call(wtZoom.scaleBy, 0.75); }
function wtZoomReset() { wtSvg.transition().call(wtZoom.transform, d3.zoomIdentity.translate(150, 60)); }
