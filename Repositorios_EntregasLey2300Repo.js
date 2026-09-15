/**
 * Repositorio de entregas Ley 2300.
 *
 * Mantiene el estado actual de cada entrega y dos bitácoras append-only en el
 * Libro de Control. Los destinos completos solo existen durante la llamada;
 * nunca se persisten ni se retornan desde este módulo.
 */

var ENTREGAS_LEY2300_HOJA = 'Entregas_Ley2300';
var ENTREGAS_LEY2300_EVENTOS_HOJA = 'Entregas_Ley2300_Eventos';
var OPERACIONES_LEY2300_HOJA = 'Operaciones_Ley2300';
var ENTREGAS_LEY2300_RETENCION_HOJA = 'Retencion_Ley2300';
var ENTREGAS_LEY2300_CIERRES_HOJA = 'Cierres_Ley2300';
var ENTREGAS_LEY2300_CIERRES_PENDIENTES_HOJA = 'Cierres_Ley2300_Pendientes';
var ENTREGAS_LEY2300_MAX_INTENTOS_DEFAULT = 3;
var ENTREGAS_LEY2300_MAX_POR_PAGINA = 100;
var ENTREGAS_LEY2300_RECLAMO_VENCIDO_MS = 15 * 60 * 1000;
var ENTREGAS_LEY2300_RETENCION_DIAS = 90;
var ENTREGAS_LEY2300_CONFIRMACION_RETENCION = 'ELIMINAR_REGISTROS_TERMINALES_VENCIDOS';

var ENTREGAS_LEY2300_ESTADOS = [
  'PENDIENTE', 'EN_PROCESO', 'ENVIADO', 'PENDIENTE_CORRECCION',
  'LISTO_PARA_REINTENTO', 'FALLIDO_DEFINITIVO', 'PENDIENTE_CONCILIACION'
];
var ENTREGAS_LEY2300_ESTADOS_PENDIENTES = [
  'PENDIENTE', 'EN_PROCESO', 'PENDIENTE_CORRECCION', 'LISTO_PARA_REINTENTO',
  'PENDIENTE_CONCILIACION', 'FALLIDO_DEFINITIVO'
];
var ENTREGAS_LEY2300_CAUSAS = [
  'DATOS_CONTACTO', 'TEMPORAL', 'CONFIGURACION', 'RECHAZO_DEFINITIVO', 'AMBIGUO'
];
var ENTREGAS_LEY2300_PARTICIPANTES = ['INQ', 'COA1', 'COA2', 'COA3', 'COA4', 'COA5'];
var ENTREGAS_LEY2300_CANALES = ['EMAIL', 'SMS'];
var OPERACIONES_LEY2300_ESTADOS = [
  'PREPARADA', 'CONTROL_APLICADO', 'ANALISIS_APLICADO', 'COMPLETA', 'PENDIENTE_CONCILIACION'
];

var ENTREGAS_LEY2300_ENCABEZADOS = [
  'ENTREGA_ID', 'CLAVE_ENTREGA', 'UUID_SISTEMA', 'ID_LOTE', 'SOLICITUD',
  'PARTICIPANTE', 'CANAL', 'DESTINO_MASCARADO', 'HUELLA_DESTINO', 'ESTADO',
  'CAUSA_FALLO', 'CODIGO_RESULTADO', 'REFERENCIA_PROVEEDOR', 'INTENTOS',
  'MAX_INTENTOS', 'PROXIMO_INTENTO_EN', 'INTENTO_ACTIVO_ID', 'EN_PROCESO_DESDE',
  'VERSION', 'CREADA_EN', 'ACTUALIZADA_EN', 'ENVIADA_EN'
];
var ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS = [
  'EVENTO_ID', 'ENTREGA_ID', 'UUID_SISTEMA', 'TIPO_EVENTO', 'ESTADO_ANTERIOR',
  'ESTADO_NUEVO', 'CAUSA_FALLO', 'CODIGO_RESULTADO', 'REFERENCIA_PROVEEDOR',
  'DESTINO_MASCARADO', 'ACTOR_HUELLA', 'DETALLE_SANITIZADO', 'CREADO_EN'
];
var OPERACIONES_LEY2300_ENCABEZADOS = [
  'OPERACION_ID', 'ENTREGA_ID', 'UUID_SISTEMA', 'TIPO_OPERACION', 'ESTADO',
  'CAMPO', 'VALOR_ANTERIOR_MASCARADO', 'VALOR_NUEVO_MASCARADO', 'ACTOR_HUELLA',
  'DETALLE_SANITIZADO', 'CREADA_EN', 'ACTUALIZADA_EN'
];
var ENTREGAS_LEY2300_RETENCION_ENCABEZADOS = [
  'EJECUCION_ID', 'ACTOR_HUELLA', 'CONFIRMACION', 'CANDIDATAS_TERMINALES',
  'NO_TERMINALES_VENCIDAS', 'ENTREGAS_ELIMINADAS', 'EVENTOS_ELIMINADOS',
  'OPERACIONES_ELIMINADAS', 'EJECUTADA_EN'
];
var ENTREGAS_LEY2300_CIERRES_ENCABEZADOS = [
  'EJECUCION_ID', 'UUIDS_CERRADOS', 'ENTREGAS_ELIMINADAS', 'EVENTOS_ELIMINADOS',
  'OPERACIONES_ELIMINADAS', 'CERRADA_EN'
];
var ENTREGAS_LEY2300_CIERRES_PENDIENTES_ENCABEZADOS = [
  'LOTE_CIERRE_ID', 'UUID_SISTEMA', 'ENTREGA_IDS_JSON', 'ESTADO',
  'ENTREGAS_ESPERADAS', 'EVENTOS_ESPERADOS', 'OPERACIONES_ESPERADAS', 'CREADA_EN'
];

var ENTREGAS_LEY2300_TRANSICIONES = {
  PENDIENTE: ['EN_PROCESO'],
  LISTO_PARA_REINTENTO: ['EN_PROCESO', 'PENDIENTE_CONCILIACION'],
  EN_PROCESO: ['ENVIADO', 'LISTO_PARA_REINTENTO', 'PENDIENTE_CORRECCION', 'FALLIDO_DEFINITIVO', 'PENDIENTE_CONCILIACION'],
  PENDIENTE_CORRECCION: ['LISTO_PARA_REINTENTO', 'PENDIENTE_CONCILIACION'],
  ENVIADO: [],
  FALLIDO_DEFINITIVO: [],
  PENDIENTE_CONCILIACION: []
};

/**
 * Inicializa las tres hojas del dominio sin reemplazar datos existentes.
 * @returns {{entregasCreada:boolean,eventosCreada:boolean,operacionesCreada:boolean,retencionCreada:boolean,cierresCreada:boolean,cierresPendientesCreada:boolean}}
 */
function EntregasLey2300_bootstrap() {
  var libro = SpreadsheetRegistry_get(getHojaControlId());
  return {
    entregasCreada: _EntregasLey2300_asegurarHoja(libro, ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS),
    eventosCreada: _EntregasLey2300_asegurarHoja(libro, ENTREGAS_LEY2300_EVENTOS_HOJA, ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS),
    operacionesCreada: _EntregasLey2300_asegurarHoja(libro, OPERACIONES_LEY2300_HOJA, OPERACIONES_LEY2300_ENCABEZADOS),
    retencionCreada: _EntregasLey2300_asegurarHoja(libro, ENTREGAS_LEY2300_RETENCION_HOJA, ENTREGAS_LEY2300_RETENCION_ENCABEZADOS),
    cierresCreada: _EntregasLey2300_asegurarHoja(libro, ENTREGAS_LEY2300_CIERRES_HOJA, ENTREGAS_LEY2300_CIERRES_ENCABEZADOS),
    cierresPendientesCreada: _EntregasLey2300_asegurarHoja(libro, ENTREGAS_LEY2300_CIERRES_PENDIENTES_HOJA, ENTREGAS_LEY2300_CIERRES_PENDIENTES_ENCABEZADOS)
  };
}

/**
 * Crea una hoja vacía o valida que sus encabezados canónicos no hayan cambiado.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro Libro de control.
 * @param {string} nombre Nombre de la hoja.
 * @param {string[]} encabezados Esquema canónico.
 * @returns {boolean} true si la hoja fue creada.
 */
function _EntregasLey2300_asegurarHoja(libro, nombre, encabezados) {
  var hoja = libro.getSheetByName(nombre);
  if (!hoja) {
    hoja = libro.insertSheet(nombre);
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    hoja.setFrozenRows(1);
    return true;
  }
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    hoja.setFrozenRows(1);
    return false;
  }
  _EntregasLey2300_validarEncabezados(hoja, encabezados);
  return false;
}

/**
 * Comprueba el esquema sin corregirlo silenciosamente.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja Hoja a validar.
 * @param {string[]} esperados Encabezados canónicos.
 * @returns {void}
 * @throws {Error} Si el esquema existente es incompatible.
 */
function _EntregasLey2300_validarEncabezados(hoja, esperados) {
  var actuales = hoja.getRange(1, 1, 1, esperados.length).getValues()[0];
  for (var indice = 0; indice < esperados.length; indice++) {
    if (String(actuales[indice] || '').trim() !== esperados[indice]) {
      throw new Error('La hoja de entregas tiene un esquema incompatible.');
    }
  }
}

/**
 * Construye una clave estable y segura para una entrega.
 * @param {string} uuid Identidad inmutable de la solicitud.
 * @param {string} participante INQ o COA1..COA5.
 * @param {string} canal EMAIL o SMS.
 * @returns {string} Clave canónica o cadena vacía si los datos no son válidos.
 */
function EntregasLey2300_claveEntrega(uuid, participante, canal) {
  var uuidNormalizado = String(uuid || '').trim();
  var participanteNormalizado = String(participante || '').trim().toUpperCase();
  var canalNormalizado = String(canal || '').trim().toUpperCase();
  if (!uuidNormalizado || uuidNormalizado.length > 128 ||
      ENTREGAS_LEY2300_PARTICIPANTES.indexOf(participanteNormalizado) === -1 ||
      ENTREGAS_LEY2300_CANALES.indexOf(canalNormalizado) === -1) {
    return '';
  }
  return uuidNormalizado + '|' + participanteNormalizado + '|' + canalNormalizado;
}

/**
 * Normaliza un correo electrónico para identidad técnica.
 * @param {string} correo Correo de entrada.
 * @returns {string} Correo normalizado o vacío si no tiene un formato permitido.
 */
function normalizarCorreoLey2300(correo) {
  var normalizado = String(correo || '').trim().toLowerCase();
  if (normalizado.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) return '';
  return normalizado;
}

/**
 * Normaliza un celular colombiano al formato 573XXXXXXXXX.
 * @param {string|number} celular Celular de entrada.
 * @returns {string} Número normalizado o vacío si no es un celular colombiano válido.
 */
function normalizarCelularLey2300(celular) {
  var digitos = String(celular || '').replace(/[^0-9]/g, '');
  if (/^3\d{9}$/.test(digitos)) return '57' + digitos;
  if (/^573\d{9}$/.test(digitos)) return digitos;
  return '';
}

/**
 * Enmascara un correo o celular sin permitir recuperar el destino completo.
 * @param {string} destino Destino ya validado o normalizado.
 * @param {string} canal EMAIL o SMS.
 * @returns {string} Valor seguro para bitácoras y DTOs.
 */
function EntregasLey2300_enmascararDestino(destino, canal) {
  var tipo = String(canal || '').trim().toUpperCase();
  var valor = String(destino || '').trim();
  if (!valor) return '';
  if (tipo === 'EMAIL') {
    var correo = normalizarCorreoLey2300(valor);
    if (!correo) return '***';
    var partes = correo.split('@');
    return partes[0].charAt(0) + '***@' + partes[1].charAt(0) + '***';
  }
  if (tipo === 'SMS') {
    var celular = normalizarCelularLey2300(valor);
    if (!celular) return '***';
    return '******' + celular.slice(-4);
  }
  return '***';
}

/**
 * Genera una huella HMAC-SHA-256 para comparar valores sin guardarlos.
 * @param {string} destino Valor normalizado que se debe proteger.
 * @returns {string} Huella codificada en base64 web-safe o vacío para valores vacíos.
 */
function EntregasLey2300_huellaDestino(destino) {
  var valor = String(destino || '').trim();
  if (!valor) return '';
  var secreto = PropertiesService.getScriptProperties().getProperty('LEY2300_HMAC_SECRET');
  // La ausencia de secreto no debe bloquear el procesamiento ni degradar PII a texto.
  // En ese caso se conserva únicamente la máscara y se omite la huella correlacionable.
  if (typeof secreto !== 'string' || !secreto.trim()) return '';
  var bytes = Utilities.computeHmacSha256Signature(valor, secreto);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

/**
 * Determina si una transición de estado está permitida por la máquina de estados.
 * @param {string} estadoActual Estado persistido.
 * @param {string} estadoNuevo Estado solicitado.
 * @returns {boolean} true únicamente si la transición está permitida.
 */
function EntregasLey2300_esTransicionPermitida(estadoActual, estadoNuevo) {
  var origen = String(estadoActual || '').trim().toUpperCase();
  var destino = String(estadoNuevo || '').trim().toUpperCase();
  return !!ENTREGAS_LEY2300_TRANSICIONES[origen] &&
    ENTREGAS_LEY2300_TRANSICIONES[origen].indexOf(destino) !== -1;
}

/**
 * Crea una entrega una sola vez para la clave UUID/participante/canal.
 * @param {{uuid:string,idLote:string,solicitud:string,participante:string,canal:string,destino:string,maxIntentos?:number}} comando Datos de creación.
 * @returns {{creada:boolean,entrega:Object|null}} Entrega segura creada o existente.
 */
function EntregasLey2300_crearOReutilizar(comando) {
  _EntregasLey2300_validarClaves(comando, ['uuid', 'idLote', 'solicitud', 'participante', 'canal', 'destino', 'maxIntentos']);
  var clave = EntregasLey2300_claveEntrega(comando.uuid, comando.participante, comando.canal);
  var destino = _EntregasLey2300_normalizarDestino(comando.destino, comando.canal);
  if (!clave || !destino) throw new Error('Los datos de la entrega no son válidos.');

  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS);
  var existentes = _EntregasLey2300_buscarFilas(hoja, 'CLAVE_ENTREGA', clave);
  if (existentes.length > 0) return { creada: false, entrega: _EntregasLey2300_aDto(existentes[0].valores, existentes[0].mapa) };

  var ahora = new Date();
  var maxIntentos = _EntregasLey2300_maxIntentos(comando.maxIntentos);
  var fila = _EntregasLey2300_filaPorCampos(ENTREGAS_LEY2300_ENCABEZADOS, {
    ENTREGA_ID: _EntregasLey2300_generarId(), CLAVE_ENTREGA: clave,
    UUID_SISTEMA: String(comando.uuid).trim(), ID_LOTE: _EntregasLey2300_textoSeguro(comando.idLote, 128),
    SOLICITUD: _EntregasLey2300_textoSeguro(comando.solicitud, 128), PARTICIPANTE: String(comando.participante).trim().toUpperCase(),
    CANAL: String(comando.canal).trim().toUpperCase(), DESTINO_MASCARADO: EntregasLey2300_enmascararDestino(destino, comando.canal),
    HUELLA_DESTINO: EntregasLey2300_huellaDestino(destino), ESTADO: 'PENDIENTE', CAUSA_FALLO: '',
    CODIGO_RESULTADO: '', REFERENCIA_PROVEEDOR: '', INTENTOS: 0, MAX_INTENTOS: maxIntentos,
    PROXIMO_INTENTO_EN: '', INTENTO_ACTIVO_ID: '', EN_PROCESO_DESDE: '', VERSION: 1,
    CREADA_EN: ahora, ACTUALIZADA_EN: ahora, ENVIADA_EN: ''
  });
  hoja.appendRow(fila);
  var creada = _EntregasLey2300_aDto(fila, _EntregasLey2300_mapaEncabezados(ENTREGAS_LEY2300_ENCABEZADOS));
  EntregasLey2300_registrarEvento({ entregaId: creada.entregaId, uuid: creada.uuid, tipoEvento: 'CREADA', estadoNuevo: 'PENDIENTE', destinoMascarado: creada.destinoMascarado });
  return { creada: true, entrega: creada };
}

/**
 * Obtiene una entrega por su identificador opaco.
 * @param {string} entregaId Identificador de entrega.
 * @returns {Object|null} DTO seguro o null.
 */
function EntregasLey2300_obtenerPorId(entregaId) {
  var filas = _EntregasLey2300_buscarFilas(_EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS), 'ENTREGA_ID', String(entregaId || '').trim());
  return filas.length ? _EntregasLey2300_aDto(filas[0].valores, filas[0].mapa) : null;
}

/**
 * Obtiene las entregas asociadas a una solicitud identificada por UUID.
 * @param {string} uuid Identidad inmutable de solicitud.
 * @returns {Object[]} DTOs seguros ordenados por fecha de creación descendente.
 */
function EntregasLey2300_obtenerPorUuid(uuid) {
  var filas = _EntregasLey2300_buscarFilas(_EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS), 'UUID_SISTEMA', String(uuid || '').trim());
  var resultado = [];
  for (var indice = filas.length - 1; indice >= 0; indice--) resultado.push(_EntregasLey2300_aDto(filas[indice].valores, filas[indice].mapa));
  return resultado;
}

/**
 * Lista entregas filtradas con paginación, sin destinos ni huellas completos.
 * @param {{idLote?:string,solicitud?:string,participante?:string,canal?:string,estado?:string,causaFallo?:string,fechaDesde?:string,fechaHasta?:string,soloPendientes?:boolean}} filtros Filtros allowlisted.
 * @param {number} pagina Página 1-based.
 * @param {number} porPagina Tamaño de página entre 1 y 100.
 * @returns {{datos:Object[],total:number,pagina:number,totalPaginas:number}} Resultado paginado seguro.
 */
function EntregasLey2300_listar(filtros, pagina, porPagina) {
  var criterios = _EntregasLey2300_normalizarFiltros(filtros || {});
  var paginaSegura = Math.max(1, parseInt(pagina, 10) || 1);
  var limite = Math.min(ENTREGAS_LEY2300_MAX_POR_PAGINA, Math.max(1, parseInt(porPagina, 10) || 20));
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS);
  if (hoja.getLastRow() < 2) return { datos: [], total: 0, pagina: paginaSegura, totalPaginas: 0 };
  var mapa = _EntregasLey2300_mapaEncabezados(ENTREGAS_LEY2300_ENCABEZADOS);
  var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, ENTREGAS_LEY2300_ENCABEZADOS.length).getValues();
  var resultado = [];
  for (var indice = datos.length - 1; indice >= 0; indice--) {
    if (_EntregasLey2300_coincide(datos[indice], mapa, criterios)) resultado.push(_EntregasLey2300_aDto(datos[indice], mapa));
  }
  var total = resultado.length;
  return { datos: resultado.slice((paginaSegura - 1) * limite, paginaSegura * limite), total: total, pagina: paginaSegura, totalPaginas: Math.ceil(total / limite) };
}

/**
 * Registra un evento inmutable sin almacenar el destino original ni datos de contacto.
 * @param {{entregaId:string,uuid:string,tipoEvento:string,estadoAnterior?:string,estadoNuevo?:string,causaFallo?:string,codigoResultado?:string,referenciaProveedor?:string,destinoMascarado?:string,actor?:string,detalle?:string}} evento Evento sanitizado.
 * @returns {{eventoId:string}} Identificador del evento creado.
 */
function EntregasLey2300_registrarEvento(evento) {
  _EntregasLey2300_validarClaves(evento, ['entregaId', 'uuid', 'tipoEvento', 'estadoAnterior', 'estadoNuevo', 'causaFallo', 'codigoResultado', 'referenciaProveedor', 'destinoMascarado', 'actor', 'detalle']);
  _EntregasLey2300_validarEvento(evento);
  var eventoId = _EntregasLey2300_generarId();
  _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_EVENTOS_HOJA, ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS).appendRow(
    _EntregasLey2300_filaPorCampos(ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS, {
      EVENTO_ID: eventoId, ENTREGA_ID: _EntregasLey2300_textoSeguro(evento.entregaId, 128), UUID_SISTEMA: _EntregasLey2300_textoSeguro(evento.uuid, 128),
      TIPO_EVENTO: _EntregasLey2300_textoSeguro(evento.tipoEvento, 64), ESTADO_ANTERIOR: _EntregasLey2300_estadoOBlanco(evento.estadoAnterior),
      ESTADO_NUEVO: _EntregasLey2300_estadoOBlanco(evento.estadoNuevo), CAUSA_FALLO: _EntregasLey2300_causaOBlanco(evento.causaFallo),
      CODIGO_RESULTADO: _EntregasLey2300_textoSeguro(evento.codigoResultado, 64), REFERENCIA_PROVEEDOR: _EntregasLey2300_textoSeguro(evento.referenciaProveedor, 256),
      DESTINO_MASCARADO: _EntregasLey2300_textoSeguro(evento.destinoMascarado, 64), ACTOR_HUELLA: EntregasLey2300_huellaDestino(String(evento.actor || '').trim()),
      DETALLE_SANITIZADO: _EntregasLey2300_sanitizarDetalle(evento.detalle), CREADO_EN: new Date()
    })
  );
  return { eventoId: eventoId };
}

/**
 * Registra una operación de conciliación sin persistir contactos completos.
 * @param {{entregaId:string,uuid:string,tipoOperacion:string,estado:string,campo?:string,valorAnteriorMascarado?:string,valorNuevoMascarado?:string,actor?:string,detalle?:string}} operacion Operación segura.
 * @returns {{operacionId:string}} Identificador de la operación creada.
 */
function OperacionesLey2300_registrarConciliacion(operacion) {
  _EntregasLey2300_validarClaves(operacion, ['entregaId', 'uuid', 'tipoOperacion', 'estado', 'campo', 'valorAnteriorMascarado', 'valorNuevoMascarado', 'actor', 'detalle']);
  var estado = String(operacion.estado || '').trim().toUpperCase();
  if (!operacion || !String(operacion.entregaId || '').trim() || !String(operacion.uuid || '').trim() ||
      !String(operacion.tipoOperacion || '').trim() || OPERACIONES_LEY2300_ESTADOS.indexOf(estado) === -1) {
    throw new Error('La operación de conciliación no es válida.');
  }
  var operacionId = _EntregasLey2300_generarId();
  var ahora = new Date();
  _EntregasLey2300_obtenerHoja(OPERACIONES_LEY2300_HOJA, OPERACIONES_LEY2300_ENCABEZADOS).appendRow(
    _EntregasLey2300_filaPorCampos(OPERACIONES_LEY2300_ENCABEZADOS, {
      OPERACION_ID: operacionId, ENTREGA_ID: _EntregasLey2300_textoSeguro(operacion.entregaId, 128), UUID_SISTEMA: _EntregasLey2300_textoSeguro(operacion.uuid, 128),
      TIPO_OPERACION: _EntregasLey2300_textoSeguro(operacion.tipoOperacion, 64), ESTADO: estado, CAMPO: _EntregasLey2300_textoSeguro(operacion.campo, 32),
      VALOR_ANTERIOR_MASCARADO: _EntregasLey2300_textoSeguro(operacion.valorAnteriorMascarado, 64), VALOR_NUEVO_MASCARADO: _EntregasLey2300_textoSeguro(operacion.valorNuevoMascarado, 64),
      ACTOR_HUELLA: EntregasLey2300_huellaDestino(String(operacion.actor || '').trim()), DETALLE_SANITIZADO: _EntregasLey2300_sanitizarDetalle(operacion.detalle),
      CREADA_EN: ahora, ACTUALIZADA_EN: ahora
    })
  );
  return { operacionId: operacionId };
}

/**
 * Actualiza un estado esperado y deja el evento append-only correspondiente.
 * @param {{entregaId:string,versionEsperada:number,estadoNuevo:string,causaFallo?:string,codigoResultado?:string,referenciaProveedor?:string,proximoIntentoEn?:Date|string,actor?:string,detalle?:string}} comando Cambio controlado.
 * @returns {{ok:boolean,entrega:Object|null}} Resultado sin PII.
 */
function EntregasLey2300_actualizarEstado(comando) {
  _EntregasLey2300_validarClaves(comando, ['entregaId', 'versionEsperada', 'estadoNuevo', 'causaFallo', 'codigoResultado', 'referenciaProveedor', 'proximoIntentoEn', 'actor', 'detalle']);
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS);
  var filas = _EntregasLey2300_buscarFilas(hoja, 'ENTREGA_ID', String(comando.entregaId || '').trim());
  if (!filas.length) return { ok: false, entrega: null };
  var encontrada = filas[0];
  var dto = _EntregasLey2300_aDto(encontrada.valores, encontrada.mapa);
  var destino = String(comando.estadoNuevo || '').trim().toUpperCase();
  if (!EntregasLey2300_esTransicionPermitida(dto.estado, destino) || Number(comando.versionEsperada) !== dto.version ||
      !_EntregasLey2300_esCausaValida(comando.causaFallo)) return { ok: false, entrega: dto };

  var ahora = new Date();
  var cambios = { ESTADO: destino, CAUSA_FALLO: _EntregasLey2300_causaOBlanco(comando.causaFallo), CODIGO_RESULTADO: _EntregasLey2300_textoSeguro(comando.codigoResultado, 64),
    REFERENCIA_PROVEEDOR: _EntregasLey2300_textoSeguro(comando.referenciaProveedor, 256), PROXIMO_INTENTO_EN: comando.proximoIntentoEn || '',
    VERSION: dto.version + 1, ACTUALIZADA_EN: ahora };
  if (destino === 'EN_PROCESO') { cambios.INTENTOS = dto.intentos + 1; cambios.INTENTO_ACTIVO_ID = _EntregasLey2300_generarId(); cambios.EN_PROCESO_DESDE = ahora; }
  if (destino === 'ENVIADO') cambios.ENVIADA_EN = ahora;
  _EntregasLey2300_escribirFilaVerificable(hoja, encontrada.fila, encontrada.valores, encontrada.mapa, cambios);
  var actualizada = EntregasLey2300_obtenerPorId(dto.entregaId);
  EntregasLey2300_registrarEvento({ entregaId: dto.entregaId, uuid: dto.uuid, tipoEvento: 'ESTADO_ACTUALIZADO', estadoAnterior: dto.estado, estadoNuevo: destino,
    causaFallo: cambios.CAUSA_FALLO, codigoResultado: cambios.CODIGO_RESULTADO, referenciaProveedor: cambios.REFERENCIA_PROVEEDOR,
    destinoMascarado: dto.destinoMascarado, actor: comando.actor, detalle: comando.detalle });
  return { ok: true, entrega: actualizada };
}

/** @param {string} nombre Nombre de hoja. @param {string[]} encabezados Esquema. @returns {GoogleAppsScript.Spreadsheet.Sheet} Hoja validada. */
function _EntregasLey2300_obtenerHoja(nombre, encabezados) {
  EntregasLey2300_bootstrap();
  var hoja = SpreadsheetRegistry_get(getHojaControlId()).getSheetByName(nombre);
  _EntregasLey2300_validarEncabezados(hoja, encabezados);
  return hoja;
}

/** @param {GoogleAppsScript.Spreadsheet.Sheet} hoja Hoja. @param {string} campo Header. @param {string} valor Valor. @returns {Array<{fila:number,valores:Array,mapa:Object}>} Filas encontradas. */
function _EntregasLey2300_buscarFilas(hoja, campo, valor) {
  if (!valor || hoja.getLastRow() < 2) return [];
  var mapa = _EntregasLey2300_mapaEncabezados(ENTREGAS_LEY2300_ENCABEZADOS);
  var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, ENTREGAS_LEY2300_ENCABEZADOS.length).getValues();
  var resultado = [];
  for (var indice = 0; indice < datos.length; indice++) {
    if (String(datos[indice][mapa[campo]] || '').trim() === valor) resultado.push({ fila: indice + 2, valores: datos[indice], mapa: mapa });
  }
  return resultado;
}

/** @param {string[]} encabezados Headers. @returns {Object<string,number>} Mapa 0-based. */
function _EntregasLey2300_mapaEncabezados(encabezados) {
  var mapa = {};
  for (var indice = 0; indice < encabezados.length; indice++) mapa[encabezados[indice]] = indice;
  return mapa;
}

/** @param {string[]} encabezados Headers. @param {Object} valores Valores por nombre. @returns {Array} Fila ordenada. */
function _EntregasLey2300_filaPorCampos(encabezados, valores) {
  var fila = [];
  for (var indice = 0; indice < encabezados.length; indice++) fila.push(valores[encabezados[indice]] === undefined ? '' : valores[encabezados[indice]]);
  return fila;
}

/** @param {Array} fila Fila fuente. @param {Object<string,number>} mapa Mapa headers. @returns {Object} DTO enmascarado. */
function _EntregasLey2300_aDto(fila, mapa) {
  return {
    entregaId: String(fila[mapa.ENTREGA_ID] || ''), uuid: String(fila[mapa.UUID_SISTEMA] || ''), idLote: String(fila[mapa.ID_LOTE] || ''),
    solicitud: String(fila[mapa.SOLICITUD] || ''), participante: String(fila[mapa.PARTICIPANTE] || ''), canal: String(fila[mapa.CANAL] || ''),
    destinoMascarado: String(fila[mapa.DESTINO_MASCARADO] || ''), estado: String(fila[mapa.ESTADO] || ''), causaFallo: String(fila[mapa.CAUSA_FALLO] || ''),
    codigoResultado: String(fila[mapa.CODIGO_RESULTADO] || ''), referenciaProveedor: String(fila[mapa.REFERENCIA_PROVEEDOR] || ''),
    intentos: Number(fila[mapa.INTENTOS]) || 0, maxIntentos: Number(fila[mapa.MAX_INTENTOS]) || 0, proximoIntentoEn: _EntregasLey2300_fechaDto(fila[mapa.PROXIMO_INTENTO_EN]),
    version: Number(fila[mapa.VERSION]) || 0, creadaEn: _EntregasLey2300_fechaDto(fila[mapa.CREADA_EN]), actualizadaEn: _EntregasLey2300_fechaDto(fila[mapa.ACTUALIZADA_EN]), enviadaEn: _EntregasLey2300_fechaDto(fila[mapa.ENVIADA_EN])
  };
}

/** @param {Object} filtros Filtros entrantes. @returns {Object} Filtros validados. */
function _EntregasLey2300_normalizarFiltros(filtros) {
  _EntregasLey2300_validarClaves(filtros, ['idLote', 'solicitud', 'participante', 'canal', 'estado', 'causaFallo', 'fechaDesde', 'fechaHasta', 'soloPendientes']);
  var criterios = {
    idLote: _EntregasLey2300_textoSeguro(filtros.idLote, 128), solicitud: _EntregasLey2300_textoSeguro(filtros.solicitud, 128),
    participante: String(filtros.participante || '').trim().toUpperCase(), canal: String(filtros.canal || '').trim().toUpperCase(),
    estado: String(filtros.estado || '').trim().toUpperCase(), causaFallo: String(filtros.causaFallo || '').trim().toUpperCase(),
    fechaDesde: _EntregasLey2300_fechaFiltro(filtros.fechaDesde, false), fechaHasta: _EntregasLey2300_fechaFiltro(filtros.fechaHasta, true),
    soloPendientes: _EntregasLey2300_normalizarSoloPendientes(filtros.soloPendientes)
  };
  if (criterios.participante && ENTREGAS_LEY2300_PARTICIPANTES.indexOf(criterios.participante) === -1) throw new Error('El filtro no es válido.');
  if (criterios.canal && ENTREGAS_LEY2300_CANALES.indexOf(criterios.canal) === -1) throw new Error('El filtro no es válido.');
  if (criterios.estado && ENTREGAS_LEY2300_ESTADOS.indexOf(criterios.estado) === -1) throw new Error('El filtro no es válido.');
  if (criterios.causaFallo && ENTREGAS_LEY2300_CAUSAS.indexOf(criterios.causaFallo) === -1) throw new Error('El filtro no es válido.');
  if (criterios.fechaDesde && criterios.fechaHasta && criterios.fechaDesde.getTime() > criterios.fechaHasta.getTime()) throw new Error('El rango de fechas no es válido.');
  return criterios;
}

/** @param {*} valor Selector explícito de bandeja. @returns {boolean} true para trabajo accionable. */
function _EntregasLey2300_normalizarSoloPendientes(valor) {
  if (valor === undefined) return true;
  if (typeof valor !== 'boolean') throw new Error('El filtro no es válido.');
  return valor;
}

/** @param {*} valor Fecha ISO yyyy-mm-dd. @param {boolean} fin True para fin del día. @returns {Date|null} Fecha UTC validada. */
function _EntregasLey2300_fechaFiltro(valor, fin) {
  if (!valor) return null;
  var texto = String(valor).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) throw new Error('El filtro no es válido.');
  var fecha = new Date(texto + (fin ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
  if (isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) throw new Error('El filtro no es válido.');
  return fecha;
}

/** @param {Array} fila Fila. @param {Object<string,number>} mapa Mapa. @param {Object} criterios Criterios. @returns {boolean} Coincidencia. */
function _EntregasLey2300_coincide(fila, mapa, criterios) {
  var creadaEn = fila[mapa.CREADA_EN] instanceof Date ? fila[mapa.CREADA_EN] : new Date(fila[mapa.CREADA_EN]);
  var fechaValida = !isNaN(creadaEn.getTime());
  var estado = String(fila[mapa.ESTADO] || '').trim();
  return (!criterios.soloPendientes || ENTREGAS_LEY2300_ESTADOS_PENDIENTES.indexOf(estado) !== -1) &&
    (!criterios.idLote || String(fila[mapa.ID_LOTE] || '').trim() === criterios.idLote) &&
    (!criterios.solicitud || String(fila[mapa.SOLICITUD] || '').trim() === criterios.solicitud) &&
    (!criterios.participante || String(fila[mapa.PARTICIPANTE] || '').trim() === criterios.participante) &&
    (!criterios.canal || String(fila[mapa.CANAL] || '').trim() === criterios.canal) &&
    (!criterios.estado || estado === criterios.estado) &&
    (!criterios.causaFallo || String(fila[mapa.CAUSA_FALLO] || '').trim() === criterios.causaFallo) &&
    (!criterios.fechaDesde || (fechaValida && creadaEn.getTime() >= criterios.fechaDesde.getTime())) &&
    (!criterios.fechaHasta || (fechaValida && creadaEn.getTime() <= criterios.fechaHasta.getTime()));
}

/** @param {GoogleAppsScript.Spreadsheet.Sheet} hoja Hoja. @param {number} fila Fila 1-based. @param {Object<string,number>} mapa Mapa. @param {Object} cambios Valores. @returns {void} */
function _EntregasLey2300_actualizarCampos(hoja, fila, mapa, cambios) {
  for (var campo in cambios) hoja.getRange(fila, mapa[campo] + 1).setValue(cambios[campo]);
}

/**
 * Escribe toda la fila de entrega en una sola operación y confirma la versión/estado resultantes.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja Hoja del ledger.
 * @param {number} fila Numero de fila 1-based.
 * @param {Array} valores Valores actuales de la fila.
 * @param {Object<string,number>} mapa Mapa de encabezados.
 * @param {Object} cambios Campos que deben reemplazarse.
 * @returns {Array} Fila persistida y verificada.
 */
function _EntregasLey2300_escribirFilaVerificable(hoja, fila, valores, mapa, cambios) {
  var siguiente = valores.slice();
  for (var campo in cambios) siguiente[mapa[campo]] = cambios[campo];
  hoja.getRange(fila, 1, 1, ENTREGAS_LEY2300_ENCABEZADOS.length).setValues([siguiente]);
  var verificada = hoja.getRange(fila, 1, 1, ENTREGAS_LEY2300_ENCABEZADOS.length).getValues()[0];
  for (var nombre in cambios) {
    if (!_EntregasLey2300_valorCoincide(verificada[mapa[nombre]], cambios[nombre])) throw new Error('No fue posible verificar la fila de entrega.');
  }
  return verificada;
}

/** @param {*} actual Valor releído. @param {*} esperado Valor persistido. @returns {boolean} true si son equivalentes. */
function _EntregasLey2300_valorCoincide(actual, esperado) {
  if (actual instanceof Date && esperado instanceof Date) return actual.getTime() === esperado.getTime();
  return String(actual === undefined || actual === null ? '' : actual) === String(esperado === undefined || esperado === null ? '' : esperado);
}

/** @param {Object} evento Evento. @returns {void} */
function _EntregasLey2300_validarEvento(evento) {
  if (!evento || !String(evento.entregaId || '').trim() || !String(evento.uuid || '').trim() || !/^[A-Z0-9_]{3,64}$/.test(String(evento.tipoEvento || '').trim().toUpperCase()) ||
      !_EntregasLey2300_esEstadoOBlanco(evento.estadoAnterior) || !_EntregasLey2300_esEstadoOBlanco(evento.estadoNuevo) || !_EntregasLey2300_esCausaValida(evento.causaFallo)) {
    throw new Error('El evento no es válido.');
  }
}

/** @param {Object} objeto Objeto. @param {string[]} permitidas Claves permitidas. @returns {void} */
function _EntregasLey2300_validarClaves(objeto, permitidas) {
  if (!objeto || Object.prototype.toString.call(objeto) !== '[object Object]') throw new Error('La solicitud no es válida.');
  var claves = Object.keys(objeto);
  for (var indice = 0; indice < claves.length; indice++) if (permitidas.indexOf(claves[indice]) === -1) throw new Error('La solicitud no es válida.');
}

/** @param {string} destino Destino. @param {string} canal Canal. @returns {string} Destino normalizado. */
function _EntregasLey2300_normalizarDestino(destino, canal) {
  var tipo = String(canal || '').trim().toUpperCase();
  return tipo === 'EMAIL' ? normalizarCorreoLey2300(destino) : tipo === 'SMS' ? normalizarCelularLey2300(destino) : '';
}

/** @param {number} valor Máximo solicitado. @returns {number} Máximo seguro. */
function _EntregasLey2300_maxIntentos(valor) {
  if (valor === undefined || valor === null || valor === '') return ENTREGAS_LEY2300_MAX_INTENTOS_DEFAULT;
  var numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > 10) throw new Error('El máximo de intentos no es válido.');
  return numero;
}

/** @returns {string} Identificador opaco. */
function _EntregasLey2300_generarId() {
  return Utilities.getUuid();
}

/** @param {string} valor Texto. @param {number} maximo Máximo. @returns {string} Texto seguro. */
function _EntregasLey2300_textoSeguro(valor, maximo) {
  return String(valor || '').trim().slice(0, maximo);
}

/** @param {string} causa Causa. @returns {boolean} true si está vacía o allowlisted. */
function _EntregasLey2300_esCausaValida(causa) {
  var valor = String(causa || '').trim().toUpperCase();
  return !valor || ENTREGAS_LEY2300_CAUSAS.indexOf(valor) !== -1;
}

/** @param {string} estado Estado. @returns {boolean} true si está vacío o allowlisted. */
function _EntregasLey2300_esEstadoOBlanco(estado) {
  var valor = String(estado || '').trim().toUpperCase();
  return !valor || ENTREGAS_LEY2300_ESTADOS.indexOf(valor) !== -1;
}

/** @param {string} estado Estado. @returns {string} Estado allowlisted o vacío. */
function _EntregasLey2300_estadoOBlanco(estado) {
  return _EntregasLey2300_esEstadoOBlanco(estado) ? String(estado || '').trim().toUpperCase() : '';
}

/** @param {string} causa Causa. @returns {string} Causa allowlisted o vacío. */
function _EntregasLey2300_causaOBlanco(causa) {
  return _EntregasLey2300_esCausaValida(causa) ? String(causa || '').trim().toUpperCase() : '';
}

/** @param {string} detalle Detalle técnico. @returns {string} Detalle redaccionado. */
function _EntregasLey2300_sanitizarDetalle(detalle) {
  return _EntregasLey2300_textoSeguro(detalle, 240)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTADO]')
    .replace(/\d{7,}/g, '[REDACTADO]');
}

/** @param {Date|string} valor Fecha. @returns {string} Fecha ISO o vacío. */
function _EntregasLey2300_fechaDto(valor) {
  if (!(valor instanceof Date) || isNaN(valor.getTime())) return '';
  return valor.toISOString();
}
/**
 * Migra una entrega histórica con marca Parcial a conciliación sin reclamarla
 * ni consumir un intento. Solo el trigger usa este paso de transición inicial.
 * @param {{entregaId:string,uuid:string,estado:string,version:number,destinoMascarado:string}} entrega DTO persistido.
 * @returns {{ok:boolean,entrega:Object|null}} Resultado seguro de la migración.
 */
function EntregasLey2300_migrarParcial(entrega) {
  if (!entrega || entrega.estado !== 'PENDIENTE' || !entrega.entregaId || !entrega.uuid) return { ok: false, entrega: null };
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS);
  var filas = _EntregasLey2300_buscarFilas(hoja, 'ENTREGA_ID', String(entrega.entregaId));
  if (!filas.length) return { ok: false, entrega: null };
  var actual = _EntregasLey2300_aDto(filas[0].valores, filas[0].mapa);
  if (actual.estado !== 'PENDIENTE' || actual.version !== entrega.version) return { ok: false, entrega: actual };
  _EntregasLey2300_actualizarCampos(hoja, filas[0].fila, filas[0].mapa, {
    ESTADO: 'PENDIENTE_CONCILIACION', CAUSA_FALLO: 'AMBIGUO', VERSION: actual.version + 1, ACTUALIZADA_EN: new Date()
  });
  var actualizada = EntregasLey2300_obtenerPorId(actual.entregaId);
  EntregasLey2300_registrarEvento({ entregaId: actual.entregaId, uuid: actual.uuid, tipoEvento: 'MIGRACION_PARCIAL', estadoAnterior: 'PENDIENTE', estadoNuevo: 'PENDIENTE_CONCILIACION', causaFallo: 'AMBIGUO', destinoMascarado: actual.destinoMascarado, detalle: 'MIGRACION_HISTORICA' });
  return { ok: true, entrega: actualizada };
}
/**
 * Corrige un contacto en los dos libros de origen y habilita el reintento solo
 * cuando ambas escrituras fueron verificadas. El actor se recibe únicamente desde
 * una capa de confianza del servidor; no forma parte del comando de cliente.
 * @param {{entregaId:string,versionEsperada:number,contacto:string}} comando Solicitud estricta de corrección.
 * @param {string} actor Identidad confiable y no expuesta del administrador.
 * @returns {{ok:boolean,mensaje:string,entrega:Object|null}} Resultado seguro, sin contacto completo.
 */
function EntregasLey2300_corregirContacto(comando, actor) {
  _EntregasLey2300_validarComandoCorreccion(comando, actor);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, mensaje: 'No fue posible procesar la corrección.', entrega: null };

  try {
    return _EntregasLey2300_ejecutarCorreccionConLock(comando, actor);
  } finally {
    lock.releaseLock();
  }
}

/** @param {Object} comando Solicitud cliente. @param {string} actor Identidad interna. @returns {void} */
function _EntregasLey2300_validarComandoCorreccion(comando, actor) {
  _EntregasLey2300_validarClaves(comando, ['entregaId', 'versionEsperada', 'contacto']);
  if (typeof comando.entregaId !== 'string' || !comando.entregaId.trim() || comando.entregaId.trim().length > 128 ||
      !Number.isInteger(comando.versionEsperada) || comando.versionEsperada < 1 || comando.versionEsperada > 1000000 ||
      typeof comando.contacto !== 'string' || !comando.contacto.trim() || comando.contacto.trim().length > 254 ||
      typeof actor !== 'string' || !actor.trim() || actor.trim().length > 128) {
    throw new Error('La solicitud no es válida.');
  }
}

/** @param {Object} comando Solicitud validada. @param {string} actor Identidad interna. @returns {{ok:boolean,mensaje:string,entrega:Object|null}} Resultado seguro. */
function _EntregasLey2300_ejecutarCorreccionConLock(comando, actor) {
  var encontrada = _EntregasLey2300_obtenerEntregaParaCorreccion(comando);
  if (!encontrada) return { ok: false, mensaje: 'No fue posible procesar la corrección.', entrega: null };

  var entrega = encontrada.entrega;
  var campo = _EntregasLey2300_campoContacto(entrega.participante, entrega.canal);
  var contacto = _EntregasLey2300_normalizarDestino(comando.contacto, entrega.canal);
  if (!campo || !contacto) throw new Error('La solicitud no es válida.');

  var anteriorMascarado = EntregasLey2300_enmascararDestino('', entrega.canal);
  var nuevoMascarado = EntregasLey2300_enmascararDestino(contacto, entrega.canal);
  var operacion = OperacionesLey2300_registrarConciliacion({
    entregaId: entrega.entregaId, uuid: entrega.uuid, tipoOperacion: 'CORRECCION_CONTACTO', estado: 'PREPARADA',
    campo: campo, valorAnteriorMascarado: anteriorMascarado, valorNuevoMascarado: nuevoMascarado, actor: actor, detalle: 'CORRECCION_PREPARADA'
  });

  try {
    var fuentes = _EntregasLey2300_resolverFuentesContacto(entrega.uuid, campo);
    anteriorMascarado = EntregasLey2300_enmascararDestino(fuentes.control.valor, entrega.canal);
    _EntregasLey2300_actualizarOperacion(operacion.operacionId, 'PREPARADA', anteriorMascarado, nuevoMascarado, 'FUENTES_RESUELTAS');
    _EntregasLey2300_escribirYVerificarContacto(fuentes.control, contacto);
    _EntregasLey2300_actualizarOperacion(operacion.operacionId, 'CONTROL_APLICADO', anteriorMascarado, nuevoMascarado, 'CONTROL_VERIFICADO');
    _EntregasLey2300_escribirYVerificarContacto(fuentes.analisis, contacto);
    _EntregasLey2300_actualizarOperacion(operacion.operacionId, 'ANALISIS_APLICADO', anteriorMascarado, nuevoMascarado, 'ANALISIS_VERIFICADO');

    var actualizada = _EntregasLey2300_habilitarReintento(entrega, contacto);
    if (!actualizada) throw new Error('No se pudo actualizar la entrega.');
    _EntregasLey2300_actualizarOperacion(operacion.operacionId, 'COMPLETA', anteriorMascarado, nuevoMascarado, 'CORRECCION_COMPLETA');
    EntregasLey2300_registrarEvento({
      entregaId: entrega.entregaId, uuid: entrega.uuid, tipoEvento: 'CONTACTO_CORREGIDO', estadoAnterior: 'PENDIENTE_CORRECCION',
      estadoNuevo: 'LISTO_PARA_REINTENTO', destinoMascarado: nuevoMascarado, actor: actor, detalle: 'CORRECCION_COORDINADA'
    });
    _EntregasLey2300_invalidarCachesCorreccion(entrega);
    return { ok: true, mensaje: 'La corrección fue aplicada.', entrega: actualizada };
  } catch (error) {
    return _EntregasLey2300_marcarConciliacionCorreccion(operacion.operacionId, encontrada, entrega, anteriorMascarado, nuevoMascarado, actor, error);
  }
}

/** @param {Object} comando Solicitud validada. @returns {{fila:number,valores:Array,mapa:Object,entrega:Object}|null} Entrega bloqueada para corrección. */
function _EntregasLey2300_obtenerEntregaParaCorreccion(comando) {
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS);
  var filas = _EntregasLey2300_buscarFilas(hoja, 'ENTREGA_ID', comando.entregaId.trim());
  if (filas.length !== 1) return null;
  var entrega = _EntregasLey2300_aDto(filas[0].valores, filas[0].mapa);
  if (entrega.estado !== 'PENDIENTE_CORRECCION' || entrega.version !== comando.versionEsperada ||
      ENTREGAS_LEY2300_PARTICIPANTES.indexOf(entrega.participante) === -1 || ENTREGAS_LEY2300_CANALES.indexOf(entrega.canal) === -1) return null;
  return { fila: filas[0].fila, valores: filas[0].valores, mapa: filas[0].mapa, entrega: entrega };
}

/** @param {string} participante Participante persistido. @param {string} canal Canal persistido. @returns {string} Encabezado permitido o vacío. */
function _EntregasLey2300_campoContacto(participante, canal) {
  var persona = String(participante || '').trim().toUpperCase();
  var tipo = String(canal || '').trim().toUpperCase();
  if (ENTREGAS_LEY2300_PARTICIPANTES.indexOf(persona) === -1) return '';
  if (tipo === 'EMAIL') return 'CORREO_' + persona;
  if (tipo === 'SMS') return 'TEL_' + persona;
  return '';
}

/** @param {string} uuid UUID confiable de la entrega. @param {string} campo Contacto derivado. @returns {{control:Object,analisis:Object}} Filas con encabezados verificados. */
function _EntregasLey2300_resolverFuentesContacto(uuid, campo) {
  var control = SpreadsheetRegistry_get(getHojaControlId()).getSheetByName('Control_General');
  var analisis = SpreadsheetRegistry_get(getArchivoAnalisisId()).getSheetByName('registro analisis');
  return {
    control: _EntregasLey2300_buscarFuenteContacto(control, uuid, campo),
    analisis: _EntregasLey2300_buscarFuenteContacto(analisis, uuid, campo)
  };
}

/** @param {GoogleAppsScript.Spreadsheet.Sheet} hoja Hoja fuente. @param {string} uuid UUID confiable. @param {string} campo Campo permitido. @returns {{hoja:Object,fila:number,columna:number,valor:*}} Ubicación validada. */
function _EntregasLey2300_buscarFuenteContacto(hoja, uuid, campo) {
  if (!hoja || hoja.getLastRow() < 2) throw new Error('Fuente de contacto no disponible.');
  var datos = hoja.getDataRange().getValues();
  var mapa = _EntregasLey2300_mapaEncabezados(datos[0]);
  if (mapa.UUID_SISTEMA === undefined || mapa[campo] === undefined) throw new Error('Esquema de contacto incompatible.');
  var encontrada = null;
  for (var indice = 1; indice < datos.length; indice++) {
    if (String(datos[indice][mapa.UUID_SISTEMA] || '').trim() !== uuid) continue;
    if (encontrada) throw new Error('UUID de contacto duplicado.');
    encontrada = { hoja: hoja, fila: indice + 1, columna: mapa[campo] + 1, valor: datos[indice][mapa[campo]] };
  }
  if (!encontrada) throw new Error('UUID de contacto no encontrado.');
  return encontrada;
}

/** @param {{hoja:Object,fila:number,columna:number,valor:*}} fuente Campo fuente. @param {string} contacto Contacto normalizado. @returns {void} */
function _EntregasLey2300_escribirYVerificarContacto(fuente, contacto) {
  var rango = fuente.hoja.getRange(fuente.fila, fuente.columna);
  rango.setValue(contacto);
  if (String(rango.getValue() || '').trim() !== contacto) throw new Error('No fue posible verificar el contacto.');
}

/** @param {string} operacionId Identificador opaco. @param {string} estado Estado de saga. @param {string} anterior Máscara anterior. @param {string} nuevo Máscara nueva. @param {string} detalle Detalle sin PII. @returns {void} */
function _EntregasLey2300_actualizarOperacion(operacionId, estado, anterior, nuevo, detalle) {
  var hoja = _EntregasLey2300_obtenerHoja(OPERACIONES_LEY2300_HOJA, OPERACIONES_LEY2300_ENCABEZADOS);
  var mapa = _EntregasLey2300_mapaEncabezados(OPERACIONES_LEY2300_ENCABEZADOS);
  var filas = _EntregasLey2300_buscarFilasGenericas(hoja, mapa, 'OPERACION_ID', operacionId);
  if (filas.length !== 1 || OPERACIONES_LEY2300_ESTADOS.indexOf(estado) === -1) throw new Error('No se pudo actualizar la operación.');
  _EntregasLey2300_actualizarCampos(hoja, filas[0].fila, mapa, {
    ESTADO: estado, VALOR_ANTERIOR_MASCARADO: anterior, VALOR_NUEVO_MASCARADO: nuevo,
    DETALLE_SANITIZADO: _EntregasLey2300_sanitizarDetalle(detalle), ACTUALIZADA_EN: new Date()
  });
}

/** @param {GoogleAppsScript.Spreadsheet.Sheet} hoja Hoja. @param {Object} mapa Mapa de encabezados. @param {string} campo Columna requerida. @param {string} valor Valor exacto. @returns {Array<{fila:number,valores:Array}>} Filas coincidentes. */
function _EntregasLey2300_buscarFilasGenericas(hoja, mapa, campo, valor) {
  if (mapa[campo] === undefined || hoja.getLastRow() < 2) return [];
  var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, Object.keys(mapa).length).getValues();
  var filas = [];
  for (var indice = 0; indice < datos.length; indice++) {
    if (String(datos[indice][mapa[campo]] || '').trim() === String(valor || '').trim()) filas.push({ fila: indice + 2, valores: datos[indice] });
  }
  return filas;
}

/** @param {Object} entrega DTO anterior. @param {string} contacto Contacto normalizado. @returns {Object|null} Entrega actualizada o null. */
function _EntregasLey2300_habilitarReintento(entrega, contacto) {
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS);
  var actual = _EntregasLey2300_obtenerEntregaParaCorreccion({ entregaId: entrega.entregaId, versionEsperada: entrega.version });
  if (!actual) return null;
  var cambios = {
    DESTINO_MASCARADO: EntregasLey2300_enmascararDestino(contacto, entrega.canal), HUELLA_DESTINO: EntregasLey2300_huellaDestino(contacto),
    ESTADO: 'LISTO_PARA_REINTENTO', CAUSA_FALLO: '', CODIGO_RESULTADO: '', REFERENCIA_PROVEEDOR: '', PROXIMO_INTENTO_EN: '',
    VERSION: entrega.version + 1, ACTUALIZADA_EN: new Date()
  };
  _EntregasLey2300_escribirFilaVerificable(hoja, actual.fila, actual.valores, actual.mapa, cambios);
  var verificada = EntregasLey2300_obtenerPorId(entrega.entregaId);
  if (!verificada || verificada.estado !== 'LISTO_PARA_REINTENTO' || verificada.version !== entrega.version + 1) return null;
  return verificada;
}

/** @param {string} operacionId ID de saga. @param {Object} encontrada Fila de entrega. @param {Object} entrega DTO. @param {string} anterior Máscara previa. @param {string} nuevo Máscara nueva. @param {string} actor Actor confiable. @param {Error} error Error técnico. @returns {{ok:boolean,mensaje:string,entrega:Object|null}} Resultado seguro. */
function _EntregasLey2300_marcarConciliacionCorreccion(operacionId, encontrada, entrega, anterior, nuevo, actor, error) {
  var detalle = _EntregasLey2300_sanitizarDetalle(String(error && error.message || 'CORRECCION_INCOMPLETA'));
  try { _EntregasLey2300_actualizarOperacion(operacionId, 'PENDIENTE_CONCILIACION', anterior, nuevo, detalle); } catch (actualizacionError) {}
  var actual = EntregasLey2300_obtenerPorId(entrega.entregaId);
  try {
    var conciliacion = EntregasLey2300_forzarConciliacion(entrega.entregaId, actor, detalle);
    actual = conciliacion.entrega || EntregasLey2300_obtenerPorId(entrega.entregaId) || actual;
  } catch (conciliacionError) {}
  try {
    EntregasLey2300_registrarEvento({
      entregaId: entrega.entregaId, uuid: entrega.uuid, tipoEvento: 'CORRECCION_CONCILIACION', estadoAnterior: 'PENDIENTE_CORRECCION',
      estadoNuevo: 'PENDIENTE_CONCILIACION', causaFallo: 'AMBIGUO', destinoMascarado: nuevo, actor: actor, detalle: detalle
    });
  } catch (eventoError) {}
  return { ok: false, mensaje: 'No fue posible procesar la corrección.', entrega: actual };
}

/** @param {Object} entrega Entrega segura. @returns {void} */
function _EntregasLey2300_invalidarCachesCorreccion(entrega) {
  if (typeof CacheWrapper_remove !== 'function') return;
  try {
    CacheWrapper_remove('ENTREGAS_LEY2300');
    CacheWrapper_remove('ENTREGAS_LEY2300_DETALLE_' + entrega.entregaId);
    CacheWrapper_remove('ENTREGAS_LEY2300_UUID_' + entrega.uuid);
  } catch (error) {}
}
/**
 * Obtiene el detalle seguro de una entrega y su historial sanitizado.
 * @param {string} entregaId Identificador opaco de la entrega.
 * @returns {{entrega:Object|null,historial:Object[]}} DTOs sin contacto, huellas ni actor.
 */
function EntregasLey2300_obtenerDetalle(entregaId) {
  _EntregasLey2300_validarEntregaIdConsulta(entregaId);
  var entrega = EntregasLey2300_obtenerPorId(entregaId);
  return { entrega: entrega, historial: entrega ? _EntregasLey2300_obtenerHistorialSeguro(entrega.entregaId) : [] };
}

/**
 * Resume entregas por estado sin incluir filas ni datos de contacto.
 * @returns {{total:number,porEstado:Object,pendientesCorreccion:number,pendientesConciliacion:number}} Conteos accionables.
 */
function EntregasLey2300_obtenerResumen() {
  var porEstado = {};
  for (var indice = 0; indice < ENTREGAS_LEY2300_ESTADOS.length; indice++) porEstado[ENTREGAS_LEY2300_ESTADOS[indice]] = 0;
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS);
  if (hoja.getLastRow() < 2) return _EntregasLey2300_resumenDto(porEstado, 0);
  var mapa = _EntregasLey2300_mapaEncabezados(ENTREGAS_LEY2300_ENCABEZADOS);
  var filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, ENTREGAS_LEY2300_ENCABEZADOS.length).getValues();
  for (var fila = 0; fila < filas.length; fila++) {
    var estado = String(filas[fila][mapa.ESTADO] || '').trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(porEstado, estado)) porEstado[estado]++;
  }
  return _EntregasLey2300_resumenDto(porEstado, filas.length);
}

/** @param {Object} porEstado Conteos validados. @param {number} total Total de filas. @returns {Object} Resumen seguro. */
function _EntregasLey2300_resumenDto(porEstado, total) {
  return {
    total: total,
    porEstado: porEstado,
    pendientesCorreccion: porEstado.PENDIENTE_CORRECCION || 0,
    pendientesConciliacion: porEstado.PENDIENTE_CONCILIACION || 0
  };
}

/** @param {string} entregaId Identificador opaco. @returns {void} */
function _EntregasLey2300_validarEntregaIdConsulta(entregaId) {
  if (typeof entregaId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(entregaId)) throw new Error('La solicitud no es válida.');
}

/** @param {string} entregaId Identificador opaco. @returns {Object[]} Historial seguro por fecha descendente. */
function _EntregasLey2300_obtenerHistorialSeguro(entregaId) {
  var historial = _EntregasLey2300_historialEventos(entregaId).concat(_EntregasLey2300_historialOperaciones(entregaId));
  historial.sort(function(a, b) { return String(b.creadaEn).localeCompare(String(a.creadaEn)); });
  return historial;
}

/** @param {string} entregaId Identificador opaco. @returns {Object[]} Eventos sanitizados. */
function _EntregasLey2300_historialEventos(entregaId) {
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_EVENTOS_HOJA, ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS);
  var mapa = _EntregasLey2300_mapaEncabezados(ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS);
  var filas = _EntregasLey2300_buscarFilasGenericas(hoja, mapa, 'ENTREGA_ID', entregaId);
  var resultado = [];
  for (var indice = 0; indice < filas.length; indice++) {
    var datos = filas[indice].valores;
    resultado.push({
      tipo: 'EVENTO', evento: String(datos[mapa.TIPO_EVENTO] || ''), estadoAnterior: String(datos[mapa.ESTADO_ANTERIOR] || ''),
      estadoNuevo: String(datos[mapa.ESTADO_NUEVO] || ''), causaFallo: String(datos[mapa.CAUSA_FALLO] || ''),
      destinoMascarado: String(datos[mapa.DESTINO_MASCARADO] || ''), detalle: String(datos[mapa.DETALLE_SANITIZADO] || ''),
      creadaEn: _EntregasLey2300_fechaDto(datos[mapa.CREADO_EN])
    });
  }
  return resultado;
}

/** @param {string} entregaId Identificador opaco. @returns {Object[]} Operaciones de corrección sanitizadas. */
function _EntregasLey2300_historialOperaciones(entregaId) {
  var hoja = _EntregasLey2300_obtenerHoja(OPERACIONES_LEY2300_HOJA, OPERACIONES_LEY2300_ENCABEZADOS);
  var mapa = _EntregasLey2300_mapaEncabezados(OPERACIONES_LEY2300_ENCABEZADOS);
  var filas = _EntregasLey2300_buscarFilasGenericas(hoja, mapa, 'ENTREGA_ID', entregaId);
  var resultado = [];
  for (var indice = 0; indice < filas.length; indice++) {
    var datos = filas[indice].valores;
    resultado.push({
      tipo: 'CORRECCION', operacion: String(datos[mapa.TIPO_OPERACION] || ''), estadoNuevo: String(datos[mapa.ESTADO] || ''),
      valorAnteriorMascarado: String(datos[mapa.VALOR_ANTERIOR_MASCARADO] || ''), valorNuevoMascarado: String(datos[mapa.VALOR_NUEVO_MASCARADO] || ''),
      detalle: String(datos[mapa.DETALLE_SANITIZADO] || ''), creadaEn: _EntregasLey2300_fechaDto(datos[mapa.ACTUALIZADA_EN] || datos[mapa.CREADA_EN])
    });
  }
  return resultado;
}
/**
 * Recupera reclamos vencidos antes de seleccionar entregas nuevas. Debe invocarse
 * con el ScriptLock ya adquirido para mantener la selección y la transición CAS juntas.
 * @param {Date=} ahora Reloj inyectable para pruebas.
 * @returns {{candidatas:number,recuperadas:number}} Conteos sin PII.
 */
function EntregasLey2300_recuperarReclamosVencidos(ahora) {
  var referencia = ahora instanceof Date ? ahora : new Date();
  var vencimiento = referencia.getTime() - ENTREGAS_LEY2300_RECLAMO_VENCIDO_MS;
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS);
  if (hoja.getLastRow() < 2) return { candidatas: 0, recuperadas: 0 };
  var mapa = _EntregasLey2300_mapaEncabezados(ENTREGAS_LEY2300_ENCABEZADOS);
  var filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, ENTREGAS_LEY2300_ENCABEZADOS.length).getValues();
  var candidatas = 0;
  var recuperadas = 0;
  for (var indice = 0; indice < filas.length; indice++) {
    var entrega = _EntregasLey2300_aDto(filas[indice], mapa);
    if (entrega.estado !== 'EN_PROCESO' || !_EntregasLey2300_reclamoVencido(filas[indice][mapa.EN_PROCESO_DESDE], vencimiento)) continue;
    candidatas++;
    var resultado = EntregasLey2300_actualizarEstado({
      entregaId: entrega.entregaId, versionEsperada: entrega.version, estadoNuevo: 'PENDIENTE_CONCILIACION',
      causaFallo: 'AMBIGUO', actor: 'TRIGGER_LEY2300', detalle: 'RECLAMO_VENCIDO_RECUPERADO'
    });
    if (resultado.ok) recuperadas++;
  }
  return { candidatas: candidatas, recuperadas: recuperadas };
}

/** @param {*} fecha Valor persistido. @param {number} vencimiento Epoch límite. @returns {boolean} true si no es confiable o venció. */
function _EntregasLey2300_reclamoVencido(fecha, vencimiento) {
  var inicio = fecha instanceof Date ? fecha : new Date(fecha);
  return isNaN(inicio.getTime()) || inicio.getTime() <= vencimiento;
}

/**
 * Lleva un resultado que no se pudo finalizar a conciliación usando la versión vigente.
 * @param {string} entregaId Identificador opaco de entrega.
 * @param {string} actor Actor técnico allowlisted.
 * @param {string} detalle Evidencia técnica sanitizable.
 * @returns {{ok:boolean,entrega:Object|null}} Resultado seguro.
 */
function EntregasLey2300_forzarConciliacion(entregaId, actor, detalle) {
  var actual = EntregasLey2300_obtenerPorId(entregaId);
  if (!actual || ['EN_PROCESO', 'PENDIENTE_CORRECCION', 'LISTO_PARA_REINTENTO'].indexOf(actual.estado) === -1) return { ok: false, entrega: actual || null };
  return EntregasLey2300_actualizarEstado({
    entregaId: actual.entregaId, versionEsperada: actual.version, estadoNuevo: 'PENDIENTE_CONCILIACION',
    causaFallo: 'AMBIGUO', actor: actor, detalle: detalle || 'FINALIZACION_INCOMPLETA'
  });
}

/**
 * Elimina grupos completos de entregas enviados durante el cierre del trigger.
 * Debe invocarse mientras el trigger ya tiene ScriptLock; no toma otro lock para
 * evitar liberar una sección crítica ajena. Conserva una sola auditoría agregada.
 * @param {string[]} uuidsProcesados UUIDs cuya fuente fue confirmada como Procesado.
 * @returns {{uuidsCerrados:number,entregasEliminadas:number,eventosEliminados:number,operacionesEliminadas:number}} Conteos sin PII.
 */
function EntregasLey2300_cerrarProcesadosPorUuid(uuidsProcesados) {
  var candidatos = _EntregasLey2300_candidatosCierre(uuidsProcesados);
  if (!candidatos.entregas.length) return { uuidsCerrados: 0, entregasEliminadas: 0, eventosEliminados: 0, operacionesEliminadas: 0 };
  _EntregasLey2300_registrarCierresPendientes(candidatos);
  return EntregasLey2300_recuperarCierresPendientes();
}

/** Reanuda cierres persistidos y debe ejecutarse bajo el ScriptLock del trigger. @returns {{uuidsCerrados:number,entregasEliminadas:number,eventosEliminados:number,operacionesEliminadas:number}} Conteos sin PII. */
function EntregasLey2300_recuperarCierresPendientes() {
  var pendientes = _EntregasLey2300_leerCierresPendientes();
  if (!pendientes.length) return { uuidsCerrados: 0, entregasEliminadas: 0, eventosEliminados: 0, operacionesEliminadas: 0 };
  for (var indice = 0; indice < pendientes.length; indice++) _EntregasLey2300_ejecutarCierrePendiente(pendientes[indice]);
  var completos = _EntregasLey2300_leerCierresPendientes();
  var lotes = {};
  completos.forEach(function(cierre) { if (!lotes[cierre.loteId]) lotes[cierre.loteId] = []; lotes[cierre.loteId].push(cierre); });
  var resumen = { uuidsCerrados: 0, entregasEliminadas: 0, eventosEliminados: 0, operacionesEliminadas: 0 };
  Object.keys(lotes).forEach(function(loteId) {
    var cierres = lotes[loteId];
    if (!cierres.every(function(cierre) { return cierre.estado === 'LISTO_PARA_AUDITORIA'; })) return;
    var loteResumen = _EntregasLey2300_resumirCierresPendientes(cierres);
    _EntregasLey2300_registrarAuditoriaCierre(loteId, loteResumen);
    _EntregasLey2300_eliminarFilas(ENTREGAS_LEY2300_CIERRES_PENDIENTES_HOJA, cierres.map(function(cierre) { return cierre.fila; }));
    resumen.uuidsCerrados += loteResumen.uuidsCerrados; resumen.entregasEliminadas += loteResumen.entregasEliminadas;
    resumen.eventosEliminados += loteResumen.eventosEliminados; resumen.operacionesEliminadas += loteResumen.operacionesEliminadas;
  });
  return resumen;
}

/** @param {{entregas:Array}} candidatos Grupos validados. @returns {void} */
function _EntregasLey2300_registrarCierresPendientes(candidatos) {
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_CIERRES_PENDIENTES_HOJA, ENTREGAS_LEY2300_CIERRES_PENDIENTES_ENCABEZADOS);
  var loteId = _EntregasLey2300_generarId(); var porUuid = {};
  candidatos.entregas.forEach(function(entrega) { if (!porUuid[entrega.uuid]) porUuid[entrega.uuid] = []; porUuid[entrega.uuid].push(entrega); });
  var filas = Object.keys(porUuid).map(function(uuid) {
    var entregas = porUuid[uuid]; var ids = entregas.map(function(entrega) { return entrega.entregaId; });
    return _EntregasLey2300_filaPorCampos(ENTREGAS_LEY2300_CIERRES_PENDIENTES_ENCABEZADOS, {
      LOTE_CIERRE_ID: loteId, UUID_SISTEMA: uuid, ENTREGA_IDS_JSON: JSON.stringify(ids), ESTADO: 'PENDIENTE', ENTREGAS_ESPERADAS: ids.length,
      EVENTOS_ESPERADOS: _EntregasLey2300_contarBitacoras(ENTREGAS_LEY2300_EVENTOS_HOJA, ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS, ids),
      OPERACIONES_ESPERADAS: _EntregasLey2300_contarBitacoras(OPERACIONES_LEY2300_HOJA, OPERACIONES_LEY2300_ENCABEZADOS, ids), CREADA_EN: new Date()
    });
  });
  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, ENTREGAS_LEY2300_CIERRES_PENDIENTES_ENCABEZADOS.length).setValues(filas);
}

/** @returns {Array} Marcadores recuperables. */
function _EntregasLey2300_leerCierresPendientes() {
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_CIERRES_PENDIENTES_HOJA, ENTREGAS_LEY2300_CIERRES_PENDIENTES_ENCABEZADOS);
  if (hoja.getLastRow() < 2) return [];
  var mapa = _EntregasLey2300_mapaEncabezados(ENTREGAS_LEY2300_CIERRES_PENDIENTES_ENCABEZADOS);
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, ENTREGAS_LEY2300_CIERRES_PENDIENTES_ENCABEZADOS.length).getValues().map(function(fila, indice) {
    return { fila: indice + 2, loteId: String(fila[mapa.LOTE_CIERRE_ID] || ''), ids: _EntregasLey2300_idsCierre(fila[mapa.ENTREGA_IDS_JSON]), estado: String(fila[mapa.ESTADO] || ''), entregasEsperadas: Number(fila[mapa.ENTREGAS_ESPERADAS]) || 0, eventosEsperados: Number(fila[mapa.EVENTOS_ESPERADOS]) || 0, operacionesEsperadas: Number(fila[mapa.OPERACIONES_ESPERADAS]) || 0 };
  });
}

/** @param {*} valor JSON propio persistido. @returns {string[]} IDs válidos. */
function _EntregasLey2300_idsCierre(valor) {
  try { var ids = JSON.parse(String(valor || '[]')); return Array.isArray(ids) && ids.every(function(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id); }) ? ids : []; } catch (error) { return []; }
}

/** @param {Object} cierre Marcador durable. @returns {void} */
function _EntregasLey2300_ejecutarCierrePendiente(cierre) {
  if (cierre.estado === 'LISTO_PARA_AUDITORIA') return;
  if (cierre.estado !== 'PENDIENTE' || !cierre.loteId || !cierre.ids.length) throw new Error('El cierre pendiente no es válido.');
  _EntregasLey2300_eliminarBitacorasRetencion(ENTREGAS_LEY2300_EVENTOS_HOJA, ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS, cierre.ids);
  _EntregasLey2300_eliminarBitacorasRetencion(OPERACIONES_LEY2300_HOJA, OPERACIONES_LEY2300_ENCABEZADOS, cierre.ids);
  _EntregasLey2300_eliminarEntregasPorId(cierre.ids);
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_CIERRES_PENDIENTES_HOJA, ENTREGAS_LEY2300_CIERRES_PENDIENTES_ENCABEZADOS);
  var mapa = _EntregasLey2300_mapaEncabezados(ENTREGAS_LEY2300_CIERRES_PENDIENTES_ENCABEZADOS);
  _EntregasLey2300_actualizarCampos(hoja, cierre.fila, mapa, { ESTADO: 'LISTO_PARA_AUDITORIA' });
}

/** @param {Array} cierres Marcadores listos. @returns {{uuidsCerrados:number,entregasEliminadas:number,eventosEliminados:number,operacionesEliminadas:number}} Conteos agregados. */
function _EntregasLey2300_resumirCierresPendientes(cierres) {
  return cierres.reduce(function(resumen, cierre) { resumen.uuidsCerrados++; resumen.entregasEliminadas += cierre.entregasEsperadas; resumen.eventosEliminados += cierre.eventosEsperados; resumen.operacionesEliminadas += cierre.operacionesEsperadas; return resumen; }, { uuidsCerrados: 0, entregasEliminadas: 0, eventosEliminados: 0, operacionesEliminadas: 0 });
}

/** @param {string} nombre Hoja. @param {string[]} encabezados Esquema. @param {string[]} entregaIds IDs. @returns {number} Conteo actual. */
function _EntregasLey2300_contarBitacoras(nombre, encabezados, entregaIds) {
  var hoja = _EntregasLey2300_obtenerHoja(nombre, encabezados);
  if (hoja.getLastRow() < 2) return 0;
  var mapa = _EntregasLey2300_mapaEncabezados(encabezados);
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, encabezados.length).getValues().filter(function(fila) { return entregaIds.indexOf(String(fila[mapa.ENTREGA_ID] || '')) !== -1; }).length;
}

/** @param {string[]} ids IDs de entrega. @returns {number} Filas eliminadas. */
function _EntregasLey2300_eliminarEntregasPorId(ids) {
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS);
  return _EntregasLey2300_eliminarFilas(ENTREGAS_LEY2300_HOJA, _EntregasLey2300_buscarFilasPorIds(hoja, ENTREGAS_LEY2300_ENCABEZADOS, ids));
}

/** @param {GoogleAppsScript.Spreadsheet.Sheet} hoja Hoja. @param {string[]} encabezados Esquema. @param {string[]} ids IDs. @returns {number[]} Filas 1-based. */
function _EntregasLey2300_buscarFilasPorIds(hoja, encabezados, ids) {
  if (!ids.length || hoja.getLastRow() < 2) return [];
  var mapa = _EntregasLey2300_mapaEncabezados(encabezados); var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, encabezados.length).getValues(); var filas = [];
  for (var indice = 0; indice < datos.length; indice++) if (ids.indexOf(String(datos[indice][mapa.ENTREGA_ID] || '')) !== -1) filas.push(indice + 2);
  return filas;
}

/** @param {string[]} uuidsProcesados UUIDs confirmados por la fuente. @returns {{uuids:string[],entregas:Array}} Grupos enteros aptos para cierre. */
function _EntregasLey2300_candidatosCierre(uuidsProcesados) {
  var permitidos = {};
  (Array.isArray(uuidsProcesados) ? uuidsProcesados : []).forEach(function(uuid) {
    var normalizado = String(uuid || '').trim();
    if (normalizado) permitidos[normalizado] = true;
  });
  return _EntregasLey2300_seleccionarGruposEnviados(permitidos, null);
}

/**
 * Elimina únicamente grupos completos cuyo conjunto es ENVIADO y la fuente sigue Procesado.
 * La antigüedad se calcula solo contra ENVIADA_EN para no retener fallidos ni parciales.
 * @param {{confirmacion:string}} comando Confirmación explícita.
 * @param {string} actor Identidad interna del operador.
 * @param {Date=} ahora Reloj inyectable para pruebas.
 * @returns {{ok:boolean,requiereConfirmacion:boolean,candidatasTerminales:number,noTerminalesVencidas:number,entregasEliminadas:number,eventosEliminados:number,operacionesEliminadas:number}} Resultado sin PII.
 */
function EntregasLey2300_depurarRetencion(comando, actor, ahora) {
  _EntregasLey2300_validarClaves(comando, ['confirmacion']);
  if (typeof comando.confirmacion !== 'string' || typeof actor !== 'string' || !actor.trim()) throw new Error('La solicitud no es válida.');
  var referencia = ahora instanceof Date ? ahora : new Date();
  var candidatos = _EntregasLey2300_candidatosRetencion(referencia);
  var resumen = {
    ok: false, requiereConfirmacion: comando.confirmacion !== ENTREGAS_LEY2300_CONFIRMACION_RETENCION,
    candidatasTerminales: candidatos.terminales.length, noTerminalesVencidas: candidatos.noTerminales,
    entregasEliminadas: 0, eventosEliminados: 0, operacionesEliminadas: 0
  };
  if (resumen.requiereConfirmacion) return resumen;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return resumen;
  try {
    candidatos = _EntregasLey2300_candidatosRetencion(referencia);
    resumen.candidatasTerminales = candidatos.terminales.length;
    resumen.noTerminalesVencidas = candidatos.noTerminales;
    var ids = candidatos.terminales.map(function(candidato) { return candidato.entregaId; });
    resumen.eventosEliminados = _EntregasLey2300_eliminarBitacorasRetencion(ENTREGAS_LEY2300_EVENTOS_HOJA, ENTREGAS_LEY2300_EVENTOS_ENCABEZADOS, ids);
    resumen.operacionesEliminadas = _EntregasLey2300_eliminarBitacorasRetencion(OPERACIONES_LEY2300_HOJA, OPERACIONES_LEY2300_ENCABEZADOS, ids);
    resumen.entregasEliminadas = _EntregasLey2300_eliminarFilas(ENTREGAS_LEY2300_HOJA, candidatos.terminales.map(function(candidato) { return candidato.fila; }));
    resumen.ok = true;
    _EntregasLey2300_registrarAuditoriaRetencion(resumen, actor);
    return resumen;
  } finally {
    lock.releaseLock();
  }
}

/** @param {Date} referencia Reloj de corte. @returns {{terminales:Array,noTerminales:number}} Candidatos permitidos por grupo completo. */
function _EntregasLey2300_candidatosRetencion(referencia) {
  var limite = referencia.getTime() - ENTREGAS_LEY2300_RETENCION_DIAS * 24 * 60 * 60 * 1000;
  var seleccion = _EntregasLey2300_seleccionarGruposEnviados(_EntregasLey2300_obtenerUuidsProcesados(), limite);
  return { terminales: seleccion.entregas, noTerminales: seleccion.noTerminales };
}

/**
 * Selecciona grupos completos de UUID sin separar entregas ENVIADO de casos parciales.
 * @param {Object<string,boolean>} uuidsProcesados UUIDs autorizados.
 * @param {number|null} limiteEnviadaEn Epoch máximo o null para cierre inmediato.
 * @returns {{uuids:string[],entregas:Array,noTerminales:number}} Grupos y filas aptas.
 */
function _EntregasLey2300_seleccionarGruposEnviados(uuidsProcesados, limiteEnviadaEn) {
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS);
  if (hoja.getLastRow() < 2) return { uuids: [], entregas: [], noTerminales: 0 };
  var mapa = _EntregasLey2300_mapaEncabezados(ENTREGAS_LEY2300_ENCABEZADOS);
  var filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, ENTREGAS_LEY2300_ENCABEZADOS.length).getValues();
  var grupos = {};
  for (var indice = 0; indice < filas.length; indice++) {
    var uuid = String(filas[indice][mapa.UUID_SISTEMA] || '').trim();
    if (!uuid) continue;
    if (!grupos[uuid]) grupos[uuid] = [];
    grupos[uuid].push({ uuid: uuid, fila: indice + 2, entregaId: String(filas[indice][mapa.ENTREGA_ID] || ''), estado: String(filas[indice][mapa.ESTADO] || '').trim(), enviadaEn: filas[indice][mapa.ENVIADA_EN] });
  }
  var uuids = []; var entregas = []; var noTerminales = 0;
  Object.keys(grupos).forEach(function(uuid) {
    var grupo = grupos[uuid];
    var esCompleto = grupo.every(function(entrega) { return entrega.estado === 'ENVIADO'; });
    var esAntiguo = limiteEnviadaEn === null || grupo.every(function(entrega) {
      var enviadaEn = entrega.enviadaEn instanceof Date ? entrega.enviadaEn : new Date(entrega.enviadaEn);
      return !isNaN(enviadaEn.getTime()) && enviadaEn.getTime() <= limiteEnviadaEn;
    });
    if (uuidsProcesados[uuid] && esCompleto && esAntiguo) {
      uuids.push(uuid);
      entregas = entregas.concat(grupo);
    } else if (limiteEnviadaEn !== null && grupo.some(function(entrega) {
      var enviadaEn = entrega.enviadaEn instanceof Date ? entrega.enviadaEn : new Date(entrega.enviadaEn);
      return !isNaN(enviadaEn.getTime()) && enviadaEn.getTime() <= limiteEnviadaEn;
    })) {
      noTerminales++;
    }
  });
  return { uuids: uuids, entregas: entregas, noTerminales: noTerminales };
}

/** @returns {Object<string,boolean>} UUIDs cuya fuente conserva el prefijo Procesado. */
function _EntregasLey2300_obtenerUuidsProcesados() {
  try {
    if (typeof getArchivoAnalisisId !== 'function') return {};
    var hoja = SpreadsheetRegistry_get(getArchivoAnalisisId()).getSheetByName('registro analisis');
    if (!hoja || hoja.getLastRow() < 2) return {};
    var datos = hoja.getDataRange().getValues();
    var indiceUuid = datos[0].indexOf('UUID_SISTEMA');
    var indiceEstado = datos[0].indexOf('Estado Automatización');
    if (indiceUuid === -1 || indiceEstado === -1) return {};
    var procesados = {};
    for (var indice = 1; indice < datos.length; indice++) {
      var uuid = String(datos[indice][indiceUuid] || '').trim();
      if (uuid && /^PROCESADO\b/i.test(String(datos[indice][indiceEstado] || '').trim())) procesados[uuid] = true;
    }
    return procesados;
  } catch (error) {
    return {};
  }
}

/** @param {string} loteId Identificador técnico idempotente. @param {Object} resumen Conteos sin PII. @returns {void} */
function _EntregasLey2300_registrarAuditoriaCierre(loteId, resumen) {
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_CIERRES_HOJA, ENTREGAS_LEY2300_CIERRES_ENCABEZADOS);
  if (hoja.getLastRow() > 1 && hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().some(function(fila) { return String(fila[0] || '') === loteId; })) return;
  hoja.appendRow(_EntregasLey2300_filaPorCampos(ENTREGAS_LEY2300_CIERRES_ENCABEZADOS, {
    EJECUCION_ID: loteId, UUIDS_CERRADOS: resumen.uuidsCerrados,
    ENTREGAS_ELIMINADAS: resumen.entregasEliminadas, EVENTOS_ELIMINADOS: resumen.eventosEliminados,
    OPERACIONES_ELIMINADAS: resumen.operacionesEliminadas, CERRADA_EN: new Date()
  }));
}

/** @param {string} nombre Hoja de bitácora. @param {string[]} encabezados Esquema. @param {string[]} entregaIds IDs permitidos. @returns {number} Filas eliminadas. */
function _EntregasLey2300_eliminarBitacorasRetencion(nombre, encabezados, entregaIds) {
  if (!entregaIds.length) return 0;
  var hoja = _EntregasLey2300_obtenerHoja(nombre, encabezados);
  if (hoja.getLastRow() < 2) return 0;
  var mapa = _EntregasLey2300_mapaEncabezados(encabezados);
  var filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, encabezados.length).getValues();
  var eliminar = [];
  for (var indice = 0; indice < filas.length; indice++) if (entregaIds.indexOf(String(filas[indice][mapa.ENTREGA_ID] || '')) !== -1) eliminar.push(indice + 2);
  return _EntregasLey2300_eliminarFilas(nombre, eliminar);
}

/** @param {string} nombre Hoja. @param {number[]} filas Filas 1-based. @returns {number} Conteo eliminado. */
function _EntregasLey2300_eliminarFilas(nombre, filas) {
  if (!filas.length) return 0;
  var hoja = SpreadsheetRegistry_get(getHojaControlId()).getSheetByName(nombre);
  filas.sort(function(a, b) { return b - a; });
  for (var indice = 0; indice < filas.length; indice++) hoja.deleteRows(filas[indice], 1);
  return filas.length;
}

/** @param {Object} resumen Conteos sin PII. @param {string} actor Identidad interna. @returns {void} */
function _EntregasLey2300_registrarAuditoriaRetencion(resumen, actor) {
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_RETENCION_HOJA, ENTREGAS_LEY2300_RETENCION_ENCABEZADOS);
  hoja.appendRow(_EntregasLey2300_filaPorCampos(ENTREGAS_LEY2300_RETENCION_ENCABEZADOS, {
    EJECUCION_ID: _EntregasLey2300_generarId(), ACTOR_HUELLA: EntregasLey2300_huellaDestino(actor), CONFIRMACION: 'EXPLICITA',
    CANDIDATAS_TERMINALES: resumen.candidatasTerminales, NO_TERMINALES_VENCIDAS: resumen.noTerminalesVencidas,
    ENTREGAS_ELIMINADAS: resumen.entregasEliminadas, EVENTOS_ELIMINADOS: resumen.eventosEliminados,
    OPERACIONES_ELIMINADAS: resumen.operacionesEliminadas, EJECUTADA_EN: new Date()
  }));
}
/**
 * Crea un caso corregible cuando el contacto fuente no es utilizable.
 * No persiste el valor inválido ni intenta enviarlo.
 * @param {{uuid:string,idLote:string,solicitud:string,participante:string,canal:string}} comando Identidad de entrega sin destino.
 * @returns {{creada:boolean,entrega:Object}} Entrega segura para gestión ADMIN.
 */
function EntregasLey2300_crearPendienteCorreccion(comando) {
  _EntregasLey2300_validarClaves(comando, ['uuid', 'idLote', 'solicitud', 'participante', 'canal']);
  var clave = EntregasLey2300_claveEntrega(comando.uuid, comando.participante, comando.canal);
  if (!clave) throw new Error('Los datos de la entrega no son válidos.');
  var hoja = _EntregasLey2300_obtenerHoja(ENTREGAS_LEY2300_HOJA, ENTREGAS_LEY2300_ENCABEZADOS);
  var existentes = _EntregasLey2300_buscarFilas(hoja, 'CLAVE_ENTREGA', clave);
  if (existentes.length) return { creada: false, entrega: _EntregasLey2300_aDto(existentes[0].valores, existentes[0].mapa) };
  var ahora = new Date();
  var fila = _EntregasLey2300_filaPorCampos(ENTREGAS_LEY2300_ENCABEZADOS, {
    ENTREGA_ID: _EntregasLey2300_generarId(), CLAVE_ENTREGA: clave, UUID_SISTEMA: String(comando.uuid).trim(),
    ID_LOTE: _EntregasLey2300_textoSeguro(comando.idLote, 128), SOLICITUD: _EntregasLey2300_textoSeguro(comando.solicitud, 128),
    PARTICIPANTE: String(comando.participante).trim().toUpperCase(), CANAL: String(comando.canal).trim().toUpperCase(),
    DESTINO_MASCARADO: EntregasLey2300_enmascararDestino('', comando.canal), HUELLA_DESTINO: '', ESTADO: 'PENDIENTE_CORRECCION',
    CAUSA_FALLO: 'DATOS_CONTACTO', CODIGO_RESULTADO: '', REFERENCIA_PROVEEDOR: '', INTENTOS: 0,
    MAX_INTENTOS: ENTREGAS_LEY2300_MAX_INTENTOS_DEFAULT, PROXIMO_INTENTO_EN: '', INTENTO_ACTIVO_ID: '',
    EN_PROCESO_DESDE: '', VERSION: 1, CREADA_EN: ahora, ACTUALIZADA_EN: ahora, ENVIADA_EN: ''
  });
  hoja.appendRow(fila);
  var creada = _EntregasLey2300_aDto(fila, _EntregasLey2300_mapaEncabezados(ENTREGAS_LEY2300_ENCABEZADOS));
  EntregasLey2300_registrarEvento({
    entregaId: creada.entregaId, uuid: creada.uuid, tipoEvento: 'CONTACTO_INVALIDO_REGISTRADO', estadoNuevo: 'PENDIENTE_CORRECCION',
    causaFallo: 'DATOS_CONTACTO', destinoMascarado: creada.destinoMascarado, detalle: 'CONTACTO_REQUIERE_CORRECCION'
  });
  return { creada: true, entrega: creada };
}
