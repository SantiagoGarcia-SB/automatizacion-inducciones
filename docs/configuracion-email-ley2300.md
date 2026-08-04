# Configuración — Envío automático de correos Ley 2300

## Resumen

Este módulo (`Servicios_InfobipEmail.js`) automatiza el envío de correos electrónicos de cumplimiento de la Ley 2300 de 2023 a arrendatarios y codeudores de solicitudes aprobadas. Utiliza la plantilla **"CORREO LEY 2300"** configurada en Infobip para enviar mensajes personalizados con los placeholders `{$firstName}` (nombre del destinatario) y `{$data Inmobiliaria}` (nombre de la inmobiliaria).

El módulo se ejecuta dentro del flujo existente de `procesarDatosMejorado()`, después del envío de SMS y antes del reporte a líderes, cada 15 días.

---

## Requisitos previos

- **Cuenta de Infobip** con acceso a Email API habilitado
- **Dominio verificado en Infobip** con registros DNS configurados:
  - SPF (Sender Policy Framework)
  - DKIM (DomainKeys Identified Mail)
  - DMARC (Domain-based Message Authentication)
- **Plantilla "CORREO LEY 2300"** creada en Infobip con los placeholders:
  - `{$firstName}` — nombre del destinatario
  - `{$data Inmobiliaria}` — nombre de la inmobiliaria
- **Acceso a Script Properties** del proyecto en el editor de Apps Script

---

## Script Properties necesarias

| Propiedad | Descripción | Ejemplo | ¿Ya existe? |
|-----------|-------------|---------|-------------|
| `INFOBIP_BASE_URL` | Base URL de la cuenta Infobip | `xxxxx.api.infobip.com` | ✅ Ya existe (usada por SMS) |
| `INFOBIP_API_KEY` | API Key de la cuenta Infobip | `abc123...` | ✅ Ya existe (usada por SMS) |
| `INFOBIP_EMAIL_FROM` | Dirección de remitente verificada en Infobip | `noreply@ellibertador.co` | ❌ **NUEVA** — debe configurarse |
| `INFOBIP_EMAIL_TEMPLATE_ID` | ID numérico de la plantilla "CORREO LEY 2300" | `200000000028895` | ❌ **NUEVA** — debe configurarse |

> Las propiedades `INFOBIP_BASE_URL` e `INFOBIP_API_KEY` son compartidas con el módulo de SMS (`Servicios_InfobipSms.js`) y no requieren configuración adicional.

---

## Cómo obtener el templateId

1. Ingresar al portal de Infobip: [portal.infobip.com](https://portal.infobip.com)
2. Navegar a **Channels → Email → Templates**
3. Buscar la plantilla llamada **"CORREO LEY 2300"**
4. Hacer clic en la plantilla para abrirla
5. Observar la URL del navegador — tiene el formato:
   ```
   portal.infobip.com/broadcast/template/{templateId}
   ```
6. Copiar el número que aparece como `{templateId}` (es un número largo, ej: `200000000028895`)
7. Ese número es el valor que debe configurarse en `INFOBIP_EMAIL_TEMPLATE_ID`

---

## Cómo configurar las Script Properties

1. Abrir el proyecto en el editor de Apps Script
2. Ir a **Configuración del proyecto** (ícono de engranaje en el panel lateral izquierdo)
3. Desplazarse hasta la sección **Script Properties**
4. Hacer clic en **Agregar propiedad de secuencia de comandos**
5. Agregar las 2 propiedades nuevas:

| Propiedad | Valor |
|-----------|-------|
| `INFOBIP_EMAIL_FROM` | La dirección de correo verificada en Infobip (ej: `noreply@ellibertador.co`) |
| `INFOBIP_EMAIL_TEMPLATE_ID` | El ID numérico obtenido en el paso anterior |

6. Hacer clic en **Guardar propiedades de secuencia de comandos**

---

## Verificación antes del primer envío

Antes de activar el envío automático en producción, verificar los siguientes puntos:

### 1. Verificar configuración de Script Properties

Ejecutar la función `testEnvioLey2300()` desde el editor de Apps Script (si existe) para probar con un destinatario de prueba. Si no existe, se puede verificar manualmente que las 4 propiedades están configuradas revisando la consola de Script Properties.

### 2. Verificar dominio remitente en Infobip

- Ingresar al portal de Infobip → **Channels → Email → Domains**
- Confirmar que el dominio del remitente (ej: `ellibertador.co`) tiene status: **"Verified"**
- Si aparece como "Pending" o "Failed", revisar los registros DNS (SPF, DKIM, DMARC) en el proveedor de dominio

### 3. Verificar plantilla activa

- En el portal de Infobip → **Channels → Email → Templates**
- Confirmar que la plantilla "CORREO LEY 2300" está activa
- Verificar que los placeholders en la plantilla coinciden exactamente:
  - `{$firstName}` (no `{$nombre}` ni variantes)
  - `{$data Inmobiliaria}` (notar el espacio entre "data" e "Inmobiliaria")

---

## Comportamiento esperado

- Se ejecuta **cada 15 días** junto con el envío de SMS, dentro de `procesarDatosMejorado()`
- **Prioridad de canal:** SMS es el canal principal. Email actúa como respaldo (fallback).
- El orden de ejecución es: SMS (prioridad) → Fallback de SMS fallidos a Email → Email directo (sin celular) → Reporte a líderes → Marcado de filas
- Si un contacto tiene celular, se intenta primero por SMS. Si el SMS falla y el contacto también tiene correo, se reintenta automáticamente por email.
- Si un contacto no tiene celular pero sí correo, se envía directamente por email.
- Si faltan las propiedades de email (`INFOBIP_EMAIL_FROM` o `INFOBIP_EMAIL_TEMPLATE_ID`), el módulo registra un error en `Logs_Sistema` pero **no interrumpe** el flujo de SMS ni el marcado de filas
- Los resultados del envío aparecen en el reporte quincenal enviado a líderes (jenny.ascanio@segurosbolivar.com y kharen.garcia@segurosbolivar.com)
- Las filas se marcan en la columna "Estado Automatización" con el resultado combinado:
  - `Procesado {fecha}` — la persona fue notificada (por SMS exitoso, o por email fallback/directo exitoso)
  - `Parcial {fecha} · SMS falló` — SMS falló y no había correo de respaldo
  - `Parcial {fecha} · Email falló` — contacto sin celular y email falló
  - `Parcial {fecha} · SMS y Email fallaron` — SMS falló y el email de respaldo también falló

---

## Troubleshooting

| Problema | Posible causa | Solución |
|----------|---------------|----------|
| "Credenciales de Infobip Email no configuradas" | Falta alguna de las 4 Script Properties requeridas | Verificar que `INFOBIP_BASE_URL`, `INFOBIP_API_KEY`, `INFOBIP_EMAIL_FROM` e `INFOBIP_EMAIL_TEMPLATE_ID` estén configuradas correctamente en Script Properties |
| Muchos emails rechazados (alto % de fallidos) | Dominio remitente no verificado o expirado | Ingresar al portal de Infobip → Channels → Email → Domains y verificar que el estado sea "Verified". Revisar registros SPF, DKIM y DMARC |
| Circuit breaker activado (envío abortado) | Más del 50% de envíos consecutivos fallaron | Revisar `Logs_Sistema` para identificar los errores específicos. Puede ser un problema temporal de la API de Infobip, plantilla desactivada, o problema de dominio |
| Plantilla no encontrada (error de Infobip) | `INFOBIP_EMAIL_TEMPLATE_ID` incorrecto o plantilla eliminada | Verificar que el ID en Script Properties coincida con el ID actual de la plantilla en el portal de Infobip |
| Emails no llegan al destinatario | Posible spam filtering o dirección inexistente | Verificar en el portal de Infobip → Analyze → Email logs el estado de entrega del mensaje específico |
| El módulo de email no se ejecuta | `datosCorreos` está vacío (no hay destinatarios con email) | Verificar que las solicitudes aprobadas tengan direcciones de correo en la hoja "registro analisis" |
