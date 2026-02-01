import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import pandas as pd
from pyproj import Transformer
import folium
import webbrowser
import tempfile
import os
import zipfile
import geopandas as gpd
from shapely.geometry import Point

# -------------------------------
# Ventana principal
# -------------------------------
root = tk.Tk()
root.title("Transformador de Coordenadas - EPSG")
root.geometry("1100x650")

df_datos = pd.DataFrame(columns=["X", "Y"])

# -------------------------------
# FUNCIONES AUXILIARES
# -------------------------------
def es_geografico(epsg):
    return epsg in ["4326", "4996"]

def formato_decimal(valor, epsg):
    if valor == "" or pd.isna(valor):
        return ""
    decimales = 7 if es_geografico(epsg) else 3
    return f"{float(valor):.{decimales}f}"

# -------------------------------
# Funciones principales
# -------------------------------
def agregar_manual():
    try:
        x = float(entry_x.get())
        y = float(entry_y.get())
        df_datos.loc[len(df_datos)] = [x, y]
        actualizar_tabla()
        entry_x.delete(0, tk.END)
        entry_y.delete(0, tk.END)
    except:
        messagebox.showerror("Error", "Ingrese valores numéricos válidos")

def cargar_archivo():
    global df_datos
    archivo = filedialog.askopenfilename(
        filetypes=[
            ("Excel", "*.xlsx"),
            ("Texto / CSV", "*.txt *.csv"),
            ("Todos", "*.*")
        ]
    )
    if not archivo:
        return

    try:
        if archivo.endswith(".xlsx"):
            df = pd.read_excel(archivo)
        else:
            try:
                df = pd.read_csv(archivo)
            except:
                df = pd.read_csv(archivo, sep=";")

        columnas = [c.lower() for c in df.columns]

        if "x" in columnas and "y" in columnas:
            df = df.rename(columns={
                df.columns[columnas.index("x")]: "X",
                df.columns[columnas.index("y")]: "Y"
            })
        elif "longitud" in columnas and "latitud" in columnas:
            df = df.rename(columns={
                df.columns[columnas.index("longitud")]: "X",
                df.columns[columnas.index("latitud")]: "Y"
            })
        else:
            messagebox.showerror("Error", "Columnas inválidas")
            return

        df_datos = pd.concat([df_datos, df[["X", "Y"]]], ignore_index=True)
        actualizar_tabla()

    except Exception as e:
        messagebox.showerror("Error", str(e))

def transformar():
    if df_datos.empty:
        messagebox.showwarning("Aviso", "No hay datos")
        return

    transformer = Transformer.from_crs(
        f"EPSG:{combo_origen.get()}",
        f"EPSG:{combo_destino.get()}",
        always_xy=True
    )

    xs, ys = transformer.transform(
        df_datos["X"].values,
        df_datos["Y"].values
    )

    df_datos["X_T"] = xs
    df_datos["Y_T"] = ys
    actualizar_tabla()

def actualizar_tabla():
    tabla.delete(*tabla.get_children())
    for i, r in df_datos.iterrows():
        tabla.insert("", "end", iid=i, values=(
            i + 1,
            formato_decimal(r["X"], combo_origen.get()),
            formato_decimal(r["Y"], combo_origen.get()),
            formato_decimal(r.get("X_T", ""), combo_destino.get()),
            formato_decimal(r.get("Y_T", ""), combo_destino.get())
        ))

# -------------------------------
# COPIAR LINEAL (botones)
# -------------------------------
def copiar_lineal(tipo):
    if df_datos.empty:
        messagebox.showwarning("Aviso", "No hay datos para copiar.")
        return

    texto = ""
    for _, r in df_datos.iterrows():
        if tipo == "origen":
            texto += f"{formato_decimal(r['X'], combo_origen.get())},{formato_decimal(r['Y'], combo_origen.get())}\n"
        else:
            if "X_T" not in df_datos.columns:
                messagebox.showwarning("Aviso", "Debe transformar primero.")
                return
            texto += f"{formato_decimal(r['X_T'], combo_destino.get())},{formato_decimal(r['Y_T'], combo_destino.get())}\n"

    root.clipboard_clear()
    root.clipboard_append(texto)
    messagebox.showinfo("Copiado", "Coordenadas copiadas al portapapeles")

# -------------------------------
# COPIAR DESDE CLIC DERECHO
# -------------------------------
def copiar_seleccion(tipo):
    seleccionado = tabla.selection()
    if not seleccionado:
        messagebox.showwarning("Aviso", "Seleccione una fila primero.")
        return

    iid = seleccionado[0]
    valores = tabla.item(iid, "values")

    if tipo == "origen":
        texto = f"{valores[1]},{valores[2]}"
    else:
        texto = f"{valores[3]},{valores[4]}"

    if "," not in texto or texto.startswith(","):
        messagebox.showwarning("Aviso", "No hay coordenadas disponibles para copiar.")
        return

    root.clipboard_clear()
    root.clipboard_append(texto)
    messagebox.showinfo("Copiado", f"Coordenada copiada:\n{texto}")

# -------------------------------
# ELIMINAR FILA SELECCIONADA
# -------------------------------
def eliminar_seleccion():
    global df_datos
    seleccionado = tabla.selection()
    if not seleccionado:
        messagebox.showwarning("Aviso", "Seleccione una fila primero.")
        return

    iid = seleccionado[0]
    indice = int(iid)

    if messagebox.askyesno("Confirmar", "¿Desea eliminar esta coordenada?"):
        df_datos = df_datos.drop(df_datos.index[indice]).reset_index(drop=True)
        actualizar_tabla()

# -------------------------------
# BORRAR TODAS
# -------------------------------
def borrar_todo():
    global df_datos
    if messagebox.askyesno("Confirmar", "¿Desea borrar todas las coordenadas?"):
        df_datos = pd.DataFrame(columns=["X", "Y"])
        actualizar_tabla()

# -------------------------------
# MAPA (con capas)
# -------------------------------
def mostrar_mapa(tipo):
    if df_datos.empty:
        return

    if tipo == "origen":
        lat = df_datos["Y"].mean()
        lon = df_datos["X"].mean()
    else:
        if "X_T" not in df_datos.columns:
            messagebox.showwarning("Aviso", "Debe transformar primero.")
            return
        lat = df_datos["Y_T"].mean()
        lon = df_datos["X_T"].mean()

    m = folium.Map(location=[lat, lon], zoom_start=14)

    folium.TileLayer("OpenStreetMap", name="Mapa base").add_to(m)
    folium.TileLayer(
        tiles="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attr="ESRI",
        name="Satélite"
    ).add_to(m)

    for _, r in df_datos.iterrows():
        if tipo == "origen":
            folium.Marker([r["Y"], r["X"]]).add_to(m)
        else:
            folium.Marker([r["Y_T"], r["X_T"]]).add_to(m)

    folium.LayerControl().add_to(m)

    archivo = tempfile.NamedTemporaryFile(delete=False, suffix=".html")
    m.save(archivo.name)
    webbrowser.open(f"file:///{archivo.name}")

# -------------------------------
# EXPORTAR SHAPEFILE EPSG:9377
# -------------------------------
def exportar_shapefile():
    if df_datos.empty or "X_T" not in df_datos:
        messagebox.showwarning("Aviso", "Debe transformar primero")
        return

    transformer = Transformer.from_crs(
        f"EPSG:{combo_destino.get()}",
        "EPSG:9377",
        always_xy=True
    )

    puntos = []
    for _, r in df_datos.iterrows():
        x, y = transformer.transform(r["X_T"], r["Y_T"])
        puntos.append(Point(x, y))

    gdf = gpd.GeoDataFrame(geometry=puntos, crs="EPSG:9377")

    tmpdir = tempfile.mkdtemp()
    shp_path = os.path.join(tmpdir, "coordenadas.shp")
    gdf.to_file(shp_path)

    zip_path = filedialog.asksaveasfilename(
        defaultextension=".zip",
        filetypes=[("ZIP", "*.zip")]
    )

    if zip_path:
        with zipfile.ZipFile(zip_path, 'w') as z:
            for f in os.listdir(tmpdir):
                z.write(os.path.join(tmpdir, f), f)

        messagebox.showinfo("OK", "Shapefile exportado en EPSG:9377")

# -------------------------------
# INTERFAZ
# -------------------------------
frame_manual = tk.LabelFrame(root, text="Entrada manual")
frame_manual.pack(fill="x", padx=10, pady=5)

tk.Label(frame_manual, text="X / Longitud").grid(row=0, column=0)
entry_x = tk.Entry(frame_manual, width=15)
entry_x.grid(row=0, column=1)

tk.Label(frame_manual, text="Y / Latitud").grid(row=0, column=2)
entry_y = tk.Entry(frame_manual, width=15)
entry_y.grid(row=0, column=3)

tk.Button(frame_manual, text="➕ Agregar", command=agregar_manual).grid(row=0, column=4, padx=10)
tk.Button(frame_manual, text="🗑️ Borrar todo", command=borrar_todo).grid(row=0, column=5, padx=10)

frame_epsg = tk.LabelFrame(root, text="Sistema de coordenadas")
frame_epsg.pack(fill="x", padx=10, pady=5)

epsg_lista = ["4326", "3116", "3115", "9377", "4996"]

combo_origen = ttk.Combobox(frame_epsg, values=epsg_lista, width=8)
combo_origen.set("4326")
combo_origen.grid(row=0, column=1)

combo_destino = ttk.Combobox(frame_epsg, values=epsg_lista, width=8)
combo_destino.set("3116")
combo_destino.grid(row=0, column=3)

tk.Label(frame_epsg, text="Origen").grid(row=0, column=0)
tk.Label(frame_epsg, text="Destino").grid(row=0, column=2)

tk.Button(frame_epsg, text="🔄 Transformar", command=transformar).grid(row=0, column=4, padx=10)

tk.Button(root, text="📂 Cargar Excel / TXT / CSV", command=cargar_archivo).pack(pady=5)

frame_acciones = tk.Frame(root)
frame_acciones.pack(pady=5)

tk.Button(frame_acciones, text="🗺️ Mapa ORIGEN", command=lambda: mostrar_mapa("origen")).grid(row=0, column=0, padx=5)
tk.Button(frame_acciones, text="🗺️ Mapa TRANSFORMADO", command=lambda: mostrar_mapa("transformado")).grid(row=0, column=1, padx=5)
tk.Button(frame_acciones, text="📋 Copiar ORIGEN", command=lambda: copiar_lineal("origen")).grid(row=0, column=2, padx=5)
tk.Button(frame_acciones, text="📋 Copiar TRANSFORMADO", command=lambda: copiar_lineal("transformado")).grid(row=0, column=3, padx=5)
tk.Button(frame_acciones, text="🧭 Exportar SHAPE (EPSG:9377)", command=exportar_shapefile).grid(row=0, column=4, padx=5)

columnas = ("N°", "X", "Y", "X Transformado", "Y Transformado")
tabla = ttk.Treeview(root, columns=columnas, show="headings")

for c in columnas:
    tabla.heading(c, text=c)
    tabla.column(c, anchor="center")

tabla.pack(expand=True, fill="both", padx=10, pady=10)

# -------------------------------
# MENÚ CONTEXTUAL (clic derecho)
# -------------------------------
menu_contextual = tk.Menu(root, tearoff=0)
menu_contextual.add_command(label="📋 Copiar coordenada ORIGEN", command=lambda: copiar_seleccion("origen"))
menu_contextual.add_command(label="📋 Copiar coordenada TRANSFORMADA", command=lambda: copiar_seleccion("transformado"))
menu_contextual.add_separator()
menu_contextual.add_command(label="🗑️ Eliminar coordenada", command=eliminar_seleccion)

def mostrar_menu(event):
    item = tabla.identify_row(event.y)
    if item:
        tabla.selection_set(item)
        menu_contextual.post(event.x_root, event.y_root)

tabla.bind("<Button-3>", mostrar_menu)

root.mainloop()
