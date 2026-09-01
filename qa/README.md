# QA del Timeliner

Suites de Playwright que manejan el Gantt de verdad en un browser: arrastran
barras, tiran conectores, reordenan filas y verifican qué se guardaría.

Corren contra las páginas `app/qa/*`, que montan el chart sobre un fixture fijo
(la plantilla base, con grupos y un feriado) y **sólo existen en desarrollo** —
en producción devuelven 404.

```bash
npm run dev                  # en otra terminal
node qa/01-superficies.mjs   # chart, vista pública, MASTER, modo oscuro
node qa/02-scheduling.mjs    # cascada, resize, hitos, grupos
node qa/03-persistencia.mjs  # arrastrar → cambiar de pestaña → volver
```

Dos cosas que hacen perder tiempo si no se saben:

- **El CSS de Turbopack se queda viejo.** Si un cambio de estilo "no aplica",
  parar el server, `rm -rf .next` y arrancar de nuevo antes de sospechar del
  código. Pasó tres veces.
- **Medir el ancho de celda de la escala de días, no la banda del mes.** La
  escala tiene dos filas; la de arriba son meses y sus celdas miden cientos de
  píxeles. Los helpers de las suites ya toman la última fila.
