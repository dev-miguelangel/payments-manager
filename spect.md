# Pagos

## Necesidad
Cuando realizo los pagos mes a mes se me confunde lo que he pagado y lo que no y al pagar me aparecen los comprobantes, los guardo pero luego no me doy el tiempo de ordenar las impresiones de pantalla o los pdf con comprobantes. 

Tambien me gustaría tener una lista de pagos que realizo mensualmente, guardando las url de los sitios.

### Acciones que imagino
- Cuando estoy en una pagina de pago, abrir la extencion y chickear guardar como pago mensual o guardar como pago único.
- Esto debe agregar la url a una lista de pagos, separados como pago unico o pago mensual.
- Debe crear un directorio en la raiz escogida por el usuario con la estructura:
    - Pagos/
    -- Únicos/
    --- ${nombre del mes}/
    ---- ${url}/
    -- Mensuales
    --- ${nombre del mes}/
    ---- ${url}/
- El url utilizado como nombre para el directiorio debe ser solo el dominio del sitio
- Al guardar una url debe permitir asignar un alias
- Si la url tiene un alias el directorio se debe crear con ese alias
- Cuando este navegando en un sitio guardado en la lista, debe mostrar un borde blanco el rededor de la pagina
- En cualquier momento debo poder guardar un print de la pagina y debe quedar dentro del directorio que le corresponde

---

## Estado actual (v0.5.1)

Las 5 fases del plan están terminadas, junto con los ajustes que se pidieron después. Esta sección describe cómo funciona hoy la extensión.

### Decisiones
| Tema | Decisión |
|---|---|
| Guardado de archivos | File System Access API con una carpeta raíz elegida por el usuario. El handle se guarda en IndexedDB y Chrome puede volver a pedir permiso en cada sesión |
| Interfaz | Panel lateral (`chrome.sidePanel`) que se abre al pulsar el icono de la extensión |
| Pagado / pendiente | Un pago queda **pagado** en el mes al guardar un comprobante (captura o PDF). También se puede marcar o desmarcar a mano |
| Carpeta del mes | `AAAA-MM NombreMes`, por ejemplo `2026-10 Octubre` |
| Borde | Blanco con una línea oscura fina por dentro. Se activa o desactiva por sitio (`showBorder`) y requiere el permiso de ese dominio |
| Captura | Solo la parte visible (`chrome.tabs.captureVisibleTab`). El borde se oculta mientras se captura |
| Permiso de captura | `captureVisibleTab` exige `activeTab` o `<all_urls>`. Por defecto se usa el menú del clic derecho o el atajo (que dan `activeTab`). Desde el panel funciona siempre si se activa "Capturas desde el panel" (`<all_urls>`, opcional) |
| PDF automáticos | Los PDF descargados desde un sitio guardado se mueven a su carpeta |
| Identidad del sitio | El hostname sin `www.`. Los subdominios cuentan como sitios distintos (`pagos.banco.cl` ≠ `banco.cl`) |
| Nombre de los comprobantes | Capturas: `AAAA-MM-DD_HH-MM-SS.png`. PDF: su nombre original (si ya existe, `nombre (2).pdf`) |
| Permisos de host | Opcionales: se piden por dominio al guardar un sitio y se devuelven al eliminarlo |
| Abrir en Finder | Descartado (necesitaba un programa auxiliar de native messaging instalado en el Mac) |

### Interfaz del panel

**Vista principal**, de arriba abajo:
1. La cabecera **Pagos** y un ⚙ de configuración general.
2. Las listas:
   - **Mensuales:** selector de mes (‹ ›), una barra de progreso ("3 de 5 pagados · 2 pendientes") y la lista del mes. Cada pago tiene su casilla para marcarlo, su estado (**Pagado** o **Pendiente**) y un ⚙. Un pago solo aparece en los meses desde que se guardó.
   - **Únicos:** la lista con el ⚙ de cada uno.
   - Las dos listas van en orden alfabético por alias o dominio, sin distinguir mayúsculas ni tildes, y el orden no cambia al marcar un pago como pagado.
   - Al pinchar un elemento se cambia a la pestaña del sitio si ya está abierta: primero la de la ventana actual y, si no, la de otra ventana, que se trae al frente. Si no está abierto, se abre una pestaña nueva.
   - El sitio de la pestaña actual queda resaltado.
3. **📸 Guardar comprobante**, si la pestaña actual es un sitio guardado. Si Chrome bloquea la captura, aparece un aviso con las alternativas y el botón **Abrir configuración**.
4. **+ Agregar este sitio**, si la pestaña es una web sin guardar. Despliega el alias y los botones **Mensual**, **Único** y **Cancelar**.
5. **Comprobantes recibidos:** PDF y capturas que llegaron por el menú, el atajo o una descarga, con su ruta o su error. Solo aparece cuando hay alguno.

**⚙ de un sitio:**
- Alias y tipo (mensual o único).
- Interruptor **Borde blanco**.
- Interruptor **Capturas desde el panel**, que es global y pide `<all_urls>`.
- **Eliminar sitio**, con doble confirmación.

**⚙ general:**
- Carpeta de comprobantes.
- Atajo de teclado, con un botón que abre `chrome://extensions/shortcuts`.

### Otras formas de guardar un comprobante
- **Clic derecho → Guardar comprobante (Pagos):** solo aparece en los sitios guardados.
- **Atajo Alt+Shift+P:** se puede cambiar en `chrome://extensions/shortcuts`.
- En los dos casos el background captura la pantalla, abre el panel y el panel escribe el archivo.

### Icono de la extensión
- Un comprobante blanco con un check verde sobre un fondo azul (`icons/icon16|32|48|128.png`).
- Un número naranja muestra los pagos mensuales pendientes del mes. Se recalcula al cambiar los datos y cada 6 horas (`chrome.alarms`), para que vuelva a contar al empezar un mes nuevo.

### Estructura de carpetas
```
<raíz elegida>/
└── Pagos/                       (si la raíz ya se llama "Pagos", no se crea otra dentro)
    ├── Mensuales/
    │   └── 2026-10 Octubre/
    │       └── <alias o dominio>/
    │           ├── 2026-10-30_14-35-02.png
    │           └── boleta.pdf
    └── Únicos/
        └── 2026-10 Octubre/
            └── <alias o dominio>/
```
Al usar un alias como nombre de carpeta o archivo se quitan los caracteres no válidos (`/ \ : * ? " < > |`).

### Modelo de datos

`chrome.storage.local`:
```js
payments: [{
  id: string,           // uuid
  domain: string,       // "banco.cl"
  alias: string,        // "" si no tiene
  type: "monthly" | "once",
  url: string,          // URL desde donde se guardó
  createdAt: number,
  paidMonths: string[], // ["2026-10", ...]
  showBorder?: boolean  // false = borde desactivado (por defecto, activo)
}]
```

IndexedDB `pagos`:
- `handles`: guarda el handle de la carpeta raíz (`root`).
- `pendingPdfs`: comprobantes esperando a que el panel los escriba, con la forma `{ id, paymentId, filename, createdAt, blob?, error? }`. `id` es el id de la descarga (número) para los PDF, o `"shot-<timestamp>"` para las capturas del menú o el atajo.

`chrome.storage.session`:
- `dl:<downloadId>`: el sitio y la pestaña que iniciaron cada descarga.

### PDF automáticos
- Chrome no deja leer una descarga terminada, así que el background vuelve a pedir el PDF. Lo intenta primero desde la pestaña del sitio, con su sesión, lo que también sirve para las URL `blob:`.
- Comprueba que el archivo empiece por `%PDF-`, para no guardar una página de login o de error, y lo deja en IndexedDB.
- El panel lo escribe en la carpeta, marca el mes como pagado y borra la copia de Descargas.
- Si el panel está cerrado, el PDF espera hasta que se abra. Si falta el permiso de la carpeta, aparece el botón **Mover a la carpeta**.
- Si no se puede volver a obtener (por ejemplo, un PDF generado por un formulario POST), queda en Descargas y el panel lo avisa.
- Los PDF que solo se abren en el visor de Chrome, sin descargarse, no cuentan. Para esos se usa la captura o el botón de descarga del visor.

### Permisos (`manifest.json`)
| Permiso | Para qué |
|---|---|
| `storage` | Guardar la lista de pagos |
| `sidePanel` | Mostrar el panel lateral |
| `tabs` | Conocer la URL de las pestañas y cambiar entre ellas |
| `scripting` | Mostrar el borde y ocultarlo durante la captura |
| `activeTab` | Capturar desde el icono, el menú o el atajo |
| `alarms` | Recalcular el número del icono |
| `downloads` | Detectar los PDF y borrar la copia de Descargas |
| `contextMenus` | El menú "Guardar comprobante (Pagos)" |
| `optional_host_permissions: <all_urls>` | Se pide solo por dominio, o completo si se activa "Capturas desde el panel" |

### Archivos
```
manifest.json
background.js      abre el panel, mantiene el borde, gestiona el menú, el atajo, el número del icono y los PDF descargados
border.js          content script del borde
sidepanel.html/css/js
lib/storage.js     CRUD de pagos, dominios, meses y estado pagado
lib/files.js       carpeta raíz, escritura de archivos y comprobantes pendientes (IndexedDB)
lib/capture.js     captura de la pestaña ocultando el borde
icons/             icono de la extensión en 16, 32, 48 y 128 px
```

### Fases (todas terminadas)
1. **Lista de pagos:** guardar un sitio como mensual o único con alias, y listarlo, editarlo y eliminarlo.
2. **Borde:** content script dinámico solo en los dominios guardados.
3. **Carpetas y comprobantes:** elegir la raíz, crear la estructura y guardar la captura.
4. **Pagado / pendiente:** lista de pagos del mes, número en el icono y navegación entre meses.
5. **PDF automáticos:** mover a su carpeta los PDF descargados desde sitios guardados.

Ajustes posteriores:
- Menú del clic derecho y atajo para capturar.
- Icono de la extensión.
- Vista con las listas primero y un ⚙ por sitio.
- Orden alfabético fijo.
- Cambiar a la pestaña del sitio si ya está abierta.
