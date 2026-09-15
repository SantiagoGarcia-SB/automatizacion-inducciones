/** Orquestación de entregas Ley 2300 respaldada por el ledger por UUID/participante/canal. */
var CUMPLIMIENTO_LEY2300_UMBRAL_CIRCUITO_EMAIL = 5;

/**
 * Procesa entregas elegibles según el trigger ya configurado. La marca visual es un resumen derivado.
 * @returns {void}
 */
function procesarDatosMejorado() {
  if (!NotificationConfig_estaActiva('cumplimiento_ley_2300')) {
    NotificationConfig_registrarSupresion('cumplimiento_ley_2300');
    return;
  }
  _registrarEjecucionCumplimientoLey2300_(new Date());
  var inicio = new Date().getTime();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log('No se pudo obtener el lock para entregas Ley 2300.');
    return;
  }

  var contexto;
  try {
    EntregasLey2300_recuperarReclamosVencidos(new Date());
    EntregasLey2300_recuperarCierresPendientes();
    contexto = _prepararEntregasLey2300_();
  } catch (error) {
    _registrarEvento_('ERROR', 'Cumplimiento.js', 'Preparación Ley 2300 falló', _detalleSeguroLey2300_(error));
    return;
  } finally {
    lock.releaseLock();
  }

  var resultados = [];
  var fallosEmailConsecutivos = 0;
  var circuitoAbierto = false;
  for (var indice = 0; indice < contexto.elegibles.length; indice++) {
    var candidato = contexto.elegibles[indice];
    if (circuitoAbierto && candidato.canal === 'EMAIL') continue;
    var finalizada = _procesarEntregaLey2300_(candidato, lock);
    if (!finalizada) continue;
    resultados.push(finalizada);
    if (candidato.canal === 'EMAIL') {
      fallosEmailConsecutivos = finalizada.ok ? 0 : fallosEmailConsecutivos + 1;
      circuitoAbierto = fallosEmailConsecutivos >= CUMPLIMIENTO_LEY2300_UMBRAL_CIRCUITO_EMAIL;
    }
  }

  if (!lock.tryLock(30000)) {
    _registrarEvento_('WARN', 'Cumplimiento.js', 'Resumen Ley 2300 diferido', 'Resultados persistidos: ' + resultados.length);
    return;
  }
  var resumen;
  try {
    var uuidsProcesados = _actualizarMarcasLey2300_(contexto.hoja, contexto.columnas, contexto.filasPorUuid);
    EntregasLey2300_cerrarProcesadosPorUuid(uuidsProcesados);
    resumen = _resumirResultadosLey2300_(contexto, resultados, circuitoAbierto, new Date().getTime() - inicio);
  } catch (error) {
    _registrarEvento_('ERROR', 'Cumplimiento.js', 'Resumen Ley 2300 falló', _detalleSeguroLey2300_(error));
    return;
  } finally {
    lock.releaseLock();
  }

  // El reporte es posterior y no crítico: un fallo aquí nunca cambia resultados ya persistidos.
  _enviarReporteLey2300_(resumen);
}

/** Registra la última ejecución sin datos de negocio para estimar la siguiente agenda ADMIN. */
function _registrarEjecucionCumplimientoLey2300_(ahora) {
  try { PropertiesService.getScriptProperties().setProperty('LEY2300_ULTIMA_EJECUCION_MS', String(ahora.getTime())); } catch (error) {}
}

/** @returns {{hoja:Object,columnas:Object,elegibles:Array,filasPorUuid:Object,fechas:Array}} Contexto efímero sin persistir PII. */
function _prepararEntregasLey2300_() {
  var hoja = retry(function() { return SpreadsheetApp.openById(ID_ARCHIVO_ANALISIS).getSheetByName('registro analisis'); });
  if (!hoja) throw new Error('No se encontró la hoja de análisis.');
  var datos = retry(function() { return hoja.getDataRange().getValues(); });
  if (datos.length < 2) return { hoja: hoja, columnas: {}, elegibles: [], filasPorUuid: {}, fechas: [] };
  var columnas = _mapearColumnasLey2300_(datos[0]);
  var faltantes = Object.keys(columnas).filter(function(clave) { return columnas[clave] === -1; });
  if (faltantes.length) throw new Error('Esquema de análisis incompatible: ' + faltantes.join(','));

  var elegibles = []; var filasPorUuid = {}; var fechas = [];
  for (var indice = 1; indice < datos.length; indice++) {
    var fila = datos[indice];
    if (String(fila[columnas.registroAnalista] || '').trim().toUpperCase() !== 'APROBADO') continue;
    var uuid = String(fila[columnas.uuid] || '').trim();
    if (!uuid) continue;
    var marca = String(fila[columnas.estadoAutomatizacion] || '').trim();
    var personas = _extraerParticipantesLey2300_(fila, columnas);
    filasPorUuid[uuid] = { fila: indice + 1, participantes: personas };
    _agregarFechaLey2300_(fechas, fila[columnas.fechaEvaluacion]);
    var entregasExistentes = EntregasLey2300_obtenerPorUuid(uuid);
    if (/^PARCIAL\b/i.test(marca) && !entregasExistentes.length) {
      _migrarParcialLey2300_(uuid, personas, fila, columnas);
      continue;
    }
    // Una marca Parcial derivada del ledger no bloquea LISTO_PARA_REINTENTO.
    if (marca && !/^PARCIAL\b/i.test(marca)) continue;
    for (var personaIndice = 0; personaIndice < personas.length; personaIndice++) {
      var candidato = _crearCandidatoEntregaLey2300_(uuid, indice + 1, fila, columnas, personas[personaIndice]);
      if (candidato) elegibles.push(candidato);
    }
  }
  return { hoja: hoja, columnas: columnas, elegibles: elegibles, filasPorUuid: filasPorUuid, fechas: fechas };
}

/** @param {Array} encabezados Encabezados de análisis. @returns {Object} Índices requeridos. */
function _mapearColumnasLey2300_(encabezados) {
  function indice(nombre) { return encabezados.indexOf(nombre); }
  return {
    uuid: indice('UUID_SISTEMA'), idLote: indice('codigo lote'), solicitud: indice('Solicitud Inquilino'),
    registroAnalista: indice('REGISTRO ANALISTA SAI'), inmobiliaria: indice('inmobiliaria'), estadoAutomatizacion: indice('Estado Automatización'), fechaEvaluacion: indice('Fecha Evaluacion'),
    arrendatario: indice('Arrendatario'), telInq: indice('TEL_INQ'), correoInq: indice('CORREO_INQ'),
    coa1: indice('COA1'), telCoa1: indice('TEL_COA1'), correoCoa1: indice('CORREO_COA1'),
    coa2: indice('COA2'), telCoa2: indice('TEL_COA2'), correoCoa2: indice('CORREO_COA2'),
    coa3: indice('COA3'), telCoa3: indice('TEL_COA3'), correoCoa3: indice('CORREO_COA3'),
    coa4: indice('COA4'), telCoa4: indice('TEL_COA4'), correoCoa4: indice('CORREO_COA4'),
    coa5: indice('COA5'), telCoa5: indice('TEL_COA5'), correoCoa5: indice('CORREO_COA5')
  };
}

/** @param {Array} fila Fila de análisis. @param {Object} columnas Índices. @returns {Array} Participantes. */
function _extraerParticipantesLey2300_(fila, columnas) {
  var sufijos = [
    { participante: 'INQ', nombre: 'arrendatario', tel: 'telInq', correo: 'correoInq' },
    { participante: 'COA1', nombre: 'coa1', tel: 'telCoa1', correo: 'correoCoa1' },
    { participante: 'COA2', nombre: 'coa2', tel: 'telCoa2', correo: 'correoCoa2' },
    { participante: 'COA3', nombre: 'coa3', tel: 'telCoa3', correo: 'correoCoa3' },
    { participante: 'COA4', nombre: 'coa4', tel: 'telCoa4', correo: 'correoCoa4' },
    { participante: 'COA5', nombre: 'coa5', tel: 'telCoa5', correo: 'correoCoa5' }
  ];
  return sufijos.map(function(definicion) {
    return { participante: definicion.participante, nombre: String(fila[columnas[definicion.nombre]] || '').trim(), tel: String(fila[columnas[definicion.tel]] || '').trim(), correo: String(fila[columnas[definicion.correo]] || '').trim() };
  }).filter(function(persona) { return !!persona.nombre; });
}

/** @returns {Object|null} Candidato de entrega con contacto efímero. */
function _crearCandidatoEntregaLey2300_(uuid, filaNumero, fila, columnas, persona) {
  var correo = normalizarCorreoLey2300(persona.correo);
  var celular = normalizarCelularLey2300(persona.tel);
  var canal = correo ? 'EMAIL' : celular ? 'SMS' : _canalCorreccionLey2300_(persona);
  var destino = canal === 'EMAIL' ? correo : celular;
  if (!destino) {
    EntregasLey2300_crearPendienteCorreccion({ uuid: uuid, idLote: String(fila[columnas.idLote] || '').trim(), solicitud: String(fila[columnas.solicitud] || '').trim(), participante: persona.participante, canal: canal });
    return null;
  }
  var creada = EntregasLey2300_crearOReutilizar({ uuid: uuid, idLote: String(fila[columnas.idLote] || '').trim(), solicitud: String(fila[columnas.solicitud] || '').trim(), participante: persona.participante, canal: canal, destino: destino });
  var entrega = creada.entrega;
  if (!_esEntregaElegibleLey2300_(entrega)) return null;
  return { entrega: entrega, fila: filaNumero, uuid: uuid, participante: persona.participante, canal: canal, nombre: persona.nombre, inmobiliaria: String(fila[columnas.inmobiliaria] || '').trim(), email: correo, celular: celular };
}

/** @param {{correo:string,tel:string}} persona Contactos fuente no persistibles. @returns {string} Canal corregible inferido. */
function _canalCorreccionLey2300_(persona) {
  if (String(persona.correo || '').trim()) return 'EMAIL';
  if (String(persona.tel || '').trim()) return 'SMS';
  return 'EMAIL';
}

/** @param {Object} entrega DTO del ledger. @returns {boolean} Elegibilidad por estado y fecha. */
function _esEntregaElegibleLey2300_(entrega) {
  if (!entrega || (entrega.estado !== 'PENDIENTE' && entrega.estado !== 'LISTO_PARA_REINTENTO')) return false;
  if (!entrega.proximoIntentoEn) return true;
  return new Date(entrega.proximoIntentoEn).getTime() <= new Date().getTime();
}

/** Migra una marca histórica Parcial a conciliación sin transporte ni intento. */
function _migrarParcialLey2300_(uuid, personas, fila, columnas) {
  for (var indice = 0; indice < personas.length; indice++) {
    var persona = personas[indice]; var correo = normalizarCorreoLey2300(persona.correo); var celular = normalizarCelularLey2300(persona.tel);
    var canal = correo ? 'EMAIL' : celular ? 'SMS' : '';
    if (!canal) continue;
    var entrega = EntregasLey2300_crearOReutilizar({ uuid: uuid, idLote: String(fila[columnas.idLote] || '').trim(), solicitud: String(fila[columnas.solicitud] || '').trim(), participante: persona.participante, canal: canal, destino: canal === 'EMAIL' ? correo : celular }).entrega;
    if (entrega.estado === 'PENDIENTE') EntregasLey2300_migrarParcial(entrega);
  }
}

/** @param {Object} candidato Contexto efímero. @param {Object} lock Lock compartido. @returns {Object|null} Resultado final. */
function _procesarEntregaLey2300_(candidato, lock) {
  if (!lock.tryLock(30000)) return null;
  var reclamo;
  try {
    var actual = EntregasLey2300_obtenerPorId(candidato.entrega.entregaId);
    if (!_esEntregaElegibleLey2300_(actual)) return null;
    reclamo = EntregasLey2300_actualizarEstado({ entregaId: actual.entregaId, versionEsperada: actual.version, estadoNuevo: 'EN_PROCESO', actor: 'TRIGGER_LEY2300', detalle: 'RECLAMADA' });
  } finally { lock.releaseLock(); }
  if (!reclamo || !reclamo.ok) return null;

  var transporte = candidato.canal === 'EMAIL'
    ? _enviarEmailInfobip({ entregaId: reclamo.entrega.entregaId, email: candidato.email, nombre: candidato.nombre, inmobiliaria: candidato.inmobiliaria })
    : _enviarSmsInfobip({ entregaId: reclamo.entrega.entregaId, celular: candidato.celular, nombre: candidato.nombre, inmobiliaria: candidato.inmobiliaria });

  if (!lock.tryLock(30000)) {
    _registrarEvento_('WARN', 'Cumplimiento.js', 'Finalización Ley 2300 diferida', 'Entrega reclamada pendiente de conciliación.');
    return null;
  }
  try {
    var estadoFinal = _estadoFinalLey2300_(reclamo.entrega, transporte);
    var finalizacion = EntregasLey2300_actualizarEstado({ entregaId: reclamo.entrega.entregaId, versionEsperada: reclamo.entrega.version, estadoNuevo: estadoFinal.estado, causaFallo: transporte.causa, codigoResultado: String(transporte.statusCode || ''), referenciaProveedor: transporte.messageId || '', proximoIntentoEn: estadoFinal.reintentar ? new Date() : '', actor: 'TRIGGER_LEY2300', detalle: 'RESULTADO_' + transporte.tipo });
    if (!finalizacion.ok) {
      EntregasLey2300_forzarConciliacion(reclamo.entrega.entregaId, 'TRIGGER_LEY2300', 'FINALIZACION_CAS_RECHAZADA');
      return null;
    }
    return { ok: transporte.ok, estado: estadoFinal.estado, canal: candidato.canal };
  } catch (error) {
    try {
      EntregasLey2300_forzarConciliacion(reclamo.entrega.entregaId, 'TRIGGER_LEY2300', 'FINALIZACION_PERSISTENCIA_FALLIDA');
    } catch (conciliacionError) {
      _registrarEvento_('WARN', 'Cumplimiento.js', 'Conciliación Ley 2300 diferida', 'Entrega reclamada pendiente de recuperación.');
    }
    return null;
  } finally { lock.releaseLock(); }
}

/** @param {Object} reclamada DTO después del reclamo. @param {Object} transporte Resultado de proveedor. @returns {{estado:string,reintentar:boolean}} Estado final. */
function _estadoFinalLey2300_(reclamada, transporte) {
  if (transporte.ok) return { estado: 'ENVIADO', reintentar: false };
  if (transporte.tipo === 'AMBIGUO') return { estado: 'PENDIENTE_CONCILIACION', reintentar: false };
  if (transporte.causa === 'DATOS_CONTACTO') return { estado: 'PENDIENTE_CORRECCION', reintentar: false };
  if (transporte.causa === 'RECHAZO_DEFINITIVO') return { estado: 'FALLIDO_DEFINITIVO', reintentar: false };
  if (reclamada.intentos >= reclamada.maxIntentos) return { estado: 'FALLIDO_DEFINITIVO', reintentar: false };
  return { estado: 'LISTO_PARA_REINTENTO', reintentar: true };
}

/**
 * Actualiza Estado Automatización desde el ledger y confirma los Procesado antes de cerrar grupos.
 * @returns {string[]} UUIDs cuyo resumen Procesado quedó persistido en la fuente.
 */
function _actualizarMarcasLey2300_(hoja, columnas, filasPorUuid) {
  var fecha = Utilities.formatDate(new Date(), 'GMT-5', 'yyyy-MM-dd HH:mm:ss');
  var procesados = [];
  Object.keys(filasPorUuid).forEach(function(uuid) {
    var entregas = EntregasLey2300_obtenerPorUuid(uuid);
    if (!entregas.length) return;
    var estados = entregas.map(function(entrega) { return entrega.estado; });
    var todoEnviado = estados.every(function(estado) { return estado === 'ENVIADO'; });
    var marca = estados.indexOf('PENDIENTE_CONCILIACION') !== -1 ? 'Parcial ' + fecha + ' · Pendiente de conciliación' :
      todoEnviado ? 'Procesado ' + fecha : 'Parcial ' + fecha + ' · Requiere gestión';
    var celda = hoja.getRange(filasPorUuid[uuid].fila, columnas.estadoAutomatizacion + 1);
    celda.setValue(marca);
    if (todoEnviado && /^PROCESADO\b/i.test(String(celda.getValue() || '').trim())) procesados.push(uuid);
  });
  return procesados;
}

/** @returns {Object} Métricas no identificables para el reporte. */
function _resumirResultadosLey2300_(contexto, resultados, circuitoAbierto, duracionMs) {
  var estados = { ENVIADO: 0, PENDIENTE_CORRECCION: 0, LISTO_PARA_REINTENTO: 0, FALLIDO_DEFINITIVO: 0, PENDIENTE_CONCILIACION: 0 };
  resultados.forEach(function(resultado) { if (estados.hasOwnProperty(resultado.estado)) estados[resultado.estado]++; });
  return { contratos: Object.keys(contexto.filasPorUuid).length, seleccionadas: contexto.elegibles.length, enviados: estados.ENVIADO, pendientesCorreccion: estados.PENDIENTE_CORRECCION, listosReintento: estados.LISTO_PARA_REINTENTO, fallidosDefinitivos: estados.FALLIDO_DEFINITIVO, pendientesConciliacion: estados.PENDIENTE_CONCILIACION, pospuestasCircuito: circuitoAbierto ? Math.max(0, contexto.elegibles.length - resultados.length) : 0, circuitoAbierto: circuitoAbierto, duracionMs: duracionMs, rangoFechas: _rangoFechasLey2300_(contexto.fechas) };
}

/** @param {Object} resumen Métricas seguras. @returns {void} */
function _enviarReporteLey2300_(resumen) {
  if (!resumen.seleccionadas && !resumen.contratos) return;
  try {
    var destinatarios = UsuariosRepo_getCorreosAdmin().join(',');
    if (!destinatarios || !_verificarCuotaEmail_(1)) return;
    MailApp.sendEmail({ to: destinatarios, bcc: BCC_AUDITORIA, subject: '📄 Cumplimiento Ley 2300', htmlBody: _construirCuerpoLey2300_(resumen), replyTo: 'noreply@ellibertador.co', name: 'Inducciones · El Libertador' });
  } catch (error) {
    _registrarEvento_('WARN', 'Cumplimiento.js', 'Reporte Ley 2300 no enviado', _detalleSeguroLey2300_(error));
  }
}

/** @param {Array} fechas Fechas de evaluación. @returns {string} Rango visual. */
function _rangoFechasLey2300_(fechas) {
  if (!fechas.length) return 'Sin fecha de evaluación';
  fechas.sort(function(a, b) { return a.getTime() - b.getTime(); });
  var inicio = Utilities.formatDate(fechas[0], 'GMT-5', 'dd/MM/yyyy'); var fin = Utilities.formatDate(fechas[fechas.length - 1], 'GMT-5', 'dd/MM/yyyy');
  return inicio === fin ? inicio : inicio + ' - ' + fin;
}

/** @param {Array} fechas Acumulador. @param {*} valor Fecha potencial. */
function _agregarFechaLey2300_(fechas, valor) { var fecha = valor instanceof Date ? valor : new Date(valor); if (!isNaN(fecha.getTime())) fechas.push(fecha); }
/** @param {Error} error Error técnico. @returns {string} Detalle sin PII. */
function _detalleSeguroLey2300_(error) { return String(error && error.message || 'error').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTADO]').replace(/\d{7,}/g, '[REDACTADO]').slice(0, 180); }

/** Genera el correo-resumen sin adjuntar CSV ni destinos. */
function _construirCuerpoLey2300_(datos) {
  var chips = [
    { label: 'Corte / Periodo', valor: datos.rangoFechas || 'Sin fecha de evaluación', colorVal: _C_ROJO },
    { label: 'Solicitudes', valor: String(datos.contratos || 0) }, { label: 'Entregas enviadas', valor: String(datos.enviados || 0), colorVal: '#16a34a' },
    { label: 'Pendientes de corrección', valor: String(datos.pendientesCorreccion || 0), colorVal: _C_ROJO },
    { label: 'Listas para reintento', valor: String(datos.listosReintento || 0) },
    { label: 'Fallidos definitivos', valor: String(datos.fallidosDefinitivos || 0), colorVal: _C_ROJO },
    { label: 'Pendientes de conciliación', valor: String(datos.pendientesConciliacion || 0), colorVal: _C_ROJO }
  ];
  var nota = 'El detalle accionable está disponible en la bandeja ADMIN de Entregas Ley 2300. El reporte no incluye datos de contacto.';
  if (datos.pospuestasCircuito) nota += ' El circuit breaker dejó ' + datos.pospuestasCircuito + ' entrega(s) pendientes sin invocarlas.';
  return _envolver_(_bloque_cabecera_('Cumplimiento Ley 2300') + _bloque_barra_estado_(_C_NAVY, '&#10003;', datos.circuitoAbierto ? 'Completado con alertas' : 'Procesamiento completado') + _bloque_cuerpo_inicio_('Hola equipo de inducciones', 'Se procesaron comunicaciones para solicitudes aprobadas.') + _bloque_chips_(chips) + _bloque_nota_(nota) + _bloque_pie_());
}

/** Conserva la configuración del trigger existente. */
function configurarTriggerCumplimiento() { return reconciliarConfiguracionNotificaciones(); }

/** Compatibilidad para consumidores anteriores de marca agregada. */
function _generarMarcaEstado(resultadoSms, resultadoEmail, fecha) {
  var resultados = [resultadoSms, resultadoEmail].filter(function(resultado) { return resultado !== null; });
  return resultados.every(function(resultado) { return resultado.ok; }) ? 'Procesado ' + fecha : 'Parcial ' + fecha + ' · Requiere gestión';
}

/** @param {*} valor Campo CSV. @returns {string} Campo escapado. */
function _csvEscape_(valor) { var texto = valor === null || valor === undefined ? '' : String(valor); return /[",\n\r]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto; }
/** @param {Array} filas Filas sin PII. @param {string} nombreArchivo Nombre. @returns {Blob} CSV. */
function _csvBlob_(filas, nombreArchivo) { return Utilities.newBlob(String.fromCharCode(0xFEFF) + filas.map(function(fila) { return fila.map(_csvEscape_).join(','); }).join('\r\n'), 'text/csv', nombreArchivo); }
