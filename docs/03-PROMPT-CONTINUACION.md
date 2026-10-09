# 03 — PROMPT DE CONTINUACIÓN

## Cómo usarlo

Cuando se agote el consumo de tokens o quieras seguir en otro chat:

1. **Abre un chat nuevo.**
2. **Pega el contenido de la sección "PROMPT" de abajo** (el bloque entre líneas).
3. El asistente leerá los archivos del proyecto y continuará donde quedamos.

Los archivos de `docs/` son la memoria del proyecto. **No hace falta que copies y pegues
nada más.**

---

## PROMPT

```
Continúo el proyecto FinanzAdmin Pro. Es una reconstrucción desde cero sobre
Supabase Cloud, no una migración de Base44.

Si el repositorio no está ya en el workspace, clónalo primero:
  git clone <URL-DEL-REPO> finanzas
Y trabaja dentro de esa carpeta.

ANTES DE HACER NADA, lee estos archivos en este orden:
  1. docs/00-CONTEXTO.md      → qué es el proyecto, arquitectura y decisiones cerradas
  2. docs/01-DECISIONES.md    → el razonamiento detrás de cada decisión (D1-D26)
  3. docs/02-PLAN.md          → las 21 fases, cuál toca ahora, y qué se entregó ya
  4. docs/PRD.md              → PRD condensado (reglas de negocio)
  5. docs/04-SETUP-SUPABASE.md → cómo se aplicó el esquema

Después mira la sección "En curso" al final de docs/02-PLAN.md: ahí está el estado
exacto en que se quedó la construcción.

ESTADO RESUMIDO (por si acaso):
- FASES 0-15 completadas. El backend está desplegado y verificado en Supabase;
  el frontend compila y las ramas de cuentas y brokers están construidas.
- Siguiente: FASE 16 (módulo wallets + Earn).
- ANTES DE ESCRIBIR CONSULTAS, corre `npm run verificar`. No es opcional: lee las
  migraciones como fuente de verdad y comprueba cada columna que el código menciona.
  `npm run build` NO detecta columnas inventadas (son strings en runtime) — la primera
  versión de la FASE 14 inventó cuatro y compiló sin queja.
  Hay también `npm run humo` (42 comprobaciones de la FASE 15).
- COLUMNAS REALES: cuentas.monto (no saldo_actual) · movimientos.descripcion (no
  concepto) · no existe saldo_resultante (se reconstruye) · bancos solo pais +
  nombre_banco · brokers solo nombre_broker + moneda · type_cuenta es enum de DOS
  (ahorros, corriente) · tipo_activo es enum de SIETE · activos_broker NO tiene
  valor_total (es de activos_broker_view) · no existe wallet_saldos_view (usar
  wallets_view, que trae saldo_total).
- PENDIENTE IMPORTANTE: el módulo de brokers NUNCA se ha ejecutado contra Supabase.
  La verificación es estática + con un doble del cliente. Ver "Prueba de humo real"
  en docs/02-PLAN.md — es la FASE 16 paso 0.
- PENDIENTE DEL USUARIO: desplegar las Edge Functions (supabase/functions/README.md),
  configurar SMTP propio y rellenar la anon key real en .env.local.
- Si el repo no está clonado, o el remote no está configurado, pídeme la URL.

REGLAS DE TRABAJO:
- Construye por FASES PEQUEÑAS, una a la vez. No adelantes fases ni construyas
  varias de golpe.
- Al terminar cada fase: marca las casillas en docs/02-PLAN.md, actualiza el
  contador de "Estado global" y la sección "En curso", y añade cualquier decisión
  nueva a docs/01-DECISIONES.md con su razonamiento.
- Si una fase no se puede completar, apunta el estado exacto en "En curso" al
  final de docs/02-PLAN.md antes de terminar el turno.
- Tenemos poco presupuesto de tokens: sé conciso, no repitas el PRD, no expliques
  lo que ya está documentado.
- Todas las decisiones de docs/01-DECISIONES.md están CERRADAS. No las vuelvas a
  preguntar ni las cambies sin motivo. Si detectas un problema real con alguna,
  dilo, pero no las reabras por defecto.
- Las migraciones SQL YA SE APLICARON en Supabase. No las vuelvas a ejecutar ni
  las modifiques sin decírmelo: si hace falta un cambio de esquema, se crea una
  migración NUEVA (0009_...), nunca se edita una ya aplicada.
- Antes de commitear una fase: `npm run verificar`, `npm run humo` y `npm run build`.

TRAS LEER, dime en 3 líneas: qué es el proyecto, en qué fase vamos y qué vas a
construir a continuación. Después empieza.
```

---

## Notas

- Si el chat nuevo **no puede leer los archivos**, pega también el contenido de
  `docs/00-CONTEXTO.md` y `docs/01-DECISIONES.md` a continuación del prompt.
- Si quieres construir algo concreto que no toca el turno, dilo después del prompt:
  *"En vez de la fase que toca, haz la fase N"*.
- **Nunca pegues el contenido de `.env.local`** en un chat. Ahí están tus claves.
