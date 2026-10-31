# Pagos

Extensión de Chrome para organizar tus pagos mensuales y únicos y guardar sus comprobantes ordenados en una carpeta de tu computador.

Funciona desde un panel lateral: guardas el sitio de cada cuenta (luz, agua, arriendo, créditos…), marcas lo que ya pagaste y guardas la captura o el PDF del comprobante con un clic. Tus datos no salen de tu computador.

## Funciones

**Mientras pagas**
- Guarda el sitio de cada pago como **recurrente** (mensual, bimestral, trimestral, semestral o anual) o **único**, con un alias. Un mismo sitio puede tener varios pagos.
- Los sitios guardados se marcan con un **borde blanco**.
- **Datos del pago** (Nº cliente, RUT, cuenta…) con botón para copiarlos, y una nota libre.
- **Guardar comprobante:** botón 📸 en el panel, clic derecho → *Guardar comprobante (Pagos)* o <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>.
- Los **PDF descargados** desde un sitio guardado se mueven solos a su carpeta.

**Control del mes**
- Lista del mes con estado (pagado, pendiente, vence pronto, vencido), barra de progreso y total pagado.
- **Vencimientos y recordatorios** con notificación, configurables (días antes y hora).
- **Montos** por mes, con **monto fijo** opcional (por ejemplo, la cuota de un crédito) que se completa solo al marcar el pago.
- **Historial** de 12 meses por pago, con gráfico y variación respecto al mes anterior.
- Pausar o archivar pagos; el icono muestra cuántos pagos quedan pendientes.

**Resumen de pagos**
- Resumen del mes, 3, 6 o 12 meses: indicadores, gasto por mes (recurrentes y únicos), gasto por pago y tabla de detalle.
- **Exportar** la tabla a Excel (`.xlsx`).

**Seguridad y respaldo**
- **Clave de acceso:** se crea en el primer uso y el panel se abre siempre bloqueado. Se puede cambiar en ⚙ y existe *Olvidé mi clave* (borra los datos y permite empezar de nuevo).
- **Respaldar** y **restaurar** los datos en la carpeta de comprobantes. La restauración fusiona sin borrar nada y guarda antes un respaldo del estado actual.

## Estructura de carpetas

Al elegir una carpeta en ⚙ → *Carpeta de comprobantes*, la extensión crea:

```
Pagos/
├── Recurrentes/
│   └── 2026-10 Octubre/
│       └── Luz/
│           └── 2026-10-30_14-35-02.png
├── Únicos/
│   └── 2026-10 Octubre/
│       └── Permiso de circulación/
│           └── boleta.pdf
└── Respaldos/
    └── pagos-2026-10-30_14-35-02.json
```

Cada pago usa su alias como nombre de carpeta (o el dominio si no tiene alias).

## Instalación

**Desde la Chrome Web Store:** _(pendiente de publicación)_

**Desde el código (modo desarrollador):**
1. Clona el repositorio (`git clone https://github.com/dev-miguelangel/payments-manager.git`) o descarga el zip desde GitHub y descomprímelo.
2. Abre `chrome://extensions` y activa el **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige la carpeta del proyecto.
4. Pulsa el icono de Pagos para abrir el panel y crea tu clave.

Para usarla en ventanas de incógnito, activa *Permitir en modo incógnito* en los detalles de la extensión. El resumen de pagos se abre en una ventana normal, porque Chrome no permite páginas de extensiones en incógnito.

## Privacidad

- Los pagos, montos y la configuración se guardan en el almacenamiento local del navegador (`chrome.storage.local`).
- Los comprobantes, respaldos y exportaciones se guardan en la carpeta que eliges.
- No hay servidores, cuentas, analítica ni publicidad. La clave se guarda como huella PBKDF2, nunca en texto plano.
- La clave bloquea la interfaz; no cifra los datos guardados.

Política completa: [dev-miguelangel.github.io/payments-manager/privacidad.html](https://dev-miguelangel.github.io/payments-manager/privacidad.html) (fuente en [`docs/privacidad.html`](docs/privacidad.html)).

## Permisos

| Permiso | Para qué |
|---|---|
| `sidePanel` | La interfaz es un panel lateral |
| `storage` | Guardar pagos y configuración en el equipo |
| `tabs` | Saber si la pestaña actual es un sitio guardado y abrir los sitios de pago |
| `activeTab` | Capturar la página desde el menú contextual o el atajo |
| `scripting` | Mostrar el borde en los sitios guardados |
| `alarms` | Recalcular pendientes y programar recordatorios |
| `notifications` | Avisos de vencimiento |
| `downloads` | Mover a su carpeta los PDF descargados desde un sitio guardado |
| `contextMenus` | *Guardar comprobante* en el clic derecho |
| Hosts (opcionales) | Se piden por sitio al guardarlo; el acceso a todos los sitios solo si activas *Capturas desde el panel* |

## Desarrollo

No usa dependencias ni paso de compilación: es JavaScript en módulos ES, cargado tal cual por Chrome (Manifest V3).

```
manifest.json
background.js       Service worker: menú contextual, atajo, descargas, recordatorios, badge, borde
border.js           Borde blanco inyectado en los sitios guardados
sidepanel.*         Panel lateral (vista principal, ⚙ de cada pago, ⚙ general)
summary.*           Página de resumen de pagos
lock.css            Pantalla de clave (panel y resumen)
lib/storage.js      Modelo de datos, estados, montos, respaldo y restauración
lib/files.js        Carpeta de comprobantes (File System Access API) e IndexedDB
lib/capture.js      Captura de pantalla
lib/lock.js         Clave de acceso
lib/xlsx.js         Generador de .xlsx sin librerías
scripts/package.sh  Genera el zip para la Chrome Web Store
store/ficha.md      Textos de la ficha de la tienda
docs/               Política de privacidad (GitHub Pages)
```

Después de cambiar el código, recarga la extensión en `chrome://extensions`.

### Publicar una versión

1. Sube `"version"` en `manifest.json`.
2. Genera el paquete:
   ```bash
   ./scripts/package.sh   # crea dist/pagos-<versión>.zip
   ```
3. Súbelo en el [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

Si agregas un archivo que la extensión carga, inclúyelo en la lista de `scripts/package.sh`.
