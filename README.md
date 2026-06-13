# reinosdevaerlon

## Probar IdleRPG

El componente `IdleRPG.tsx` es un componente React/TypeScript independiente. Para probarlo sin crear un proyecto React completo, abre la demo incluida:

```bash
python3 -m http.server 8000
```

Luego visita `http://localhost:8000/idle-rpg-demo.html` en el navegador. La demo carga `IdleRPG.tsx`, lo transpila en el navegador con Babel Standalone y usa React, ReactDOM y Tailwind desde CDN.

> Nota: abre la demo desde el servidor local, no directamente con `file://`, porque el navegador necesita poder leer `IdleRPG.tsx` mediante `fetch`.
