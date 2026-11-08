# Pekeron App — notas para trabajar en este repo

- **Por ahora (pedido de Esteban, nov 2026): los cambios van directo a `main`.** La versión de prueba todavía no está conectada
  en Cloudflare; cuando Esteban la conecte y lo pida, se vuelve a la regla de abajo. Mantener `pruebas` igual a `main`.
- **Primero a prueba (cuando esté conectada):** todo cambio nuevo va a la rama `pruebas` (se publica en https://pekeron-pruebas.pages.dev).
  A `main` (pekeronapp.com, los clientes) solo se pasa cuando Esteban lo aprueba. Ver PRUEBAS.md.
- Al publicar algo que cambia archivos de la app, subir la versión de caché en `sw.js` (`ventas-vNNN`).
- La base de datos (Firebase) es la misma en prueba y producción.
