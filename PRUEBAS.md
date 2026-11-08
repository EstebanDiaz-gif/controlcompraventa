# Versión de prueba (staging)

Para que Esteban vea y pruebe los cambios **antes** de que lleguen a los clientes.

| | Dirección | Rama de GitHub | Quién la usa |
|---|---|---|---|
| **Producción** | https://pekeronapp.com | `main` (GitHub Pages) | Los clientes |
| **Prueba** | https://pekeron-pruebas.pages.dev | `pruebas` (Cloudflare Pages) | Esteban |

En la versión de prueba se ve un cartel amarillo arriba: **🧪 VERSIÓN DE PRUEBA**.

## Cómo se trabaja

1. Los cambios nuevos se suben **solo a la rama `pruebas`**. Cloudflare la publica sola en 1–2 minutos.
2. Esteban prueba en el celu y en la compu, **en su negocio de prueba**.
3. Cuando Esteban dice **"aprobado"**, se pasa `pruebas` a `main` (merge) y GitHub Pages publica en pekeronapp.com.
4. Si algo sale mal en producción: `git revert` del último cambio y se publica en 1–2 minutos.

## Cuidados

- **La base de datos (Firebase) es la misma.** Lo que se vende, borra o carga en la versión de prueba pasa de verdad.
  Probar siempre en un negocio de prueba, no en los de los clientes.
- **Las reglas de Firebase no tienen versión de prueba:** al publicarlas valen para todos. Antes de usar una función que
  necesita reglas nuevas, se publican las reglas y se prueban con el negocio de prueba; recién después se pasa la función a `main`.
- **El servidor de pagos/fotos/avisos (worker)** es el mismo para las dos: acepta pedidos de las dos direcciones (ORIGINS en `worker/wrangler.toml.tpl`).
- Cada dirección tiene su propia copia guardada en el celu (service worker): la de prueba no afecta a la app instalada de pekeronapp.com.

## Conexión con Cloudflare Pages (se hace una vez)

Workers & Pages → Crear → Pages → Importar un repositorio de Git → `EstebanDiaz-gif/controlcompraventa`.
- Nombre del proyecto: `pekeron-pruebas` (así queda pekeron-pruebas.pages.dev; si cambia, actualizar ORIGINS del worker).
- Rama de producción: **`pruebas`**.
- Framework: ninguno. Comando de compilación: vacío. Directorio de salida: vacío (la raíz).
