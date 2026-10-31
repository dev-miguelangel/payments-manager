# Ficha para la Chrome Web Store

Textos listos para copiar en el Developer Dashboard. Este archivo no va en el zip.

## Nombre
Pagos – Control de pagos mensuales

> El nombre visible lo toma de `manifest.json` (`"name"`). Si lo cambias aquí, cámbialo también allá.

## Resumen (máx. 132 caracteres; viene de `"description"` en el manifest)
Organiza tus pagos mensuales y únicos, y guarda sus comprobantes.

## Categoría
Productividad (Herramientas)

## Idioma
Español

## Descripción

Pagos es tu checklist de cuentas del mes dentro de Chrome. Te muestra qué ya pagaste y qué falta, te avisa antes de cada vencimiento y guarda cada comprobante ordenado en una carpeta de tu computador, sin que tengas que renombrar ni mover archivos.

¿POR QUÉ INSTALARLA?
Si pagas tus cuentas por internet, seguro te ha pasado: no recuerdas si ya pagaste la luz, el comprobante quedó perdido entre las descargas o no sabes cuánto gastaste en servicios este año. Pagos resuelve eso en el mismo lugar donde ya pagas: el navegador.

CÓMO FUNCIONA
1. Entra al sitio donde pagas una cuenta (banco, empresa de luz, agua, internet, colegio…) y guárdalo con un nombre, por ejemplo "Luz" o "Crédito auto".
2. Cuando pagues, guarda el comprobante con un clic. Pagos lo deja en Pagos/Recurrentes/2026-10 Octubre/Luz/ y marca el mes como pagado.
3. Abre el panel lateral cuando quieras para ver qué está pagado, qué está pendiente y qué vence pronto.

LO QUE OBTIENES
• Nunca más un pago olvidado: lista del mes con su estado y recordatorios antes del vencimiento.
• Comprobantes ordenados solos: capturas con un clic, con el clic derecho o con Alt+Shift+P. Los PDF que descargas desde un sitio guardado se mueven a su carpeta automáticamente.
• Pagas sin buscar datos: tu número de cliente, RUT o número de cuenta quedan a mano con un botón para copiarlos.
• Sabes dónde estás: los sitios de pago guardados se marcan con un borde para que confirmes que es el sitio correcto.
• Control de tus gastos: anota cuánto pagaste cada mes o define un monto fijo, como la cuota de un crédito. Mira el historial de cada cuenta y un resumen de 1, 3, 6 o 12 meses con gráficos, exportable a Excel.
• Se adapta a tus cuentas: pagos mensuales, bimestrales, trimestrales, semestrales, anuales o únicos. Varios pagos en un mismo sitio, pausar y archivar.

PRIVADA POR DISEÑO
• Tus datos no salen de tu computador: sin cuentas, sin servidores, sin publicidad.
• Clave de acceso: el panel se abre siempre bloqueado.
• Respalda y restaura tu información en tu propia carpeta.

Hecha para quienes pagan sus cuentas en línea y quieren tenerlas al día y en orden, sin planillas ni carpetas desordenadas.

## Capturas sugeridas (1280×800 o 640×400, de 1 a 5)
1. Panel con la lista del mes (pagados, pendientes, por vencer) junto a un sitio de pago con el borde blanco.
2. Guardar un comprobante: botón 📸 y mensaje "guardado en Pagos/…".
3. Resumen de 6 o 12 meses con gráficos.
4. Configuración de un pago: datos, monto fijo e historial.
5. Pantalla de clave de acceso.

## Imagen promocional pequeña (440×280)
Icono de la extensión sobre fondo azul con el texto "Pagos – tus cuentas en orden".

---

# Pestaña "Prácticas de privacidad"

## Propósito único
Organizar los pagos mensuales y únicos del usuario y guardar sus comprobantes en una carpeta local.

## Justificación de permisos
- **sidePanel:** la interfaz de la extensión es un panel lateral.
- **storage:** guardar en el equipo la lista de pagos, montos, configuración y la huella de la clave.
- **tabs:** saber si la pestaña activa es un sitio de pago guardado, para resaltarlo y ofrecer guardar el comprobante, y para abrir o cambiar a la pestaña de un pago.
- **activeTab:** capturar la parte visible de la página como comprobante cuando el usuario usa el menú contextual o el atajo de teclado.
- **scripting:** mostrar un borde en los sitios de pago guardados y ocultarlo durante la captura.
- **alarms:** recalcular los pagos pendientes al cambiar de mes y programar los recordatorios.
- **notifications:** avisar al usuario antes de que venza un pago.
- **downloads:** detectar los PDF de comprobantes descargados desde un sitio guardado y moverlos a su carpeta.
- **contextMenus:** agregar "Guardar comprobante" al menú del clic derecho en los sitios guardados.
- **Permisos de host (opcionales):** se piden solo para el sitio que el usuario guarda, para mostrar el borde. El acceso a todos los sitios se pide solo si el usuario activa "Capturas desde el panel", porque Chrome lo exige para capturar la pestaña desde el panel lateral.

## Código remoto
No. Todo el código va dentro del paquete.

## Uso de datos
Marcar: **Información financiera y de pagos** (montos y fechas de pago que el usuario ingresa).

Certificar:
- No vendo ni transfiero datos de usuarios a terceros, salvo en los casos de uso aprobados.
- No uso ni transfiero datos de usuarios para fines no relacionados con el propósito único del elemento.
- No uso ni transfiero datos de usuarios para determinar la solvencia crediticia ni para otorgar préstamos.

Explicación: los datos se guardan solo en el almacenamiento local del navegador y en la carpeta que elige el usuario. La extensión no envía datos a ningún servidor.

## Política de privacidad
https://dev-miguelangel.github.io/payments-manager/privacidad.html

(GitHub Pages: *Settings → Pages → Deploy from a branch → `main` / `/docs`*.)
