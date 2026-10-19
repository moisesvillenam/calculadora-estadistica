# Clara Cloud

Clara conserva su calculadora, estadísticas poblacionales y muestrales, histogramas, edición de puntos, ejemplos y laboratorio de muestreo. La cuenta Cloud es opcional: permite registro con correo y contraseña, inicio y cierre de sesión y guardar, listar, recuperar y eliminar datasets propios mediante Supabase Auth y PostgreSQL (`public.datasets`).

## Uso local

Abre `index.html` en un navegador para utilizar las herramientas locales. No requieren instalación, cuenta ni conexión a Supabase. Para probar Auth y las redirecciones de confirmación de correo, sirve esta carpeta mediante HTTP, por ejemplo con `python3 -m http.server 8080`, y abre `http://localhost:8080`.

El modo local significa que los cálculos funcionan con los archivos de la aplicación disponibles, incluso si falla Internet o Supabase. No se implementa una PWA ni una caché para abrir un sitio remoto por primera vez sin Internet. La calculadora no persiste automáticamente los números al cerrar la página.

## Configuración de Cloud

Edita únicamente los dos marcadores de [supabase-config.js](supabase-config.js):

| Campo | Valor necesario |
| --- | --- |
| `url` | URL HTTPS del proyecto Supabase, sin rutas ni credenciales |
| `publishableKey` | Clave **publicable**, con prefijo `sb_publishable_` |

No se incluyen credenciales reales. La configuración es pública y visible en el navegador. Nunca introduzcas claves secretas, `service_role`, contraseñas de PostgreSQL ni una cadena de conexión. Esta versión rechaza las claves JWT antiguas, incluidas las `anon`: utiliza una clave publicable.

Sin valores válidos se muestra una explicación y no se carga el SDK ni se hacen peticiones a Supabase. Las funciones locales siguen disponibles. Para habilitar Cloud, prepara el SDK **local y versionado**:

```sh
npm install
# postinstall ejecuta vendor:sdk. Para repetir la copia:
npm run vendor:sdk
```

`package.json` fija `@supabase/supabase-js` exactamente a **2.49.10**. [scripts/vendor-sdk.js](scripts/vendor-sdk.js) comprueba la versión instalada y copia el bundle UMD oficial sin transformaciones a `vendor/supabase-js-2.49.10.js`, junto con su licencia. Genera `vendor/supabase-sdk.json` con el SHA-256 calculado sobre los bytes copiados para facilitar su revisión. Este resumen local no es un SRI remoto ni una verificación independiente del origen. Conserva los archivos generados y el `package-lock.json` que genere una instalación correcta; sirve el bundle junto con la aplicación.

La aplicación carga ese archivo local de forma asíncrona solo tras validar la configuración, sin fallback a CDN. Esta es la alternativa local a ejecutar código remoto con SRI: no se incluye ningún hash inventado. Las llamadas concurrentes comparten una sola descarga, y los fallos limpian el estado para reintentar. La carga tiene un límite de 10 segundos; las peticiones usan cancelación a los 15 segundos. Si falta el archivo local, Cloud informa del problema y las herramientas estadísticas siguen disponibles.

**Pendiente en este entorno:** no se pudo descargar la dependencia por `ENOTFOUND registry.npmjs.org`. El bundle oficial, su licencia, su resumen y el lockfile aún no están generados; hace falta completar `npm install` con acceso al registro antes de usar Cloud. No se afirma haber verificado los bytes de un SDK que no se pudo obtener.

El proyecto remoto debe tener habilitado el proveedor de correo y contraseña. Su Site URL y sus redirecciones permitidas deben corresponder al origen donde sirves Clara. El registro no fuerza la confirmación ni la deshabilita: si Supabase no devuelve sesión, Clara informa que se revise el correo y luego se inicie sesión. El requisito local para crear una cuenta es de 8 caracteres; Supabase puede exigir reglas adicionales.

Consulta las referencias oficiales de [instalación del SDK](https://supabase.com/docs/reference/javascript/installing), [claves publicables](https://supabase.com/docs/guides/getting-started/api-keys) y [registro y confirmación de correo](https://supabase.com/docs/reference/javascript/auth-signup).

## Contrato de PostgreSQL pendiente de provisión

**Esta implementación no crea ni modifica tablas, políticas o configuración remota, no contiene un ejecutor de migraciones y no ejecutó SQL.** Antes de usar Cloud, una persona con permisos debe comprobar que el proyecto dispone del siguiente contrato. No se ha supuesto que la tabla exista ni se ha contactado una base de datos real.

Tabla: `public.datasets`.

| Columna | Tipo esperado | Requisitos |
| --- | --- | --- |
| `id` | `uuid` | Clave primaria; generación en PostgreSQL con `gen_random_uuid()` |
| `user_id` | `uuid` | Obligatorio, referencia a `auth.users(id)`; propietario |
| `name` | `text` | Obligatorio, tras quitar espacios entre 1 y 100 caracteres |
| `values` | `double precision[]` | Obligatorio, arreglo unidimensional de 1 a 10 000 números finitos, sin nulos |
| `variance_type` | `text` | Obligatorio, solo `population` o `sample`; `sample` requiere al menos 2 números |
| `created_at` | `timestamptz` | Obligatorio, valor por defecto `now()` |

Estas restricciones deben existir también en PostgreSQL: la validación del navegador no sustituye las restricciones de la tabla. El API debe aceptar y devolver `values` como arreglo JSON de números. La aplicación conserva orden, repeticiones y tipo de varianza; calcula de nuevo las estadísticas al recuperar. No almacena resultados derivados ni el progreso de las simulaciones. `id` y `created_at` se generan en el servidor; `user_id` se toma de la sesión y RLS debe comprobarlo. Los nombres duplicados están permitidos; cada guardado crea una fila.

La API de datos debe exponer `public`. RLS debe estar **habilitado** en `public.datasets`, sin políticas amplias que permitan acceso a otros propietarios. Contrato de las políticas para el rol `authenticated`:

| Operación | Expresión de acceso |
| --- | --- |
| SELECT | `USING ((select auth.uid()) = user_id)` |
| INSERT | `WITH CHECK ((select auth.uid()) = user_id)` |
| DELETE | `USING ((select auth.uid()) = user_id)` |

El rol `authenticated` necesita permiso de SELECT, INSERT y DELETE; `anon` no debe tener acceso a datasets. Esta versión no necesita UPDATE. INSERT y DELETE solicitan filas de retorno, por lo que SELECT también debe estar permitido. Un índice de `user_id, created_at DESC, id DESC` facilita la paginación. Revisa [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) antes de habilitar datos reales.

Los filtros por `user_id` del cliente facilitan consultas correctas, pero **RLS es quien garantiza el aislamiento entre cuentas**. Las pruebas con dobles no verifican políticas de una base de datos. Cuando se autorice la provisión por separado, debe comprobarse con dos cuentas que ninguna pueda consultar o eliminar las filas de la otra, ni insertar una fila con otro propietario; sin sesión no debe haber acceso.

## Comportamiento de la interfaz

- Supabase conserva y renueva la sesión en el navegador. Los cambios de sesión actualizan la interfaz y descartan respuestas pendientes de otra cuenta. El cierre usa `scope: 'local'` para este dispositivo; no borra los números de la calculadora. Si falla, se informa y permite reintentar. Véase [cierre de sesión](https://supabase.com/docs/reference/javascript/auth-signout).
- Solo **Guardar datos actuales** envía los números a la base. Se validan usando las mismas reglas de la calculadora. No hay guardado automático ni cola de escrituras sin conexión.
- Registro e inicio de sesión se eligen antes de escribir la contraseña: `autocomplete` usa `new-password` o `current-password`, respectivamente; Enter respeta el modo elegido.
- La lista muestra páginas de 20 filas y consulta una fila adicional para habilitar Siguiente solo si hay más datos. Actualizar y eliminar conservan la página actual; si queda vacía, retroceden hasta una página con filas o la primera. Un error de navegación conserva la página y las filas anteriores.
- Recuperar usa [`maybeSingle()`](https://supabase.com/docs/reference/javascript/maybesingle) y comunica que el dataset ya no está disponible si no existe. Valida `variance_type` antes del cálculo y emite `change` del radio seleccionado e `input` de los números, sincronizando resultados, fórmulas y gráficos. Confirma antes de reemplazar un conjunto local. Guardar conserva `single()` porque requiere una fila de retorno. Eliminar pide confirmación y comprueba que se haya eliminado una fila.
- Los estados de carga bloquean envíos duplicados. Hay mensajes accesibles de error, sesión, listas vacías y desconexión. Los nombres se renderizan como texto, sin interpretar HTML.
- Si una escritura termina pero no se puede actualizar la lista, se informa por separado. Si se pierde la conexión durante una escritura, puede que el servidor la haya recibido: actualiza la lista antes de volver a guardar para evitar duplicados.

## Pruebas

Requieren Node.js 18 o posterior y ninguna dependencia npm:

```sh
npm test
```

Cubren validación de configuración y datasets, rechazo de secretos y JWT, `maybeSingle()` sin filas, consultas limitadas al propietario, paginación con finales exactos, conservación y retroceso de página al borrar, errores, cancelación y regresiones de estadísticas, histogramas y muestreo reproducible. También ejecutan `cloud-ui.js` con un DOM mínimo y dobles para probar autenticación, autocomplete, eventos de recuperación, doble envío y respuestas tardías tras cambiar de cuenta. El cargador del SDK se prueba con carga concurrente, URL local versionada, error, timeout, exportación inválida y reintento. Estos dobles no validan el diseño visual ni los bytes del SDK oficial.

La prueba de integración usa Chromium y dobles de Supabase, sin servidor ni acceso remoto:

```sh
npm run test:browser
# Si Chromium está en otra ubicación:
CHROMIUM_BIN=/ruta/a/chromium npm run test:browser
```

Comprueba modo local, gráficos, simulación, registro, confirmación pendiente, login, CRUD, cancelación de borrado, doble envío, nombres con HTML, paginación, errores, cambio de cuenta, respuestas tardías y anchura móvil. Genera exclusivamente archivos ignorados en `test-results/` y `.browser-test-profile/`, dentro del proyecto. Los valores de las fixtures son ficticios y solo se pasan a dobles; nunca a un servidor.

Validación en el entorno de implementación: `npm test` y `git diff --check` pasan. La ejecución de Chromium está bloqueada por la restricción de sockets del entorno (`setsockopt: Operation not permitted`), por lo que no se afirma que las pruebas de navegador hayan pasado. La descarga desde npm tampoco estaba disponible. No se probó Auth ni PostgreSQL reales porque no se proporcionaron valores de configuración y no se autorizó modificar la base.

## Archivos

- `statistics.js`, `laboratory.js`, `lab-ui.js`, `app.js`: herramientas locales originales, conservadas sin cambios.
- `supabase-config.js`: URL y clave publicable con marcadores explícitos.
- `cloud-service.js`: carga de supabase-js, validación y consultas a `public.datasets`.
- `cloud-ui.js`: autenticación, estado de sesión e interfaz de datasets.
- `tests/`: pruebas automatizadas sin credenciales reales.

No se publicaron cambios ni se ejecutaron migraciones.
