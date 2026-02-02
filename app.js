let datos = [];
let mapa;
let capaMarcadores;

// Definiciones EPSG oficiales (corrigen error hacia 4326)
const epsgDefs = {
  "4326": "+proj=longlat +datum=WGS84 +no_defs",
  "3116": "+proj=tmerc +lat_0=4.59620041666667 +lon_0=-74.0775079166667 +k=0.9992 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs",
  "3115": "+proj=tmerc +lat_0=4 +lon_0=-73 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs",
  "9377": "+proj=tmerc +lat_0=4.59620041666667 +lon_0=-74.0775079166667 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs"
};

// Registrar EPSG en Proj4
for (let code in epsgDefs) {
  proj4.defs("EPSG:" + code, epsgDefs[code]);
}

// Llenar combos
const origenSel = document.getElementById("epsgOrigen");
const destinoSel = document.getElementById("epsgDestino");

for (let epsg in epsgDefs) {
  origenSel.add(new Option("EPSG:" + epsg, epsg));
  destinoSel.add(new Option("EPSG:" + epsg, epsg));
}
origenSel.value = "4326";
destinoSel.value = "3116";

// ------------------------
// INGRESO
// ------------------------

function agregarCoordenada() {
  const x = parseFloat(document.getElementById("xInput").value);
  const y = parseFloat(document.getElementById("yInput").value);
  if (isNaN(x) || isNaN(y)) {
    alert("Ingrese valores numéricos válidos");
    return;
  }
  datos.push({ x, y });
  document.getElementById("xInput").value = "";
  document.getElementById("yInput").value = "";
  actualizarTabla();
}

function cargarArchivo(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  if (file.name.endsWith(".xlsx")) {
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const hoja = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(hoja);

      json.forEach(row => {
        const keys = Object.keys(row).map(k => k.toLowerCase());
        if (keys.includes("x") && keys.includes("y")) {
          datos.push({ x: parseFloat(row[keys.find(k => k === "x")]), y: parseFloat(row[keys.find(k => k === "y")]) });
        } else if (keys.includes("longitud") && keys.includes("latitud")) {
          datos.push({ x: parseFloat(row[keys.find(k => k === "longitud")]), y: parseFloat(row[keys.find(k => k === "latitud")]) });
        }
      });

      actualizarTabla();
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = (e) => {
      const lines = e.target.result.split(/\r?\n/);
      lines.forEach(line => {
        const parts = line.split(/[;, \t]+/);
        if (parts.length >= 2) {
          const x = parseFloat(parts[0]);
          const y = parseFloat(parts[1]);
          if (!isNaN(x) && !isNaN(y)) {
            datos.push({ x, y });
          }
        }
      });
      actualizarTabla();
    };
    reader.readAsText(file);
  }
}

// ------------------------
// TRANSFORMACIÓN
// ------------------------

function transformar() {
  const origen = "EPSG:" + origenSel.value;
  const destino = "EPSG:" + destinoSel.value;

  datos.forEach(d => {
    const res = proj4(origen, destino, [d.x, d.y]);
    d.x_t = res[0];
    d.y_t = res[1];
  });

  actualizarTabla();
}

// ------------------------
// TABLA + MENÚ
// ------------------------

function actualizarTabla() {
  const tbody = document.querySelector("#tabla tbody");
  tbody.innerHTML = "";

  const destino = destinoSel.value;
  const esGeografico = destino === "4326";

  const dec = esGeografico ? 7 : 3;

  datos.forEach((d, i) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${d.x.toFixed(dec)}</td>
      <td>${d.y.toFixed(dec)}</td>
      <td>${d.x_t !== undefined ? d.x_t.toFixed(dec) : ""}</td>
      <td>${d.y_t !== undefined ? d.y_t.toFixed(dec) : ""}</td>
    `;

    tr.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      mostrarMenu(e.pageX, e.pageY, i);
    });

    tbody.appendChild(tr);
  });
}

function mostrarMenu(x, y, index) {
  const menu = document.createElement("div");
  menu.style.position = "absolute";
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.background = "white";
  menu.style.border = "1px solid #aaa";
  menu.style.borderRadius = "6px";
  menu.style.padding = "6px";
  menu.style.zIndex = 1000;
  menu.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";

  menu.innerHTML = `
    <div style="padding:4px; cursor:pointer;" onclick="copiarFila(${index}, 'origen')">📋 Copiar origen</div>
    <div style="padding:4px; cursor:pointer;" onclick="copiarFila(${index}, 'transformado')">📋 Copiar transformado</div>
    <div style="padding:4px; cursor:pointer; color:red;" onclick="eliminarFila(${index})">🗑 Eliminar</div>
  `;

  document.body.appendChild(menu);

  document.addEventListener("click", () => {
    if (menu) menu.remove();
  }, { once: true });
}

function copiarFila(index, tipo) {
  const d = datos[index];
  let texto = "";

  if (tipo === "origen") {
    texto = `${d.x.toFixed(7)},${d.y.toFixed(7)}`;
  } else {
    texto = `${d.x_t.toFixed(7)},${d.y_t.toFixed(7)}`;
  }

  navigator.clipboard.writeText(texto);
  alert("Coordenada copiada");
}

function eliminarFila(index) {
  datos.splice(index, 1);
  actualizarTabla();
}

function limpiarTodo() {
  if (confirm("¿Desea eliminar todas las coordenadas?")) {
    datos = [];
    actualizarTabla();
  }
}

// ------------------------
// COPIAR TODO
// ------------------------

function copiarTodo(tipo) {
  let texto = "";
  datos.forEach(d => {
    if (tipo === "origen") {
      texto += `${d.x.toFixed(7)},${d.y.toFixed(7)}\n`;
    } else if (d.x_t !== undefined) {
      texto += `${d.x_t.toFixed(7)},${d.y_t.toFixed(7)}\n`;
    }
  });

  navigator.clipboard.writeText(texto);
  alert("Coordenadas copiadas");
}

// ------------------------
// MAPA CON CAPAS
// ------------------------

function mostrarMapa(tipo) {
  if (mapa) mapa.remove();

  mapa = L.map("map").setView([4.6, -74.07], 11);

  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  });

  const sat = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "© Esri" }
  );

  const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenTopoMap"
  });

  osm.addTo(mapa);

  const baseMaps = {
    "Mapa base": osm,
    "Satélite": sat,
    "Topográfico": topo
  };

  capaMarcadores = L.layerGroup().addTo(mapa);

  datos.forEach(d => {
    if (tipo === "origen") {
      capaMarcadores.addLayer(L.marker([d.y, d.x]));
    } else if (d.x_t !== undefined) {
      capaMarcadores.addLayer(L.marker([d.y_t, d.x_t]));
    }
  });

  L.control.layers(baseMaps).addTo(mapa);
}

// ------------------------
// EXPORTAR GEOJSON
// ------------------------

function exportarGeoJSON() {
  if (datos.length === 0 || datos[0].x_t === undefined) {
    alert("Debe transformar las coordenadas antes de exportar.");
    return;
  }

  const features = datos.map(d => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [d.x_t, d.y_t]
    },
    properties: {}
  }));

  const geojson = {
    type: "FeatureCollection",
    features: features
  };

  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "coordenadas_transformadas.geojson";
  a.click();

  URL.revokeObjectURL(url);
}
