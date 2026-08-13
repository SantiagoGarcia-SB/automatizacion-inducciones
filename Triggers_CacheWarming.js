/**
 * ============================================================
 * Triggers_CacheWarming.js — Pre-calentamiento de caché
 *
 * Mantiene calientes las entradas de caché de resumen y lotes
 * para que doGet() encuentre cache-hit >90% en horario laboral.
 *
 * Trigger: cada 5 minutos (configurar con configurarTriggerPrecalentamiento).
 * Horario efectivo: L-V 7:00-18:00 Colombia (GMT-5).
 * ============================================================
 */

/**
 * Pre-calienta el caché de resumen y lotes para usuarios activos.
 * Solo ejecuta trabajo real en horario laboral (L-V 7:00-18:00 GMT-5).
 * Fuera de horario retorna inmediatamente sin consumir cuota de Sheets.
 *
 * Almacena en CacheWrapper con TTL 600s para que cubra al menos
 * 2 ciclos de trigger (5 min × 2 = 10 min < 600s).
 *
 * @sheets_read 2 (USUARIOS + Control_General) en horario laboral, 0 fuera
 * @sheets_write 0
 */
function precalentarCacheResumenYLotes() {
  // ── 1. Verificar horario laboral (L-V 7:00-18:00 Colombia GMT-5) ──
  if (!_esHorarioLaboral()) {
    return;
  }

  try {
    // ── 2. Leer usuarios activos ──
    var usuarios = UsuariosRepo_leerTodos();
    if (!usuarios || usuarios.length === 0) {
      _registrarEvento_('WARN', 'Triggers_CacheWarming.js', 'precalentarCacheResumenYLotes', 'Sin usuarios activos para pre-calentar');
      return;
    }

    // ── 3. Determinar qué usuarios pre-calentar ──
    // Priorizar roles que más frecuentemente acceden al sistema:
    // CONSULTOR, DIRECTOR, GERENTE, ADMIN, LIDER, ASESOR
    var rolesPreCalentar = ['CONSULTOR', 'DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER', 'ASESOR', 'COMERCIAL', 'AUXILIAR', 'ANALISTA'];
    var usuariosActivos = [];
    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].activo && rolesPreCalentar.indexOf(usuarios[i].rol) !== -1) {
        usuariosActivos.push(usuarios[i]);
      }
    }

    if (usuariosActivos.length === 0) return;

    // ── 4. Pre-calentar caché GLOBAL (para LIDER/ADMIN) ──
    _precalentarResumenParaEmail(null);  // null = sin filtro → GLOBAL
    _precalentarLotesParaEmail(null);    // null = sin filtro → GLOBAL

    // ── 5. Pre-calentar caché individual por usuario ──
    // Solo para roles que NO ven TODO (CONSULTOR, DIRECTOR, etc.)
    // Los que ven todo (LIDER, ADMIN) ya están cubiertos por GLOBAL
    for (var j = 0; j < usuariosActivos.length; j++) {
      var usuario = usuariosActivos[j];
      var verTodos = (usuario.rol === 'LIDER' || usuario.rol === 'ADMIN');

      if (!verTodos) {
        _precalentarResumenParaEmail(usuario.email);
        _precalentarLotesParaEmail(usuario.email);
      }
    }

    _registrarEvento_('INFO', 'Triggers_CacheWarming.js', 'precalentarCacheResumenYLotes',
      'Cache pre-calentado para ' + usuariosActivos.length + ' usuarios activos');

  } catch (e) {
    _registrarEvento_('ERROR', 'Triggers_CacheWarming.js', 'precalentarCacheResumenYLotes', e.message);
  }
}


/**
 * Calcula y almacena el resumen en caché para un email específico o GLOBAL.
 * @param {string|null} email - Email del usuario o null para GLOBAL
 * @private
 */
function _precalentarResumenParaEmail(email) {
  try {
    var cacheKey = email ? 'RESUMEN_' + email : 'RESUMEN_GLOBAL';
    var resumen = obtenerResumenComercial(email);
    CacheWrapper_putJSON(cacheKey, resumen, 600);
  } catch (e) {
    // Degradación elegante: si falla un usuario, continuar con los demás
    _registrarEvento_('WARN', 'Triggers_CacheWarming.js', '_precalentarResumenParaEmail',
      'Fallo para ' + (email || 'GLOBAL') + ': ' + e.message);
  }
}


/**
 * Calcula y almacena los lotes en caché para un email específico o GLOBAL.
 * @param {string|null} email - Email del usuario o null para GLOBAL
 * @private
 */
function _precalentarLotesParaEmail(email) {
  try {
    var cacheKey = email ? 'LOTES_' + email : 'LOTES_GLOBAL';
    var filtroEmail = email ? [email] : null;
    var resultado = obtenerLotesDeComercial(filtroEmail, 1, 9999, '', '');
    var datos = resultado.datos || [];
    CacheWrapper_putJSON(cacheKey, datos, 600);
  } catch (e) {
    // Degradación elegante: si falla un usuario, continuar con los demás
    _registrarEvento_('WARN', 'Triggers_CacheWarming.js', '_precalentarLotesParaEmail',
      'Fallo para ' + (email || 'GLOBAL') + ': ' + e.message);
  }
}


/**
 * Verifica si la hora actual está dentro del horario laboral colombiano.
 * Horario: Lunes a Viernes, 7:00 - 18:00 (GMT-5 / America/Bogota).
 * @returns {boolean} true si es horario laboral
 * @private
 */
function _esHorarioLaboral() {
  var ahora = new Date();
  // Formatear en zona horaria Colombia para obtener hora y día correctos
  var horaStr = Utilities.formatDate(ahora, 'GMT-5', 'H');
  var diaStr = Utilities.formatDate(ahora, 'GMT-5', 'u'); // 1=Lunes, 7=Domingo

  var hora = parseInt(horaStr, 10);
  var diaSemana = parseInt(diaStr, 10);

  // Lunes(1) a Viernes(5), 7:00 a 17:59 (antes de las 18:00)
  if (diaSemana < 1 || diaSemana > 5) return false;
  if (hora < 7 || hora >= 18) return false;

  return true;
}


/**
 * Configura el trigger periódico de pre-calentamiento de caché.
 * Ejecutar UNA VEZ desde el editor de Apps Script.
 *
 * - Elimina cualquier trigger existente para precalentarCacheResumenYLotes
 * - Crea un nuevo trigger time-based que ejecuta cada 5 minutos
 *
 * Idempotente: se puede re-ejecutar sin duplicar triggers.
 */
function configurarTriggerPrecalentamiento() {
  // Limpiar triggers existentes de esta función
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'precalentarCacheResumenYLotes') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Crear nuevo trigger cada 5 minutos
  ScriptApp.newTrigger('precalentarCacheResumenYLotes')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('Trigger creado: precalentarCacheResumenYLotes (cada 5 minutos). El filtro de horario laboral L-V 7:00-18:00 GMT-5 es interno a la función.');
}
