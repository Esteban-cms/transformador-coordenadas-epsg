let datos = [];
let mapa;
let capaMarcadores;
let marcadorSeleccionado = null;
let filaSeleccionada = null;

/* DEFINICIONES EPSG OFICIALES */
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

/* MAGNA Colombia Oeste */
proj4.defs("EPSG:3115", "+proj=tmerc +lat_0=4 +lon_0=-77 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs");

/* MAGNA Colombia Bogotá */
proj4.defs("EPSG:3116", "+proj=tmerc +lat_0=4.59620041666667 +lon_0=-74.0775079166667 +k=0.9992 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs");

/* MAGNA Colombia Central (EPSG:9377) — ESTA ERA LA QUE ESTABA MAL */
proj4.defs("EPSG:9377", "+proj=tmerc +lat_0=4 +lon_0=-73 +k=1 +x_0=500000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");

const origenSel = document.getElementById("epsgOrigen");
const destinoSel = document.getElementById("epsgDestino");

["3115", "3116", "4326", "9377"].forEach(epsg => {
  origenSel.add(new Option("EPSG:" + epsg, epsg));
  destinoSel.add(new Option("EPSG:" + epsg, epsg));
});

origenSel.value = "4326";
destinoSel.value = "9377";

/* -------------------- INGRESO -------------------- */

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

/* -------------------- TRANSFORMACIÓN CORRECTA -------------------- */

function transformar() {
  const origen = "EPSG:" + origenSel.value;
  const destino = "EPSG:" + destinoSel.value;

  datos.forEach(d => {
    const [x2, y2] = proj4(origen, destino, [d.x, d.y]);
    d.x_t = x2;
    d.y_t = y2;
  });

  actualizarTabla();
}

/* -------------------- TABLA -------------------- */

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

    tr.addEventListener("click", () => seleccionarFila(i, tr));
    tr.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      mostrarMenu(e.pageX, e.pageY, i);
    });

    tbody.appendChild(tr);
  });
}

/* -------------------- SELECCIÓN -------------------- */

function seleccionarFila(index, tr) {
  if (filaSeleccionada) filaSeleccionada.classList.remove("seleccionada");
  tr.classList.add("seleccionada");
  filaSeleccionada = tr;

  if (marcadorSeleccionado) marcadorSeleccionado.setIcon(iconoNormal);

  const d = datos[index];
  if (mapa && capaMarcadores) {
    capaMarcadores.eachLayer(layer => {
      const { lat, lng } = layer.getLatLng();
      if (
        Math.abs(lat - d.y) < 1e-8 && Math.abs(lng - d.x) < 1e-8 ||
        (d.y_t !== undefined && Math.abs(lat - d.y_t) < 1e-8 && Math.abs(lng - d.x_t) < 1e-8)
      ) {
        layer.setIcon(iconoSeleccionado);
        marcadorSeleccionado = layer;
      }
    });
  }
}

/* -------------------- MENÚ CLIC DERECHO -------------------- */

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
    texto = `${d.x},${d.y}`;
  } else {
    texto = `${d.x_t},${d.y_t}`;
  }

  navigator.clipboard.writeText(texto);
  alert("Coordenada copiada");
}

function eliminarFila(index) {
  datos.splice(index, 1);
  actualizarTabla();
}

/* -------------------- ACCIONES -------------------- */

function copiarTodo(tipo) {
  let texto = "";
  datos.forEach(d => {
    if (tipo === "origen") {
      texto += `${d.x},${d.y}\n`;
    } else if (d.x_t !== undefined) {
      texto += `${d.x_t},${d.y_t}\n`;
    }
  });

  navigator.clipboard.writeText(texto);
  alert("Coordenadas copiadas");
}

function limpiarTodo() {
  if (confirm("¿Desea eliminar todas las coordenadas?")) {
    datos = [];
    actualizarTabla();
    if (mapa) {
      mapa.remove();
      mapa = null;
    }
  }
}

/* -------------------- MAPA -------------------- */

const iconoNormal = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});

const iconoSeleccionado = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});

function mostrarMapa(tipo) {
  if (mapa) mapa.remove();

  mapa = L.map("map");

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

  let bounds = [];

  datos.forEach(d => {
    let lat, lng;

    if (tipo === "origen") {
      lat = d.y;
      lng = d.x;
    } else if (d.x_t !== undefined) {
      lat = d.y_t;
      lng = d.x_t;
    } else {
      return;
    }

    const marcador = L.marker([lat, lng], { icon: iconoNormal });
    capaMarcadores.addLayer(marcador);
    bounds.push([lat, lng]);
  });

  if (bounds.length > 0) {
    mapa.fitBounds(bounds, { padding: [30, 30] });
  } else {
    mapa.setView([4.6, -74.07], 11);
  }

  L.control.layers(baseMaps).addTo(mapa);
}

/* -------------------- EXPORTAR GEOJSON -------------------- */

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
