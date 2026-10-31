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

---

## Plan v2: nuevas funciones

Doce funciones nuevas, agrupadas en 10 fases (de la 6 a la 15). Antes de las fases se cambia el modelo de datos, porque varias funciones dependen de ese cambio.

### Modelo de datos v2
```js
payments: [{
  id, domain, alias, url, createdAt, showBorder,   // igual que antes
  type: "recurring" | "once",            // "monthly" pasa a "recurring"
  frequency: 1 | 2 | 3 | 6 | 12,         // cada cuántos meses (solo recurring; 1 = mensual)
  startMonth: "2026-10",                 // primer mes en que corresponde (ancla de la frecuencia)
  endMonth: null | "2027-03",            // pausado/terminado desde ese mes (fase 7)
  dueDay: null | 1..31,                  // día de vencimiento (fase 8)
  archived: false,                       // pagos únicos archivados (fase 7)
  fields: [{ label, value }],            // notas: Nº cliente, cuenta, RUT… (fase 10)
  captureMode: "visible" | "full",       // tipo de captura por defecto (fase 12)
  successKeywords: string[],             // frases de "pago exitoso" propias del sitio (fase 13)
  records: {                             // reemplaza a paidMonths
    "2026-10": { paid: true, paidAt: 1730300000000, amount: 24500 | null }
  }
}]
settings: { reminderDaysBefore: 3, reminderHour: 9, currency: "CLP" }
notified: { "<paymentId>:2026-10": "before" | "overdue" }   // para no repetir avisos
```
- **Migración automática** al actualizar: `type: "monthly"` pasa a ser `recurring` con `frequency: 1`, y `startMonth` se calcula desde `createdAt`. Cada mes de `paidMonths` se convierte en `records[mes] = { paid: true, paidAt: null, amount: null }`.
- **Un pago "corresponde" a un mes** cuando ese mes es igual o posterior a `startMonth`, cae en un múltiplo de `frequency` contado desde `startMonth`, es anterior a `endMonth` (si lo tiene) y el pago no está archivado.

---

### Fase 6 — Varios pagos en el mismo sitio (#2) ✅ hecha (v0.6.0)
- La conversión de datos también está hecha: `type: "recurring"` con `records`, y los comprobantes nuevos de pagos recurrentes van a `Recurrentes/`.
- **Sin restricción de dominio único:** un dominio puede tener varios pagos. El alias pasa a ser **obligatorio** desde el segundo pago de un mismo sitio, para que sus carpetas no se mezclen.
- **Panel en un sitio con varios pagos:**
  - Muestra **📸 Guardar comprobante para…** con un botón por cada pago: `[Luz] [Agua] [Gas]`.
  - Añade **+ Agregar otro pago en este sitio**.
- **Clic derecho:** si el sitio tiene un solo pago, funciona como hoy. Si tiene varios, aparece un submenú *Guardar comprobante (Pagos) ▸ Luz / Agua / Gas*.
- **Atajo y PDF descargados:** si el dominio tiene varios pagos, el comprobante llega a **Comprobantes recibidos** marcado como "¿De qué pago es?" y se elige el pago con botones antes de moverlo.
- **Borde:** sigue siendo por dominio. Se muestra si al menos uno de los pagos del sitio lo tiene activado.
- **Permisos:** el permiso del dominio se devuelve solo al eliminar el último pago de ese sitio.
- **Resaltado:** en las listas se resaltan todos los pagos del sitio actual.

### Fase 7 — Frecuencias, pausar y archivar (#7, #9) ✅ hecha (v0.7.0)
- Los recurrentes que existen pero no corresponden al mes elegido van en un plegable "No corresponden en <mes>", con su próximo mes. Los pausados y los archivados van juntos en "Archivados y pausados".
- Si se pausa un pago ya pagado este mes, la pausa empieza el mes siguiente y se puede cancelar.
- **Frecuencias:** en ⚙ → Tipo se puede elegir *Único / Mensual / Bimestral / Trimestral / Semestral / Anual*, junto con el **mes de inicio**.
- **Sección "Recurrentes"** (antes "Mensuales"): muestra solo los pagos que corresponden al mes elegido. Los que no son mensuales llevan una etiqueta, por ejemplo *Anual* o *Trimestral*.
- **Pausar:** en ⚙ hay un botón **Pausar desde este mes** (pone `endMonth`) para suscripciones canceladas. El historial se conserva y hay un botón **Reanudar**.
- **Archivar:** los pagos únicos tienen **Archivar** en su ⚙. Los archivados se agrupan en una sección **Archivados (n)** plegada al final de la lista.
- **Sugerencia automática:** los pagos únicos que llevan más de 60 días pagados muestran "¿Archivar?".

### Fase 8 — Vencimientos y recordatorios (#1) ✅ hecha (v0.8.0)
- Si un pago se guardó después de su vencimiento de ese mes, no se marca como vencido.
- La revisión corre cada 30 minutos con la alarma `tick` (que reemplaza a `badge`). La alarma solo se crea si no existe, para que no se reinicie cada vez que despierta el background.
- **Día de vencimiento:** se define en ⚙ como **Vence el día [10]**. En los meses más cortos se ajusta al último día del mes (un pago que vence el 31 vence el 28 o 29 en febrero).
- **Estados en la lista:**
  - ⏳ *Pendiente · vence el 10*
  - 🟠 *Vence en 2 días*
  - 🔴 *Vencido hace 3 días*
  - ✅ *Pagado*
- **Número del icono:** cuenta los pendientes. Se pone **rojo** si hay alguno vencido y queda **naranja** si no.
- **Notificaciones de Chrome** (permiso `notifications`, revisión con `chrome.alarms`):
  - *"Luz vence en 3 días"*, los N días antes configurados.
  - *"Luz está vencido"*, el día después del vencimiento.
  - Cada aviso sale una sola vez por pago y por mes (`notified`), a la hora configurada.
  - Al pulsar la notificación se abre el sitio (o se cambia a su pestaña) y el panel.
- **⚙ general:** "Avisarme [3] días antes, a las [09:00]" y un interruptor para desactivar las notificaciones.

### Fase 9 — Montos e historial (#3) ✅ hecha (v0.9.0)
- El campo de monto aparece al marcar la casilla, al guardar un comprobante desde el panel y al mover un PDF o una captura. En un pago ya pagado, se pulsa *Pagado* para agregar o corregir el monto.
- Poner un monto en un mes sin pagar lo marca como pagado. El total del mes suma los pagos recurrentes y los únicos.
- El gráfico tiene una sola serie y un solo color, con tooltip al pasar el ratón. La lista del historial sirve como vista de tabla. Si todavía no hay montos, el gráfico no se muestra.
- **Al marcar un pago como pagado,** ya sea con la casilla o guardando un comprobante, aparece en esa fila un campo opcional **Monto $ [_____]**, que se puede dejar vacío.
- **Formato:** `Intl.NumberFormat('es-CL', { currency: 'CLP' })`, que muestra $24.500.
- **Cabecera del mes:** junto al progreso se ve el total, por ejemplo "3 de 5 pagados · $245.300".
- **En el ⚙ de cada sitio:** un **Historial** de los últimos 12 meses con el monto, un pequeño gráfico de barras y la variación respecto al mes anterior (▲ 12 %). Cada monto se puede editar.
- **Monto sugerido:** el del mes anterior aparece de forma tenue en el campo, como referencia.
- **Monto fijo** (`defaultAmount`, solo recurrentes, v0.12.0): se puede indicar al agregar el sitio o en ⚙, por ejemplo la cuota de un crédito. Al marcar el mes como pagado, por casilla, captura o PDF, el monto queda guardado con ese valor y el campo aparece ya relleno para confirmarlo o cambiarlo. Un monto cambiado a mano no se pisa.

### Fase 10 — Notas y datos del pago (#8) ✅ hecha (v0.10.0)
- Los datos y la nota se guardan solos al salir de cada campo. El nombre del dato sugiere opciones comunes (Nº cliente, Nº de cuenta, RUT, Contrato, Medidor, Patente, Rol…).
- En un sitio con varios pagos, los datos se agrupan por pago.
- **Campos en ⚙:** una lista de **Datos** del tipo etiqueta y valor, como *Nº cliente: 1234567*, *Cuenta: 00-123-45678-9* o *RUT: 12.345.678-9*.
- **Mientras pagas:** en la vista principal, debajo del botón 📸, aparecen los datos de ese sitio con un botón 📋 **copiar** en cada uno.
- **Nota libre opcional:** por ejemplo "pagar con la tarjeta X".

### Fase 11 — Ver comprobantes desde el panel (#4) ✅ hecha (v0.11.0)
- El índice `receipts: { "2026-10": [{ dir, name }] }` se actualiza al guardar cada comprobante y se sincroniza con el disco al abrir el ⚙. Así el 📎 de las listas no tiene que recorrer las carpetas.
- `pastFolders` guarda los nombres de carpeta anteriores cuando cambia el alias. La búsqueda mira en `Recurrentes/`, `Únicos/` y la antigua `Mensuales/`.
- **Sección "Comprobantes" en ⚙:** lee la carpeta del sitio con la File System Access API y lista sus archivos agrupados por mes, de lo más reciente a lo más antiguo.
- **Abrir:** al pulsar un archivo se abre en una pestaña nueva (las imágenes y los PDF se ven directamente en Chrome).
- **En la lista del mes:** los pagos con comprobante muestran un 📎. Al pulsarlo se abre el comprobante de ese mes.
- **Tipo de pago cambiado:** si un pago cambió de tipo o de alias, se buscan sus comprobantes en las dos carpetas posibles.

### Fase 12 — Captura de página completa (#6)
- **Cómo funciona:** desplazar la página y unir las partes. Se hace un `captureVisibleTab` por cada tramo de pantalla (Chrome permite como máximo 2 por segundo), los elementos fijos o pegajosos se ocultan después del primer tramo y todo se une en un `OffscreenCanvas`.
- **Alternativa descartada:** `chrome.debugger`, porque muestra la barra "Pagos está depurando este navegador" y pide un permiso con una advertencia que asusta.
- **Valor por defecto:** se elige por sitio en ⚙ (`captureMode`). En el menú del clic derecho aparecen *Guardar comprobante (visible)* y *(página completa)*.
- **Límite de altura:** como máximo unos 15 000 px, para páginas infinitas.

### Fase 13 — Detectar la página de pago exitoso (#5)
- **Qué busca:** en los sitios guardados, `border.js` pasa a llamarse `site.js` y busca en el texto de la página frases como *"pago exitoso"*, *"pago realizado"*, *"transacción aprobada"*, *"comprobante de pago"*, *"su pago fue procesado"*, más las del sitio (`successKeywords`). Usa un MutationObserver con debounce y se activa una sola vez por URL.
- **Al detectarlo:**
  - Con **Capturas desde el panel** (`<all_urls>`) activadas: se **captura sola** y aparece en *Comprobantes recibidos* con la opción "Deshacer".
  - Sin ese permiso: aparece un aviso flotante dentro de la página, *"¿Guardar comprobante? Pulsa Alt+Shift+P"*. Chrome no deja capturar desde un botón dentro de la página sin `activeTab`.
- **En ⚙ del sitio:** un interruptor **Detectar pago exitoso** y la edición de las frases propias.

### Fase 14 — Abrir todos los pendientes (#10)
- **Botón "Abrir pendientes (n)"** en la cabecera de Recurrentes. Abre los pagos pendientes del mes, cada uno en su pestaña.
- **Reutiliza pestañas:** usa la misma lógica de cambiar a la pestaña si ya está abierta y no repite dominios.
- **Agrupa** las pestañas en un grupo de Chrome llamado "Pagos — Octubre" (permiso `tabGroups`).

### Fase 15 — Respaldo y resúmenes (#11, #12)
- **Respaldo ✅ hecho (v0.12.0):** en ⚙ general, **Respaldar ahora** guarda `Pagos/Respaldos/pagos-2026-10-30_14-35-02.json` en la carpeta de comprobantes (si no hay carpeta elegida, la pide). Contiene `app`, `version`, `exportedAt`, `payments` y `settings`; no incluye los comprobantes (ya están en la carpeta) ni la clave. Debajo del botón se muestra el último respaldo (`lastBackup` en `chrome.storage.local`).
- **Restaurar respaldo ✅ hecho (v0.12.0):** en ⚙ general, **Restaurar…** abre el selector en `Pagos/Respaldos/`. Se valida el archivo y se muestra un aviso con su fecha y cantidad de pagos; al confirmar:
  - Se piden en un solo aviso los permisos de los sitios que no los tienen (para el borde). Se restaura aunque se rechace.
  - Se guarda antes `Pagos/Respaldos/pagos-antes-de-restaurar-<fecha>.json` con el estado actual.
  - Se **fusiona sin borrar nada**. Un pago coincide por `id` o, si no, por sitio y alias (un sitio agregado de nuevo después de *Olvidé mi clave* tiene otro `id`). En los que coinciden manda la configuración actual y se suman los meses, montos y comprobantes del respaldo; en un mes presente en los dos gana el actual, pero un monto vacío se completa con el del respaldo. Los datos, la nota, el vencimiento y el monto fijo se toman del respaldo solo si aquí están vacíos.
  - Los pagos que no existen se agregan. Si su alias ya lo usa otro sitio, se guardan como *Alias (respaldo)*.
  - En la configuración mandan los valores cambiados aquí; el resto viene del respaldo.
- **Resumen CSV:** en ⚙ general, para un **mes** o un **año**:
  - Se guarda en `Pagos/Resúmenes/2026.csv` o `2026-10.csv`.
  - Columnas: *Mes; Pago; Sitio; Tipo; Frecuencia; Vence; Estado; Fecha de pago; Monto; Comprobantes*.
  - Usa separador `;` y UTF-8 con BOM, para que Excel en español lo abra bien.
  - Al final incluye una fila de **Total**.

### Fase 16 — Resumen de pagos ✅ hecha (v0.12.0)
- **Acceso:** botón 📊 en la cabecera del panel, junto al ⚙. Abre `summary.html` en una pestaña con el mes que se ve en la lista.
- **Período:** Mes, 3, 6 o 12 meses, terminando en el mes elegido en *Hasta*. Queda en la URL (`?months=3&end=2026-10`).
- **Indicadores:** total pagado con la variación respecto al período anterior del mismo largo (sin porcentaje si ese período tiene meses sin montos), promedio mensual y mes de mayor gasto (o el pago más alto si es un solo mes), y pagos realizados ("9 de 13 · 4 sin pagar · 1 sin monto").
- **Gasto por mes:** columnas apiladas Recurrentes / Únicos, con tooltip. En el resumen de un mes se compara con el mes anterior.
- **Gasto por pago:** barras horizontales con el total del período, de mayor a menor. Desde 12 pagos los más chicos se agrupan en "Otros".
- **Detalle:** tabla agrupada por mes (del más reciente al más antiguo) con subtotal por mes y total. Columnas: *Pago; Sitio; Tipo; Vence; Estado; Fecha de pago; Monto; Comprobantes*. Incluye los recurrentes que tocaban ese mes aunque no se hayan pagado.
- Se actualiza sola al cambiar los datos.
- **Exportar:** descarga la tabla de detalle como `Resumen de pagos 2026-08 a 2026-10.xlsx`. Una fila por pago y mes, con la columna *Mes* en lugar de las filas de subtotal y una fila *Total* al final. Los montos se guardan como número con formato `$#,##0` y las fechas como fecha, así que se pueden sumar y filtrar. La cabecera queda fija y con filtros. El archivo lo genera `lib/xlsx.js`, sin librerías externas.

### Fase 17 — Clave de acceso ✅ hecha (v0.12.0)
- **Primer uso:** el panel (y la página de resumen) muestra *Crea una clave* (mínimo 4 caracteres, repetida). Sin clave no se ve nada.
- **Cada vez que se abre el panel:** se pide la clave, aunque haya otro panel desbloqueado en otra ventana. Mientras haya un panel abierto y desbloqueado, el flag `unlocked` en `chrome.storage.session` deja abrir el resumen sin volver a pedirla. El panel mantiene un puerto abierto con el background (`trackPanel`); cuando se cierra el último panel, el background borra el flag y las páginas de resumen abiertas vuelven a la pantalla de bloqueo.
- **Guardado:** PBKDF2-SHA-256 (310 000 iteraciones, sal aleatoria) en `chrome.storage.local.lock`; nunca se guarda la clave.
- **⚙ general → Clave:** cambiarla (pide la actual) y **Bloquear ahora**, que bloquea todas las páginas abiertas.
- **Alcance:** bloquea la interfaz, no cifra los datos. El badge con pendientes y las notificaciones siguen funcionando con la extensión bloqueada. Los comprobantes recibidos por menú, atajo o descarga se mueven al desbloquear.
- **Olvidé mi clave:** en la pantalla de bloqueo. Pide escribir *BORRAR* y elimina pagos, montos, datos, notas, configuración, la clave, la carpeta elegida y los comprobantes que esperaban ser movidos. Devuelve los permisos de los sitios y el de "Capturas desde el panel". Los comprobantes ya guardados en la carpeta no se tocan. Después se pide crear una clave nueva.

---

### Orden recomendado
| Orden | Fase | Por qué en este orden |
|---|---|---|
| 1 | 6 + migración | Cambia el modelo; todo lo demás se apoya en él |
| 2 | 7 | Las frecuencias cambian qué pagos aparecen en cada mes |
| 3 | 8 | Vencimientos: el mayor aporte para "no olvidar pagos" |
| 4 | 9 | Montos |
| 5 | 10 | Notas (rápida) |
| 6 | 11 | Ver comprobantes |
| 7 | 14 | Abrir pendientes (rápida) |
| 8 | 12 | Captura completa |
| 9 | 13 | Detección de pago exitoso (usa la captura completa) |
| 10 | 15 | Respaldo y CSV (al final, cuando el modelo ya no cambie) |

### Permisos nuevos
- `notifications` (fase 8)
- `tabGroups` (fase 14)

### Decisiones (tomadas el 2026-10-30)
| Tema | Decisión |
|---|---|
| Carpeta de recurrentes | `Pagos/Recurrentes/` para todos los pagos recurrentes, sea cual sea su frecuencia. Los archivos antiguos en `Mensuales/` se quedan donde están; el visor de comprobantes (fase 11) busca en las dos carpetas |
| Recordatorios | 3 días antes, a las 9:00 (configurable) |
| Monto | Se pide al marcar como pagado (campo opcional) y también se puede editar en ⚙ |
| Pago exitoso | Captura sola si hay permiso para todos los sitios; si no, aviso dentro de la página |
| Captura por defecto | Parte visible (la completa se elige por sitio o desde el menú) |
| Importar | Fusionar por `id` |
| Moneda | Solo CLP |
