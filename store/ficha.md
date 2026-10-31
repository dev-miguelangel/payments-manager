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

¿Pagaste la luz este mes? ¿Dónde quedó el comprobante del crédito? Pagos reúne tus cuentas en un panel lateral de Chrome y ordena los comprobantes por ti.

MIENTRAS PAGAS
• Guarda el sitio de cada cuenta (luz, agua, arriendo, créditos, colegios…) como pago recurrente o único, con un alias.
• Los sitios guardados se marcan con un borde blanco para que sepas que estás en el lugar correcto.
• Copia con un clic tus datos de pago: número de cliente, RUT, número de cuenta.
• Guarda una captura del comprobante con el botón 📸, el clic derecho o Alt+Shift+P.
• Los PDF que descargas desde un sitio guardado se mueven solos a su carpeta.

TODO ORDENADO
• Los comprobantes quedan en la carpeta que elijas: Pagos/Recurrentes/2026-10 Octubre/Luz/…
• La lista del mes muestra qué está pagado, qué está pendiente y qué vence pronto.
• Pagos mensuales, bimestrales, trimestrales, semestrales o anuales. Se pueden pausar o archivar.
• Recordatorios antes del vencimiento.

MONTOS Y RESÚMENES
• Registra lo que pagaste cada mes o define un monto fijo, como la cuota de un crédito.
• Historial de 12 meses por cuenta, con la variación respecto al mes anterior.
• Resumen del mes, 3, 6 o 12 meses con gráficos y tabla de detalle, exportable a Excel (.xlsx).

PRIVADO Y SEGURO
• Clave de acceso: el panel se abre bloqueado.
• Respaldo y restauración en tu propia carpeta.
• Tus datos no salen de tu computador: no hay cuentas, servidores ni publicidad.

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
