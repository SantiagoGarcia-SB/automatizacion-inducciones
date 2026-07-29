# Fase 3 — Plan de Migración de la Operación

---

## 1. Objetivo

Que ningún usuario final (comerciales, líderes, analistas) tenga que abrir Google Sheets directamente para operar el proceso de inducciones. Las hojas quedan como base de datos interna, accesible solo vía backend.

---

## 2. Etapas de migración

### Etapa 1: Convivencia (Semana 1-2)

1. **Feature flag**: `NUEVO_FRONTEND = false` en Script Properties.
2. **Deploy paralelo**: el nuevo frontend se despliega como deployment de test (URL separada).
3. **Capacitación**: los usuarios acceden al nuevo frontend en modo lectura/prueba mientras siguen usando el anterior para radicar.
4. **Sin cambios en permisos**: las hojas siguen accesibles.

### Etapa 2: Activación del nuevo frontend (Semana 3)

1. **Feature flag**: `NUEVO_FRONTEND = true`.
2. **doGet()** redirige al nuevo frontend por defecto. El legacy queda accesible con `?page=legacy`.
3. **Comunicación**: correo a todos los usuarios con la nueva URL y guía rápida.
4. **Monitoreo**: Logs_Sistema captura errores del nuevo frontend.

### Etapa 3: Protección de hojas (Semana 4)

1. **Protección de rangos**:
   ```javascript
   function protegerHojasParaUsuariosFinales() {
     const ss = SpreadsheetApp.openById(ID_HOJA_CONTROL);
     const hojas = ['Control_General', 'Hoja_Control', 'CORREOS'];
     
     hojas.forEach(nombre => {
       const hoja = ss.getSheetByName(nombre);
       const protection = hoja.protect().setDescription('Solo sistema');
       // Solo el email del script deployer puede editar
       protection.removeEditors(protection.getEditors());
       protection.addEditor(Session.getEffectiveUser().getEmail());
       protection.setWarningOnly(false);
     });
   }
   ```

2. **Remover acceso de edición**: cambiar permisos del spreadsheet de "Editor" a "Viewer" para los comerciales. El script (ejecutando como USER_DEPLOYING) mantiene acceso de escritura.

3. **Excepción temporal**: los analistas mantienen acceso a "registro analisis" hasta que se construya su vista en la Web App (Fase futura).

### Etapa 4: Limpieza (Semana 5-6)

1. Eliminar `?page=legacy` del doGet().
2. Eliminar archivos legacy (`Codigo.js`, `Index.html`, `Estilos.html`, `Scripts.html` — renombrar a `_legacy_*` durante 2 semanas más antes de borrar definitivamente).
3. Consolidar triggers para que apunten a las nuevas funciones de servicio.

---

## 3. Plan de rollback

| Señal de rollback | Acción |
|---|---|
| Errores críticos en radicación (datos no se guardan) | Cambiar `NUEVO_FRONTEND = false` inmediatamente |
| Usuarios no pueden acceder | Verificar deployment; revertir a legacy URL |
| Datos corruptos en Sheets | Restaurar desde backup de Drive (versiones anteriores del archivo) |
| Sincronización rota | Verificar triggers con `verificarSaludDelSistema()` |

**Procedimiento de rollback**:
1. Cambiar Script Property `NUEVO_FRONTEND` a `false` (1 min).
2. Los usuarios vuelven al frontend legacy automáticamente en el siguiente acceso.
3. Restaurar permisos de edición en Sheets si se habían restringido.
4. Investigar y corregir el problema antes de reintentar.

---

## 4. Backups

- Google Sheets mantiene historial de versiones automático (90 días).
- Antes de cada etapa de migración: exportar copia manual del spreadsheet a Drive como respaldo explícito.
- Logs_Sistema documenta cada operación crítica para trazabilidad.

---

## 5. Ambiente de pruebas

1. **Copia de hojas**: crear copia de ambos spreadsheets (`ID_HOJA_CONTROL_TEST`, `ID_ARCHIVO_ANALISIS_TEST`).
2. **Script Properties**: el deployment de test apunta a las copias.
3. **Deployment separado**: el deploy de test tiene su propia URL y usa las hojas copia.
4. **Datos de prueba**: cargar 20-30 lotes de prueba con todos los estados posibles.
