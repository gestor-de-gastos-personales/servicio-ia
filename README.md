<!-- calidad:inicio -->
![Calidad](https://img.shields.io/badge/Calidad-100%2F100-green) ![Aprobado](https://img.shields.io/badge/Aprobado-SI-green) ![Cumple](https://img.shields.io/badge/Cumple-14%2F15-green) ![Duplicación](https://img.shields.io/badge/Duplicaci%C3%B3n-0.0%25-green) ![SEC](https://img.shields.io/badge/SEC-0-green) ![SQL](https://img.shields.io/badge/SQL-0-green) ![DBG](https://img.shields.io/badge/DBG-0-green) ![Capas](https://img.shields.io/badge/Capas-2-green) ![Tests](https://img.shields.io/badge/Tests-6-green) ![Cob](https://img.shields.io/badge/Cob-90.7%25-green) ![EP](https://img.shields.io/badge/EP-0-red)

**Calidad de servicios (heurístico):** índice **100/100** · cumple **14/15** · aprobado **SI** · capas **2**
Detalle completo en [`docs/EVALUACION.md`](docs/EVALUACION.md).
<!-- calidad:fin -->

# servicio-ia

Servicio Fastify de intención/visión para Mangos. Recibe texto o imágenes de
tickets y devuelve el contrato que consume `bot-telegram`.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Liveness: el proceso está vivo. |
| GET | `/ready` | Readiness: verifica además que `api-gastos` responda (503 si no). |
| GET | `/version` | Versión desplegada y proveedor de IA activo. |
| GET | `/intents` | Catálogo de intenciones soportadas por el prompt. |
| GET | `/categorias` | Categorías reales de `api-gastos` con caché corta (`CATEGORIAS_CACHE_MS`). |
| POST | `/analizar` | `{ texto }` → gasto/intención normalizados. |
| POST | `/analizar-lote` | `{ textos: string[] }` (1–20) → `{ resultados: [...] }` en orden. |
| POST | `/analizar-imagen` | `multipart/form-data` con `file` de imagen → gasto normalizado. |
| POST | `/normalizar-categoria` | `{ comercio, descripcion? }` → categoría inferida por marca/comercio. |
| POST | `/validar-respuesta` | `{ contenido }` → `{ valida, respuesta }` para depurar JSON del modelo. |

## Variables de entorno

Ver [`.env.example`](.env.example). `API_GASTOS_URL` es obligatoria para la
normalización de categorías; `CATEGORIAS_CACHE_MS` ajusta la caché (60 s por
defecto).