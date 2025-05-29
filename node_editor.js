let nodes = [];
let edges = [];
let nodeId = 1;
let pan = {x:0, y:0};
let scale = 1;
let isPanning = false, panStart = {x:0, y:0}, mouseStart = {x:0, y:0};
let draggingNode = null, offsetX=0, offsetY=0;
let draggingEdge = null, dragFrom = null, mousePos = null, hoveredPort = null;
let nodeLibrary = [];
let draggingLibNode = null;
let libFilter = "";

const NODE_WIDTH = 200;
const HEADER_HEIGHT = 38;
const ROW_HEIGHT = 28;
const PORT_SIZE = 16;
const MINIMAP_SIZE = 180;

const canvas = document.getElementById('canvas');
const workspace = document.getElementById('workspace');
const minimap = document.getElementById('minimap');
const libraryList = document.getElementById('libraryList');
const libInput = document.getElementById('libInput');
const libSearch = document.getElementById('libSearch');
const svg = document.getElementById('edges');

libSearch.oninput = function() {
  libFilter = this.value.trim().toLowerCase();
  renderLibrary();
};

function renderLibrary() {
  libraryList.innerHTML = '';
  nodeLibrary.filter(def => !libFilter || def.name.toLowerCase().includes(libFilter)).forEach(def => {
    const li = document.createElement('li');
    li.className = 'node-type';
    li.draggable = true;
    li.innerHTML = `<b>${def.name}</b>`;
    li.ondragstart = e => {
      draggingLibNode = def;
      const dragNode = document.createElement('div');
      dragNode.className = 'node';
      dragNode.style.position = 'absolute';
      dragNode.style.left = '0';
      dragNode.style.top = '0';
      dragNode.style.width = '120px';
      dragNode.style.height = '38px';
      dragNode.style.background = getComputedStyle(document.documentElement).getPropertyValue('--node-bg');
      dragNode.style.border = '2px solid ' + getComputedStyle(document.documentElement).getPropertyValue('--node-border');
      dragNode.style.borderRadius = getComputedStyle(document.documentElement).getPropertyValue('--radius');
      dragNode.style.color = getComputedStyle(document.documentElement).getPropertyValue('--text-main');
      dragNode.style.display = 'flex';
      dragNode.style.alignItems = 'center';
      dragNode.style.justifyContent = 'center';
      dragNode.style.fontWeight = '700';
      dragNode.style.fontSize = '15px';
      dragNode.innerText = def.name;
      document.body.appendChild(dragNode);
      e.dataTransfer.setDragImage(dragNode, 60, 20);
      setTimeout(() => document.body.removeChild(dragNode), 0);
    };
    li.ondragend = () => { draggingLibNode = null; };
    libraryList.appendChild(li);
  });
}

canvas.ondragover = e => { if (draggingLibNode && !e.target.closest('.node') && e.target !== canvas) e.preventDefault(); };
canvas.ondrop = e => {
  if (draggingLibNode && !e.target.closest('.node') && e.target !== canvas) {
    const rect = canvas.getBoundingClientRect();
    addNodeFromLibrary(
      draggingLibNode,
      (e.clientX - rect.left - pan.x) / scale - 80,
      (e.clientY - rect.top - pan.y) / scale - 20
    );
    draggingLibNode = null;
  }
};

function addNodeFromLibrary(libDef, x, y) {
  const node = {
    id: nodeId++,
    name: libDef.name,
    x: x, y: y,
    fn: libDef.fn, 
    inputs: libDef.inputs.slice(),
    outputs: libDef.outputs.slice()
  };
  nodes.push(node);
  render();
}

libInput.onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const lib = JSON.parse(evt.target.result);
      if (!Array.isArray(lib)) throw "Library JSON must be an array";
      for (let n of lib) {
        if (!n.name || !n.fn || !Array.isArray(n.inputs) || !Array.isArray(n.outputs))
          throw "Each node must have name, inputs, outputs";
      }
      nodeLibrary = lib;
      renderLibrary();
    } catch (err) {
      alert("Invalid library JSON: " + err);
    }
  };
  reader.readAsText(file);
  libInput.value = "";
};

function exportJSON() {
  const obj = {
    nodes: nodes.map(n => ({
      id: n.id, name: n.name, x: n.x, y: n.y,
      fn: n.fn, inputs: n.inputs, outputs: n.outputs
    })),
    edges: edges.map(e => ({
      from: e.from, to: e.to
    }))
  };
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'graph.json';
  a.click();
  URL.revokeObjectURL(url);
}
function importGraph() {
  const input = document.createElement('input');
  input.type = "file";
  input.accept = ".json";
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges))
          throw "Graph JSON must have nodes and edges arrays";
        nodes = data.nodes;
        edges = data.edges;
        nodeId = Math.max(1, ...nodes.map(n => n.id + 1));
        render();
      } catch (err) {
        alert("Invalid graph JSON: " + err);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function getPortPos(node, type, index) {
  // All coordinates in workspace space!
  const numRows = Math.max(node.inputs.length, node.outputs.length, 1);
  const y = node.y + HEADER_HEIGHT + (index + 1) * (ROW_HEIGHT-2) + ROW_HEIGHT/2;
  if (type === 'input') {
    return {
      x: node.x - PORT_SIZE/2,
      y: y
    };
  } else {
    return {
      x: node.x + NODE_WIDTH + PORT_SIZE/2,
      y: y
    };
  }
}

function render() {
  // Remove old nodes and edges
  workspace.querySelectorAll('.node').forEach(n => n.remove());
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // Apply pan and scale to workspace
  workspace.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${scale})`;
  workspace.style.transformOrigin = "0 0";

  // --- Nodes ---
  nodes.forEach(node => {
    const numRows = Math.max(node.inputs.length, node.outputs.length, 1);
    const nodeHeight = HEADER_HEIGHT + numRows * ROW_HEIGHT + ROW_HEIGHT/2;
    const div = document.createElement('div');
    div.className = 'node';
    div.style.left = node.x + 'px';
    div.style.top = node.y + 'px';
    div.style.height = nodeHeight + 'px';
    div.style.width = '200px';

    const header = document.createElement('div');
    header.className = 'node-header';
    header.textContent = node.name;
    div.appendChild(header);

    // Create exit button
    const exitBtn = document.createElement('button');
    exitBtn.className = 'node-exit-btn';
    exitBtn.innerHTML = '&times;'; // Unicode "×" for a close icon

    // Style the button (muted red, top-right)
    exitBtn.style.position = 'absolute';
    exitBtn.style.top = '1px';
    exitBtn.style.right = '1px';
    exitBtn.style.background = 'transparent'; // No background
    exitBtn.style.color = '#c0392b';          // Muted red cross
    exitBtn.style.border = 'none';
    exitBtn.style.borderRadius = '0';         // No rounding
    exitBtn.style.width = '24px';
    exitBtn.style.height = '24px';
    exitBtn.style.cursor = 'pointer';
    exitBtn.style.fontSize = '25px';
    exitBtn.style.lineHeight = '24px';
    exitBtn.style.display = 'flex';
    exitBtn.style.alignItems = 'center';
    exitBtn.style.justifyContent = 'center';

    exitBtn.addEventListener('mouseenter', (e) => {
      exitBtn.style.color = '#FF392b';
    });

    exitBtn.addEventListener('mouseleave', (e) => {
      exitBtn.style.color = '#c0392b';
    });

    // Add click handler to delete the node
    exitBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent other header events
      // Remove node from nodes array
      const idx = nodes.indexOf(node);
      if (idx !== -1) {
        nodes.splice(idx, 1);
        // Remove all edges connected to this node
        edges = edges.filter(
          edge => edge.from.nodeId !== node.id && edge.to.nodeId !== node.id
        );

        render(); // Re-render after deletion
      }
    });

    header.appendChild(exitBtn);
    div.appendChild(header);

    for (let i = 0; i < numRows; ++i) {
      const row = document.createElement('div');
      row.className = 'io-row';

      // Input
      if (i < node.inputs.length) {
        const io = document.createElement('span');
        io.className = 'io input';
        io.title = node.inputs[i];
        io.dataset.port = `in-${node.id}-${i}`;
        io.onmousedown = e => {
          e.stopPropagation();
          if (!draggingEdge) {
            draggingEdge = { nodeId: node.id, ioType: 'input', ioIndex: i };
            dragFrom = getPortPos(node, 'input', i);
            mousePos = dragFrom;
            window.addEventListener('mousemove', edgeDragMouseMove);
            window.addEventListener('mouseup', edgeDragMouseUp);
          }
        };
        io.onmouseenter = () => {
          if (draggingEdge && draggingEdge.ioType === 'output') {
            hoveredPort = { nodeId: node.id, type: 'input', index: i };
            io.classList.add('highlight');
          }
        };
        io.onmouseleave = () => {
          if (hoveredPort && hoveredPort.nodeId === node.id && hoveredPort.type === 'input' && hoveredPort.index === i) {
            hoveredPort = null;
            io.classList.remove('highlight');
          }
        };
        row.appendChild(io);

        const label = document.createElement('span');
        label.className = 'io-label';
        label.style.marginLeft = '18px';
        label.textContent = node.inputs[i];
        row.appendChild(label);
      } else {
        row.appendChild(document.createElement('span'));
        row.appendChild(document.createElement('span'));
      }

      // Output
      if (i < node.outputs.length) {
        const io = document.createElement('span');
        io.className = 'io output';
        io.title = node.outputs[i];
        io.dataset.port = `out-${node.id}-${i}`;
        io.onmousedown = e => {
          e.stopPropagation();
          if (!draggingEdge) {
            draggingEdge = { nodeId: node.id, ioType: 'output', ioIndex: i };
            dragFrom = getPortPos(node, 'output', i);
            mousePos = dragFrom;
            window.addEventListener('mousemove', edgeDragMouseMove);
            window.addEventListener('mouseup', edgeDragMouseUp);
          }
        };
        io.onmouseenter = () => {
          if (draggingEdge && draggingEdge.ioType === 'input') {
            hoveredPort = { nodeId: node.id, type: 'output', index: i };
            io.classList.add('highlight');
          }
        };
        io.onmouseleave = () => {
          if (hoveredPort && hoveredPort.nodeId === node.id && hoveredPort.type === 'output' && hoveredPort.index === i) {
            hoveredPort = null;
            io.classList.remove('highlight');
          }
        };
        row.appendChild(io);

        const label = document.createElement('span');
        label.className = 'io-label';
        label.style.marginLeft = 'auto';
        label.style.marginRight = '18px';
        label.textContent = node.outputs[i];
        row.appendChild(label);
      } else {
        row.appendChild(document.createElement('span'));
        row.appendChild(document.createElement('span'));
      }

      div.appendChild(row);
    }

    div.onmousedown = e => {
      if (e.target.classList.contains('io')) return;
      draggingNode = node;
      offsetX = e.offsetX;
      offsetY = e.offsetY;
    };
    workspace.appendChild(div);
  });

  // Draw permanent edges (using workspace coordinates!)
  edges.forEach(e => {
    const fromNode = nodes.find(n => n.id === e.from.nodeId);
    const toNode = nodes.find(n => n.id === e.to.nodeId);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--edge-color');
    if (fromNode && toNode) {
      const from = getPortPos(fromNode, 'output', e.from.index);
      const to = getPortPos(toNode, 'input', e.to.index);
      const fx = from.x, fy = from.y;
      const tx = to.x, ty = to.y;
      const dx = Math.abs(tx - fx) * 0.5;
      const c1x = fx + (fx < tx ? dx : -dx), c1y = fy;
      const c2x = tx - (fx < tx ? dx : -dx), c2y = ty;
      const pathD = `M${fx},${fy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`;

      // Invisible hit path
      const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hitPath.setAttribute('d', pathD);
      hitPath.setAttribute('stroke', 'transparent');
      hitPath.setAttribute('stroke-width', 20);
      hitPath.setAttribute('fill', 'none');
      hitPath.setAttribute('pointer-events', 'stroke');

      // Visible edge path
      const edgePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      edgePath.setAttribute('d', pathD);
      edgePath.setAttribute('class', 'edge');
      edgePath.setAttribute('stroke', color);
      edgePath.setAttribute('stroke-width', 3);
      edgePath.setAttribute('fill', 'none');
      svg.appendChild(edgePath);
      svg.appendChild(hitPath);

      // Highlight on hover
      hitPath.addEventListener('mouseenter', () => {
        edgePath.style.stroke = '#ec008c';
        edgePath.style.strokeWidth = 8
        hitPath.style.cursor = 'pointer'; // Change cursor to pointer
      });
      hitPath.addEventListener('mouseleave', () => {
        edgePath.style.stroke = color;
        edgePath.style.strokeWidth = 3;
      });
      hitPath.addEventListener('mousedown', function(evt) {
        svg.removeChild(hitPath);
        svg.removeChild(edgePath);
        edges = edges.filter(ev =>
          !(
            ev.from.nodeId === e.from.nodeId &&
            ev.from.index === e.from.index &&
            ev.to.nodeId === e.to.nodeId &&
            ev.to.index === e.to.index
          )
        );
        render();
      });
    }
  });

  // Draw temporary edge
  if (draggingEdge && dragFrom && mousePos) {
    const fx = dragFrom.x, fy = dragFrom.y;
    const tx = mousePos.x, ty = mousePos.y;
    const dx = Math.abs(tx - fx) * 0.5;
    const c1x = fx + (fx < tx ? dx : -dx), c1y = fy;
    const c2x = tx - (fx < tx ? dx : -dx), c2y = ty;
  
    // Draw visible path on top
    const edgePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    edgePath.setAttribute('d', `M${fx},${fy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`);
    edgePath.setAttribute('class', 'edge');
    svg.appendChild(edgePath);
  }

  renderMinimap();
}

// --- Minimap ---
function renderMinimap() {
  const ctx = minimap.getContext('2d');
  ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

  if (!nodes.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(node => {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + NODE_WIDTH);
    maxY = Math.max(maxY, node.y + HEADER_HEIGHT + Math.max(node.inputs.length, node.outputs.length, 1)*ROW_HEIGHT);
  });
  const pad = 40;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const scaleX = MINIMAP_SIZE / (maxX - minX);
  const scaleY = MINIMAP_SIZE / (maxY - minY);
  const mscale = Math.min(scaleX, scaleY);

  ctx.save();
  ctx.translate(0,0);
  nodes.forEach(node => {
    const x = (node.x - minX) * mscale;
    const y = (node.y - minY) * mscale;
    const w = NODE_WIDTH * mscale;
    const h = (HEADER_HEIGHT + Math.max(node.inputs.length, node.outputs.length, 1)*ROW_HEIGHT) * mscale;
    ctx.fillStyle = "#353538";
    ctx.strokeStyle = "#464649";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
  });

  // Draw viewport rectangle
  const viewX = -pan.x / scale, viewY = -pan.y / scale;
  const viewW = canvas.clientWidth / scale, viewH = canvas.clientHeight / scale;
  const vx = (viewX - minX) * mscale;
  const vy = (viewY - minY) * mscale;
  const vw = viewW * mscale;
  const vh = viewH * mscale;
  ctx.strokeStyle = "#ffe066";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.rect(vx, vy, vw, vh);
  ctx.stroke();

  ctx.restore();
}

document.onmouseup = () => { draggingNode = null; };
document.onmousemove = e => {
  if (draggingNode) {
    draggingNode.x = Math.max(0, Math.min(40000-NODE_WIDTH, (e.clientX - offsetX - canvas.offsetLeft - pan.x) / scale));
    draggingNode.y = Math.max(0, Math.min(40000, (e.clientY - offsetY - canvas.offsetTop - pan.y) / scale));
    render();
  }
};

function edgeDragMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  mousePos = {
    x: (e.clientX - rect.left - pan.x) / scale,
    y: (e.clientY - rect.top - pan.y) / scale
  };
  render();
}

function edgeDragMouseUp(e) {
  if (draggingEdge && hoveredPort) {
    if (draggingEdge.ioType === 'output' && hoveredPort.type === 'input') {
      edges.push({
        from: { nodeId: draggingEdge.nodeId, index: draggingEdge.ioIndex },
        to: { nodeId: hoveredPort.nodeId, index: hoveredPort.index }
      });
    } else if (draggingEdge.ioType === 'input' && hoveredPort.type === 'output') {
      edges.push({
        from: { nodeId: hoveredPort.nodeId, index: hoveredPort.index },
        to: { nodeId: draggingEdge.nodeId, index: draggingEdge.ioIndex }
      });
    }
  }
  draggingEdge = null;
  dragFrom = null;
  hoveredPort = null;
  mousePos = null;
  window.removeEventListener('mousemove', edgeDragMouseMove);
  window.removeEventListener('mouseup', edgeDragMouseUp);
  render();
}

// --- Panning (left mouse drag on empty workspace background) ---
let panActive = false;
workspace.addEventListener('mousedown', function(e) {
  if (!e.target.closest('.node')) {
    panActive = true;
    panStart = {x: pan.x, y: pan.y};
    mouseStart = {x: e.clientX, y: e.clientY};
    canvas.style.cursor = "grabbing";
  }
});
window.addEventListener('mousemove', function(e) {
  if (panActive) {
    pan.x = panStart.x + (e.clientX - mouseStart.x);
    pan.y = panStart.y + (e.clientY - mouseStart.y);
    render();
  }
});
window.addEventListener('mouseup', function(e) {
  panActive = false;
  canvas.style.cursor = "grab";
});

// --- Zooming: mouse wheel (centered on pointer, no modifier needed) ---
canvas.addEventListener('wheel', function(e) {
  e.preventDefault();
  const scaleFactor = 1.1;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  // Workspace coords before zoom
  const wx = (mx - pan.x) / scale;
  const wy = (my - pan.y) / scale;
  // Update scale
  if (e.deltaY < 0) {
    scale *= scaleFactor;
  } else {
    scale /= scaleFactor;
  }
  scale = Math.max(0.2, Math.min(2.5, scale));
  // Adjust pan so zoom is centered on mouse
  pan.x = mx - wx * scale;
  pan.y = my - wy * scale;
  render();
}, { passive: false });

render();
