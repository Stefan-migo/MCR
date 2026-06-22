# Propuesta: Optimización de Streaming para Android

## Intención

Adaptar la configuración de streaming para dispositivos Android, que actualmente no tienen manejo específico. iOS ya posee un fallback con encoding único cuando no soporta simulcast; Android necesita el mismo tratamiento. Además, unificar la calidad por defecto a 720p en todos los dispositivos móviles y garantizar que la resolución de salida NDI se mantenga constante aunque el encoder degrade calidad internamente.

## Alcance

### Incluido
- Detección de Android vía user-agent en `webrtc-client.ts`
- Encoding único con `degradationPreference: 'maintain-resolution'` para Android (misma config que iOS)
- Stats adaptativa automática con resolución de salida constante (el encoder reduce bitrate, no resolución)
- Calidad por defecto 720p para todo mobile (Android e iPhone)
- Ajuste de `getOptimalConstraints` para priorizar 720p en mobile

### Excluido
- Cambios en `backend/src/mediasoup/config.ts` (codec order, bitrate cap)
- Soporte SVC o AV1
- Persistencia de preferencias de calidad entre sesiones
- Target device específico (solución general, no optimizada por modelo)

## Capacidades

### Nuevas Capacidades
None

### Capacidades Modificadas
- `stream-pipeline` — Se agrega encoding único con `maintain-resolution` para Android (sección `stream-quality-control`); se cambia calidad por defecto a 720p para mobile (sección `camera-defaults`)

## Enfoque

1. En `webrtc-client.ts`, detectar Android por user-agent (mismo patrón que iOS detection)
2. Para Android: publicar un solo encoding con `degradationPreference: 'maintain-resolution'` y `maxBitrate: 10000000`
3. En `stream-store.ts`, cambiar `selectedQualityPreset` default a 720p cuando el dispositivo sea mobile
4. En `camera-service.ts`, ajustar `getOptimalConstraints` para priorizar 720p en mobile
5. Stats se adaptan automáticamente — `maintain-resolution` fuerza al encoder a bajar bitrate antes que resolución

## Áreas Afectadas

| Archivo | Impacto | Descripción |
|---------|---------|-------------|
| `frontend/src/lib/webrtc-client.ts` | Modificado | Detección Android UA + encoding único |
| `frontend/src/store/stream-store.ts` | Modificado | Default quality 720p para mobile |
| `frontend/src/lib/camera-service.ts` | Modificado | `getOptimalConstraints` prioriza 720p en mobile |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Android no soporta `degradationPreference` | Baja | Feature detection antes de aplicar; fallback a encoding normal |
| UA detection frágil ante nuevos user-agents | Media | Mismo patrón regex que iOS; fácil de actualizar |
| 720p default puede ser bajo para algunos usuarios | Baja | El usuario puede seleccionar calidad superior manualmente |
| `maintain-resolution` puede aumentar latencia en redes congestionadas | Baja | El encoder prioriza resolución sobre frame rate; monitorear en validación |

## Plan de Rollback

Revertir cambios archivo por archivo: `webrtc-client.ts`, `stream-store.ts` y `camera-service.ts`. Cada cambio es independiente y reversible sin afectar a los otros.

## Dependencias

- Ninguna. Todos los cambios son del lado frontend.

## Criterios de Éxito

- [ ] Android detectado por UA y usa encoding único con `maintain-resolution`
- [ ] Resolución de salida NDI se mantiene constante aunque el encoder degrade bitrate internamente
- [ ] Todo dispositivo mobile (Android + iPhone) inicia en 720p por defecto
- [ ] Usuarios pueden subir manualmente a 1080p o 4K sin problemas
- [ ] No hay regresión en iOS o desktop browsers
