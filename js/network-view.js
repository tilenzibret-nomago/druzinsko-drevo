// Celoten pregled - vse osebe kot mreža (d3 force layout)

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

  const width = container.clientWidth || 1000;
  const height = window.innerHeight - 220;

  const nodes = people.map(p => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name || ""}`.trim(),
    gender: p.gender,
    deceased: p.is_deceased,
  }));

  const links = [];
  parentChild.forEach(r => links.push({ source: r.parent_id, target: r.child_id, type: "parent" }));
  partnerships.forEach(r => links.push({ source: r.person1_id, target: r.person2_id, type: "partner" }));

  const svg = d3.select("#NetworkView")
    .append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  const g = svg.append("g");

  svg.call(d3.zoom().scaleExtent([0.1, 3]).on("zoom", (event) => {
    g.attr("transform", event.transform);
  }));

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.type === "partner" ? 60 : 90).strength(0.6))
    .force("charge", d3.forceManyBody().strength(-180))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(38));

  const link = g.append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", d => d.type === "partner" ? "#c98a9c" : "#8a6d4f")
    .attr("stroke-width", d => d.type === "partner" ? 1.5 : 2)
    .attr("stroke-dasharray", d => d.type === "partner" ? "4,3" : null)
    .attr("stroke-opacity", 0.6);

  const node = g.append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("cursor", "pointer")
    .call(drag(simulation));

  node.append("circle")
    .attr("r", 16)
    .attr("fill", d => d.gender === "M" ? "#6e93a3" : d.gender === "F" ? "#c17c94" : "#a89a86")
    .attr("stroke", d => d.deceased ? "#3d3229" : "#fff")
    .attr("stroke-width", d => d.deceased ? 2 : 1.5)
    .attr("stroke-dasharray", d => d.deceased ? "3,2" : null);

  node.append("text")
    .text(d => d.name)
    .attr("x", 20)
    .attr("y", 4)
    .attr("font-size", "11px")
    .attr("fill", "#2b2622")
    .attr("font-family", "system-ui, sans-serif")
    .style("pointer-events", "none");

  node.on("click", (event, d) => {
    openEditPanel(d.id);
  });

  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });

  function drag(sim) {
    function dragstarted(event, d) {
      if (!event.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x; d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null; d.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
  }
}
