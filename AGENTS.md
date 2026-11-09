# AGENTS.md

Guía para agentes de código que trabajen en este repositorio.

## Qué es
**Armador de calificaciones**: app web 100 % cliente (sin backend, sin base de datos) que
1. lee la exportación de calificaciones de Moodle (`.ods` / `.xlsx` / `.csv`),
2. estandariza las columnas a escala 0-100 y las agrupa en **Actividades**, **Participación** y **Evaluación/Prueba final**,
3. completa la planilla del calificador (`IAA_DZ_2026.xlsx` u otra con la misma estructura),
4. genera los 3 scripts de consola que cargan las notas manualmente en Moodle.

Idioma de la UI, textos y comentarios: **español rioplatense**. Mantenerlo.

## Estructura
```
src/core.js     Lógica pura (sin DOM). Funciona en navegador (global `Core`) y en Node (module.exports).
src/ui.js       Interfaz (DOM). Usa `Core`, `XLSX` (SheetJS) y `JSZip`.
src/app.html    Plantilla HTML + CSS con marcadores /*JSZIP*/ /*XLSX*/ /*CORE*/ /*UI*/.
build.js        Inlinea todo en dist/index.html (un único archivo autocontenido).
serve.js        Servidor estático mínimo (alternativa a Docker).
Dockerfile, docker-compose.yml   Build multi-etapa (node → nginx).
test/           core.test.js (unitarias, sin datos reales) y e2e.js (Playwright, con archivos reales opcionales).
```
`dist/` es artefacto generado: no se edita ni se versiona.

## Comandos
```bash
npm install          # dependencias (jszip, xlsx; playwright solo para e2e)
npm run build        # genera dist/index.html
npm start            # build + servidor en http://localhost:8081
npm test             # pruebas unitarias de core.js
docker compose up --build   # http://localhost:8081
```
Tras cambiar `src/`, siempre `npm run build` antes de probar en el navegador.

## Reglas de negocio (no cambiar sin confirmación explícita del usuario)
- Todo puntaje se normaliza a **0-100**. Cada columna tiene un máximo «Sobre»; si el máximo observado es menor (p. ej. 40 o 20), **ese máximo equivale al 100 %** (columna mal configurada en Moodle). Heurística `suggestMax`: máximo observado entre 80 y 100 → se toma 100 (nota real sobre 100); menor a 80 → el máximo observado es el 100 %. Siempre editable por columna.
- Cada grupo = **suma de columnas normalizadas ÷ cantidad de columnas**. Los «-» de Moodle cuentan como 0 (opción desactivable).
- **Lo que importa del calificador es su estructura y sus fórmulas**, no el nombre del archivo. La planilla se localiza por los encabezados «Actividades ENTREGADAS», «Participación en Plataforma» y «Evaluación / Prueba Final»; cada *Porcentaje* es la columna del encabezado y la *Escala UTEC* es la siguiente.
- **Nunca modificar las fórmulas** de la planilla. Solo se escriben los valores de las columnas Porcentaje. Única excepción documentada: la *Escala UTEC* de participación (col. G) venía como valor fijo; se convierte en la misma fórmula de escala que las otras dos.
- `Core.scale` y `Core.calc` replican las fórmulas de las columnas E, G, H, I y M de la planilla (escala UTEC). Si la planilla cambia, actualizarlas **y** `Core.scaleFormula`, y revalidar contra un recálculo real (LibreOffice: `soffice --headless --convert-to csv`).
- Escritura del `.xlsx`: se **parchea el XML** con JSZip (`patchXlsx`) en vez de reescribir con una librería de planillas, para conservar logo, tabla, estilos y fórmulas. No sustituirlo por SheetJS/ExcelJS en modo escritura. Se eliminan los valores en caché de las fórmulas y se fuerza `fullCalcOnLoad`.
- Scripts de Moodle (`buildScripts`): mismo formato que el Apps Script original (`const data = {...}` indexado por documento + código que recorre `table[6]`, celda 0 = documento, celda 6 = input). Única diferencia intencional: no se toca el input si no hay dato para ese documento. Los valores salen en **escala UTEC** redondeados a 2 decimales (enteros sin decimales). Examen: se omiten estudiantes con «NO CORRESPONDE».
- Emparejamiento planilla ↔ Moodle: por documento si Moodle lo trae; si no, por nombre (tokens sin acentos ni partículas, orden indistinto). Automático solo si ≥ 2 tokens compartidos, cobertura total y único; si no, «revisar» o «sin datos». Siempre editable a mano. No asignar coincidencias débiles.
- Sedes (Durazno, Minas, Melo, Fray Bentos y las que agregue el usuario) y materias solo etiquetan el perfil de selección de columnas guardado en `localStorage` (`cal:*`). Todo acceso a `localStorage` va en try/catch.

## Privacidad
Los datos son de estudiantes reales (nombres, documentos, notas).
- La app **no debe** enviar nada a la red ni cargar recursos externos: todo es local y las librerías van inlineadas.
- **No versionar** `.xlsx`, `.ods`, `.csv` ni fixtures con datos reales (ver `.gitignore`). Para pruebas usar datos sintéticos o pasar rutas locales por variables de entorno (`MOODLE`, `PLANILLA`).

## Convenciones
- JS sin framework ni transpilación, ES2017+ (async/await). `core.js` sin dependencias; `ui.js` sin estado global fuera de `S`.
- Cambios de lógica ⇒ agregar/ajustar casos en `test/core.test.js`.
- Cambios que afecten el `.xlsx` ⇒ verificar abriendo el resultado en LibreOffice (recalcula) y comparando con `Core.calc`.
- Mantener la UI usable en ancho de teléfono y en modo oscuro (variables CSS en `src/app.html`).
