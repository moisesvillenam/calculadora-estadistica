# Clara Cloud

**Explora tus datos. Experimenta con muestras. Comprende la estadística.**

Clara Cloud es un laboratorio estadístico interactivo en español que funciona en el navegador. Calcula estadísticas, visualiza distribuciones y observa cómo cambia una muestra al modificar tus datos. La cuenta Cloud es opcional y permite guardar y recuperar conjuntos de datos mediante Supabase.

Las herramientas locales se pueden usar sin instalación ni cuenta. Los números solo se envían a la base de datos cuando eliges **Guardar datos actuales**.

[Inicio rápido](#inicio-rápido) · [Cloud opcional](#cloud-opcional) · [Pruebas](#pruebas) · [Estructura del proyecto](#estructura-del-proyecto) · [Contribuir](#contribuir)

## Qué puedes hacer

- **Analizar hasta 10 000 valores:** media, mediana, varianza y desviación estándar poblacionales o muestrales, cantidad de datos, mínimo y máximo.
- **Cargar archivos CSV o TXT:** importa números desde la misma sección de ingreso manual, sin cuenta ni envío a Cloud.
- **Generar datos aleatorios:** elige de 1 a 10 000 enteros uniformes entre 0 y 100. El botón reemplaza los datos y actualiza cálculos y gráficos; una cantidad inválida conserva los datos anteriores. La varianza muestral requiere al menos dos elementos.
- **Explorar distribuciones:** histogramas con intervalos ajustables, tabla de frecuencias y una vista de puntos para editar valores y observar su efecto.
- **Aprender con ejemplos:** conjuntos equilibrados, asimétricos y con valores extremos, además de explicaciones y fórmulas junto a los resultados.
- **Experimentar con el muestreo:** extraer una muestra o simular 500 mediante muestreo aleatorio con reemplazo, aleatorio simple sin reemplazo o sistemático. Ajusta el tamaño de 1 a 50; sin reemplazo no puede superar la población. La simulación usa una semilla fija y la extracción individual usa un nuevo sorteo, sin reemplazar los datos de la calculadora.
- **Guardar conjuntos en Cloud:** crear una cuenta, iniciar sesión y guardar, listar, recuperar o eliminar tus datasets. La lista muestra 20 conjuntos por página.

La interfaz incluye diseño adaptable, navegación por teclado, etiquetas de formulario y mensajes de estado accesibles.

## Inicio rápido

Descarga o clona el repositorio y abre `index.html` en un navegador con JavaScript habilitado. No necesitas Node.js ni configurar Supabase para usar la calculadora, los gráficos y el laboratorio.

Para servir la aplicación por HTTP, ejecuta desde la raíz del repositorio, si tienes Python 3 instalado:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Abre <http://localhost:8080>. Usa HTTP para probar la autenticación y las redirecciones de confirmación de correo.

### Tu primer experimento

1. Pulsa **Usar ejemplo** o introduce `8; 12; 15; 10; 20; 15; 18`.
2. Selecciona varianza **Poblacional** o **Muestral** y observa los resultados.
3. Alterna entre **Distribución** y **Puntos** para explorar o editar los datos.
4. En el laboratorio, ajusta el tamaño de muestra y pulsa **Iniciar simulación**.

Separa los números con espacios, punto y coma o saltos de línea. Usa punto decimal (`3.5`), sin comas. La varianza muestral requiere al menos dos valores.

En **Aprender** encontrarás fórmulas de media, mediana, varianza, desviación estándar y muestreo, con notación y ejemplos numéricos. La dispersión teórica usa la desviación poblacional del conjunto: `σ / √n` con reemplazo y `(σ / √n) √((N − n) / (N − 1))` en aleatorio simple sin reemplazo (cero para una población de un elemento). El sistemático conserva el orden de entrada, usa un inicio uniforme en `[0, N/n)` y selecciona las posiciones `⌊r + j·N/n⌋ + 1`, para `j = 0, …, n − 1`. Su dispersión depende del orden y solo se muestra la observada. Cambiar datos, método o tamaño reinicia la simulación y limpia la muestra anterior.

### Cargar datos desde un archivo

En **Introduce tus datos**, usa **Subir archivo de datos** para seleccionar un `.csv` o `.txt` en UTF-8, de hasta **1 MiB** y **10 000 valores**:

- **CSV:** números separados por comas, punto y coma o tabulaciones (un mismo separador en todo el archivo). Admite varias filas y columnas; todas las celdas se incorporan en orden por filas. Se permiten números entre comillas dobles y líneas en blanco. No admite encabezados, celdas vacías ni columnas de texto.
- **TXT:** los mismos separadores del campo manual: espacios, tabulaciones, punto y coma o saltos de línea.
- Usa **punto decimal**, por ejemplo `3.5`, en ambos formatos. En CSV, `3,5` representa dos valores, `3` y `5`.

Por ejemplo, un CSV con `8,12,15` en la primera fila y `10,20,18` en la segunda importa seis números. Para archivos de hoja de cálculo, exporta primero los datos numéricos como CSV sin encabezados.

Una carga válida reemplaza el campo manual y actualiza los resultados y gráficos, conservando el tipo de varianza seleccionado. Puedes seguir editando los números. Si el archivo no es válido o los valores no permiten calcular la varianza seleccionada, se conservan los datos y resultados anteriores. Editar, limpiar o cargar otro conjunto descarta una lectura pendiente.

El archivo se procesa localmente en el navegador. Solo **Guardar datos actuales** envía los valores a Cloud.

### Alcance del modo local

Los cálculos funcionan sin conexión cuando los archivos de la aplicación ya están disponibles. No hay PWA ni caché para abrir por primera vez un sitio remoto sin Internet. Los números de la calculadora no se conservan automáticamente al cerrar la página; tampoco se guarda el progreso de las simulaciones.

## Cloud opcional

Cloud usa **Supabase Auth** para las cuentas y **PostgreSQL** para los datasets. Las herramientas estadísticas siguen disponibles si Cloud no está configurado o falla la conexión.

### 1. Preparar el SDK

Para instalar dependencias y ejecutar la suite completa de pruebas necesitas **Node.js 22 o posterior** y npm. Desde la raíz del repositorio:

```sh
npm ci
```

El script `postinstall` ejecuta `npm run vendor:sdk`. Copia el bundle UMD oficial de `@supabase/supabase-js`, fijado a la versión **2.118.0**, a `vendor/`, junto con su licencia y un manifiesto SHA-256. Puedes repetir la copia con:

```sh
npm run vendor:sdk
```

La aplicación carga el SDK desde `vendor/supabase-js-2.118.0.js`, de forma asíncrona y solo tras validar la configuración. No usa un CDN como alternativa. Distribuye la carpeta `vendor/` junto con la aplicación; el bundle, la licencia y el manifiesto están incluidos en este repositorio.

### 2. Configurar la conexión pública

Completa los campos de [supabase-config.js](supabase-config.js), conservando los valores existentes si ya corresponden a tu proyecto:

| Campo | Valor esperado |
| --- | --- |
| `url` | URL HTTPS del proyecto Supabase, sin rutas ni credenciales |
| `publishableKey` | Clave publicable con prefijo `sb_publishable_` |

**Este archivo es público y visible en el navegador.** No incluyas claves secretas, `service_role`, contraseñas de PostgreSQL ni cadenas de conexión. La aplicación rechaza las claves JWT antiguas, incluidas las `anon`.

Si la configuración no es válida, Clara muestra una explicación, no carga el SDK y no hace peticiones a Supabase. La preparación del SDK no modifica este archivo.

### 3. Preparar autenticación y datos

En tu proyecto Supabase:

- Habilita el proveedor de correo y contraseña.
- Configura la Site URL y las redirecciones permitidas para la dirección donde sirves Clara.
- Prepara `public.datasets` y sus políticas de acceso según el [contrato de datos](#contrato-de-datos).

Clara no crea tablas ni ejecuta migraciones. El registro requiere una contraseña de al menos ocho caracteres; Supabase puede exigir reglas adicionales. Si el registro no devuelve una sesión, la interfaz indica que revises el correo antes de iniciar sesión.

### Cómo se guardan tus datos

Cada guardado crea un dataset nuevo con un nombre, los valores actuales y el tipo de varianza. Se permiten nombres repetidos. No se guardan estadísticas derivadas: se recalculan al recuperar el conjunto.

- Solo **Guardar datos actuales** envía los números a la base. No hay guardado automático ni cola de escrituras sin conexión.
- Recuperar un conjunto pide confirmación antes de reemplazar datos locales y sincroniza resultados, fórmulas y gráficos.
- Eliminar pide confirmación. Los nombres se muestran como texto, sin interpretar HTML.
- Supabase conserva y renueva la sesión en el navegador. Cerrar sesión afecta a este dispositivo y conserva los números de la calculadora.
- Los cambios de cuenta descartan respuestas pendientes de la sesión anterior. Los estados de carga evitan envíos duplicados.

Si se pierde la conexión durante un guardado, el servidor podría haberlo recibido. Actualiza la lista antes de repetirlo para evitar duplicados.

## Contrato de datos

La aplicación espera la tabla `public.datasets` con esta estructura:

| Columna | Tipo | Requisitos |
| --- | --- | --- |
| `id` | `uuid` | Clave primaria; generada en PostgreSQL con `gen_random_uuid()` |
| `user_id` | `uuid` | Obligatoria; referencia a `auth.users(id)` e identifica al propietario |
| `name` | `text` | Obligatoria; de 1 a 100 caracteres tras recortar espacios exteriores |
| `data` | `jsonb` | Objeto con `values` y `variance_type` |
| `created_at` | `timestamptz` | Obligatoria; valor por defecto `now()` |

`values` y `variance_type` son propiedades de `data`, **no columnas independientes**. El contenido se envía como objeto JSON:

```json
{
  "values": [1, 2, 3],
  "variance_type": "sample"
}
```

`values` admite entre 1 y 10 000 números finitos, sin nulos ni cadenas. `variance_type` acepta `population` o `sample`; esta última exige al menos dos valores. El servicio valida el contenido al guardar y recuperar, preservando el orden y las repeticiones.

El cliente obtiene `user_id` de la sesión. PostgreSQL genera `id` y `created_at`. La validación del navegador no sustituye las restricciones de la tabla.

### Acceso por propietario

La API de datos debe exponer el esquema `public`. Habilita **Row Level Security (RLS)** en `public.datasets`, con políticas para el rol `authenticated` que cumplan este contrato:

| Operación | Condición de acceso |
| --- | --- |
| SELECT | `USING ((select auth.uid()) = user_id)` |
| INSERT | `WITH CHECK ((select auth.uid()) = user_id)` |
| DELETE | `USING ((select auth.uid()) = user_id)` |

El rol `authenticated` necesita permisos de SELECT, INSERT y DELETE; `anon` no debe tener acceso a los datasets. No se necesita UPDATE. INSERT y DELETE solicitan filas de retorno, por lo que también requieren SELECT. Un índice sobre `(user_id, created_at DESC, id DESC)` facilita la paginación.

Las consultas del cliente filtran por propietario, pero **RLS garantiza el aislamiento entre cuentas**. Evita políticas adicionales que permitan acceder a datos ajenos. Las pruebas locales usan dobles y transporte simulado: no verifican las políticas de una base de datos desplegada.

<details>
<summary>Detalles del servicio de datasets</summary>

La interfaz usa el contrato plano `{ name, values, variance_type }`:

- `save` lo convierte en `{ user_id, name, data: { values, variance_type } }` y solicita `id` con `single()`.
- `list` consulta `id,name,data,created_at`, extrae el tipo de varianza y pide una fila adicional para detectar si existe una página siguiente.
- `get` consulta `id,name,data` con `maybeSingle()`, valida el contenido y devuelve `{ id, name, values, variance_type }`. Si la fila ya no existe, informa al usuario.
- `remove` filtra por propietario e identificador y comprueba que se haya eliminado una fila.

Actualizar y eliminar conservan la página actual; si queda vacía, la interfaz retrocede hasta encontrar filas o llegar a la primera página. Un error de navegación conserva la lista anterior.

</details>

## Pruebas

Las pruebas usan el ejecutor integrado de Node.js. Tras instalar las dependencias con `npm ci`:

```sh
npm test
```

| Suite | Cobertura principal |
| --- | --- |
| `tests/statistics.test.js` | Cálculos, validación numérica, histogramas y muestreo reproducible |
| `tests/data-import.test.js`, `tests/import-ui.test.js` | Formatos y límites de archivos, errores sin pérdida de datos y lecturas pendientes |
| `tests/cloud.test.js` | Configuración, contrato JSON, filtros por propietario, paginación y errores |
| `tests/cloud-ui.test.js` | Autenticación, eventos de recuperación, doble envío y cambios de cuenta con un DOM simulado |
| `tests/sdk.test.js` | Concordancia de versiones y bytes del SDK, carga concurrente, reintentos y Auth/CRUD con transporte simulado |

Estas suites no necesitan credenciales reales ni contactan Supabase. La suite del SDK requiere tanto la dependencia instalada en `node_modules/` como los archivos de `vendor/`.

### Integración en navegador

Requiere Chromium instalado y un entorno que permita ejecutarlo:

```sh
CHROMIUM_PROFILE_DIR="$PWD/.browser-test-profile" npm run test:browser
```

Si el ejecutable tiene otra ubicación, indica también `CHROMIUM_BIN=/ruta/a/chromium`. El comando anterior mantiene el perfil dentro del repositorio; sin `CHROMIUM_PROFILE_DIR`, el ejecutor crea un perfil en el directorio temporal del sistema. Los perfiles se conservan después de la ejecución.

La integración comprueba herramientas locales, carga del SDK real, flujos de cuenta y datasets, paginación, errores y anchura móvil. Sustituye la configuración por datos ficticios antes de cargar la aplicación, bloquea las conexiones de los frames y mantiene las sesiones de prueba en memoria. No requiere servidor ni acceso remoto. Genera una página en `test-results/`; tanto esa carpeta como `.browser-test-profile/` están ignoradas por Git.

Para revisar dependencias puedes ejecutar `npm audit` por separado; necesita acceso al registro de npm. Ninguna de estas comprobaciones sustituye una prueba de aislamiento RLS con dos cuentas en un entorno remoto preparado para ello.

## Estructura del proyecto

Clara está construida con HTML, CSS y JavaScript, sin framework de interfaz ni paso de compilación para las herramientas locales.

| Archivo o carpeta | Responsabilidad |
| --- | --- |
| [index.html](index.html), [styles.css](styles.css) | Estructura, contenido y diseño de la interfaz |
| [statistics.js](statistics.js), [app.js](app.js) | Validación, cálculos e interfaz de la calculadora |
| [data-import.js](data-import.js), [import-ui.js](import-ui.js) | Lectura y validación local de archivos CSV/TXT e integración con el campo manual |
| [laboratory.js](laboratory.js), [lab-ui.js](lab-ui.js) | Histogramas, muestreo e interacción con el laboratorio |
| [cloud-service.js](cloud-service.js) | Carga del SDK, validación y consultas a `public.datasets` |
| [cloud-ui.js](cloud-ui.js) | Formularios de cuenta, sesión y gestión de datasets |
| [supabase-config.js](supabase-config.js) | Configuración pública de la conexión opcional |
| [scripts/vendor-sdk.js](scripts/vendor-sdk.js), [vendor/](vendor/) | Preparación y distribución local del SDK |
| [tests/](tests/) | Pruebas unitarias e integración en navegador |

## Contribuir

Para proponer una mejora o informar de un error, describe el comportamiento esperado, los pasos para reproducirlo y el navegador utilizado. Usa datos ficticios en los ejemplos.

Antes de enviar una propuesta de cambios, ejecuta las pruebas pertinentes y comprueba que las herramientas locales siguen funcionando sin Cloud. Si cambias el formato de los datasets o los requisitos de configuración, actualiza también esta documentación.

Para actualizar el SDK, cambia la versión exacta en `package.json` y el lockfile, ejecuta `npm run vendor:sdk` y ajusta la ruta en `cloud-service.js`. `npm test` verifica la correspondencia entre versión, manifiesto, bundle y cargador. El SHA-256 del manifiesto permite comprobar los bytes copiados; no es una verificación independiente del origen del paquete. Retira bundles anteriores solo cuando ya no tengan consumidores.

## Licencia

Este repositorio no incluye una licencia para el código de Clara. La licencia del SDK de Supabase se distribuye por separado en [vendor/SUPABASE-LICENSE](vendor/SUPABASE-LICENSE).
