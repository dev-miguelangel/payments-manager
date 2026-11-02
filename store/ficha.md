# Ficha para la Chrome Web Store

Textos listos para copiar en el Developer Dashboard. Este archivo no va en el zip.

## Nombre
Mis Pagos al Día

> El nombre visible lo toma de `manifest.json` (`"name"`). Si lo cambias aquí, cámbialo también allá.

## Resumen (máx. 132 caracteres; viene de `"description"` en el manifest)
Controla qué cuentas pagaste cada mes, recibe avisos antes del vencimiento y guarda tus comprobantes ordenados.

## Categoría
Productividad (Herramientas)

## Idioma
Español

## Descripción

Mis Pagos al Día es un panel lateral de Chrome para llevar el control de las cuentas que pagas en línea: luz, agua, internet, arriendo, créditos, colegio y otras. Muestra qué pagaste y qué falta este mes, avisa antes de cada vencimiento y guarda los comprobantes en una carpeta de tu computador, ordenados por mes y por cuenta.

Cómo se usa
1. Abre el sitio donde pagas una cuenta y guárdalo desde el panel con un nombre, por ejemplo "Luz".
2. Después de pagar, pulsa "Guardar comprobante". La captura se guarda en Pagos/Recurrentes/<mes>/Luz/ y el mes queda marcado como pagado.
3. Revisa en el panel qué cuentas están pagadas, pendientes o por vencer.

Funciones
• Lista mensual con el estado de cada cuenta y una barra de progreso.
• Pagos mensuales, bimestrales, trimestrales, semestrales, anuales o únicos; se pueden pausar o archivar.
• Recordatorios antes del vencimiento, con días y hora configurables.
• Comprobantes con el botón del panel, el menú del clic derecho o el atajo Alt+Shift+P. Los PDF descargados desde un sitio guardado se mueven a su carpeta.
• Datos de cada cuenta (número de cliente, RUT, número de cuenta) con un botón para copiarlos mientras pagas.
• Montos pagados por mes y monto fijo opcional, por ejemplo la cuota de un crédito.
• Historial de 12 meses por cuenta y resumen de 1, 3, 6 o 12 meses con gráficos y tabla, exportable a .xlsx.
• Los sitios guardados se marcan con un borde para reconocerlos.

Privacidad
• Los datos se guardan solo en tu navegador y en la carpeta que eliges. No hay cuentas, servidores, publicidad ni analítica.
• Clave de acceso: el panel se abre bloqueado.
• Respaldo y restauración en tu propia carpeta.

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
