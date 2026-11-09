# Armador de calificaciones

Moodle → escala 0-100 → planilla del calificador → scripts para cargar las notas manualmente.
Se ejecuta íntegramente en el navegador; ningún dato de estudiantes sale de tu computadora.

## Ejecutar con Docker
```bash
docker compose up --build
```
Abrí http://localhost:8081. Para detenerlo: `docker compose down`.

## Ejecutar sin Docker
Requiere Node 18+.
```bash
npm install
npm start          # http://localhost:8081
```
O abrí directamente `dist/index.html` (generado con `npm run build`): es un único archivo que funciona sin internet.

## Desarrollo (Dev Containers)
El repo incluye un devcontainer (`.devcontainer`): en VS Code, «Reopen in Container» te deja Node 22, Playwright y las tareas listas. Una vez adentro:

```bash
npm run dev        # rearma dist/ ante cada cambio y sirve en http://localhost:8081
```

Tareas de VS Code disponibles (`.vscode/tasks.json`): **build**, **test** y **start (servir app)**. En `.vscode/launch.json` hay configuraciones para depurar los tests y abrir la app en Chrome.

## Pruebas
```bash
npm test           # unitarias de core.js (sin datos reales)
npm run test:e2e   # Playwright con archivos reales (requiere MOODLE= y PLANILLA=)
npm run lint       # ESLint
npm run format     # Prettier
```

## Uso
1. Elegí materia y sede (se pueden agregar más sedes).
2. Subí la exportación de Moodle (`.ods`, `.xlsx` o `.csv`) y asigná cada columna a **Actividades**, **Participación** o **Evaluación**. Ajustá «Sobre» si una columna quedó mal configurada (ej. máximo 40 = 100 %).
3. Subí la planilla del calificador (`.xlsx`), revisá el emparejamiento de estudiantes y descargá la planilla completada.
4. Generá los scripts, pegalos en la consola del navegador (F12) en la página de calificación manual de Moodle y presioná Enter.

Más detalles de reglas y diseño en [AGENTS.md](AGENTS.md).
