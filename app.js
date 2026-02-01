let datos = [];
let mapa;
let capaMarcadores;

// EPSG comunes
const epsgList = {
  "4326": "+proj=longlat +datum=WGS84 +no_defs",
  "3116": "+proj=tmerc +lat_0=4.59620041666667 +lon_0=-74.0775079166667 +k=0.9992 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs",
  "3115": "+proj=tmerc +lat_0=4 +lon_0=-73 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs",
  "9377": "+proj=tmerc +lat_0=4.59620041666667 +lon_0=-74.0775079166667 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs"
};

// Cargar combos
const origenSel = document.getElementById("epsgOrigen");
const destinoSel = document.getElementById("epsgDestino");

for (let epsg in epsgList) {
  origenSel.add(new Option(epsg, epsg));
  destinoSel.add(new Option(epsg, epsg));
}
origenSel.value = "4326";
destinoSel.value = "3116";

// ------------------------
// Funciones
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

function transformar() {
  const origen = origenSel.value;
  const destino = destinoSel.value;

  datos.forEach(d => {
    const res = proj4(epsgList[origen], epsgList[destino], [d.x, d.y]);
    d.x_t = res[0];
    d.y_t = res[1];
  });

  actualizarTabla();
}

function actualizarTabla() {
  const tbody = document.querySelector("#tabla tbody");
  tbody.innerHTML = "";

  datos.forEach((d, i) => {
    const tr = document.createElement("tr");

    const isGeografico = origenSel.value === "4326" || destinoSel.value === "4326";
    const dec = isGeografico ? 7 : 3;

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${d.x.toFixed(dec)}</td>
      <td>${d.y.toFixed(dec)}</td>
      <td>${d.x_t !== undefined ? d.x_t.toFixed(dec) : ""}</td>
      <td>${d.y_t !== undefined ? d.y_t.toFixed(dec) : ""}</td>
    `;

    // Clic derecho (copiar o eliminar)
    tr.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      mostrarMenu(e.pageX, e.pageY, i);
    });

    tbody.appendChild(tr);
  });
}

// ------------------------
// MENÚ CONTEXTUAL
// ------------------------

function mostrarMenu(x, y, index) {
  const menu = document.createElement("div");
  menu.style.position = "absolute";
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.background = "white";
  menu.style.border = "1px solid #aaa";
  menu.style.padding = "5px";
  menu.style.zIndex = 1000;

  menu.innerHTML = `
    <div onclick="copiarFila(${index}, 'origen')">📋 Copiar origen</div>
    <div onclick="copiarFila(${index}, 'transformado')">📋 Copiar transformado</div>
    <div onclick="eliminarFila(${index})" style="color:red;">🗑 Eliminar</div>
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
// MAPA
// ------------------------

function mostrarMapa(tipo) {
  if (mapa) {
    mapa.remove();
  }

  mapa = L.map("map").setView([4.6, -74.07], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(mapa);

  capaMarcadores = L.layerGroup().addTo(mapa);

  datos.forEach(d => {
    if (tipo === "origen") {
      capaMarcadores.addLayer(L.marker([d.y, d.x]));
    } else if (d.x_t !== undefined) {
      capaMarcadores.addLayer(L.marker([d.y_t, d.x_t]));
    }
  });
}
