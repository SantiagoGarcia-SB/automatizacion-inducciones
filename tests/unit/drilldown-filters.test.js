/**
 * Unit tests for DrillDownFilters — render y lógica de visibilidad por rol
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.3
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Creates a testable DrillDownFilters instance (same logic as the HTML module).
 */
function createDrillDownFilters() {
  return {
    _state: { director: null, comercial: null },
    _rol: null,
    _emailUsuario: null,
    _usuarios: null,
    _onFiltroChange: null,

    _ROLES_AMBOS_FILTROS: ['GERENTE', 'ADMIN', 'ASESOR'],
    _ROLES_SOLO_COMERCIAL: ['DIRECTOR'],
    _ROLES_SIN_FILTRO: ['CONSULTOR', 'COMERCIAL', 'AUXILIAR', 'ANALISTA'],

    _getVisibilidad: function(rol) {
      var rolUpper = (rol || '').toUpperCase();
      if (this._ROLES_AMBOS_FILTROS.indexOf(rolUpper) !== -1) return 'ambos';
      if (this._ROLES_SOLO_COMERCIAL.indexOf(rolUpper) !== -1) return 'solo-comercial';
      return 'oculto';
    },

    render: function(rol, usuarios, emailUsuario) {
      var visibilidad = this._getVisibilidad(rol);

      if (visibilidad === 'oculto') {
        return '';
      }

      this._rol = rol;
      this._emailUsuario = emailUsuario;
      this._usuarios = usuarios;

      this._state = { director: null, comercial: null };

      var html = '<div class="drilldown-filters" data-testid="drilldown-filters">';

      if (visibilidad === 'ambos') {
        var directores = this._getDirectoresVisibles(rol, emailUsuario, usuarios);
        html += this._renderDropdownDirector(directores);
      }

      var comerciales = this._getComercialesVisibles(
        this._state.director,
        rol,
        emailUsuario,
        usuarios
      );
      html += this._renderDropdownComercial(comerciales);

      html += '</div>';
      return html;
    },

    _renderDropdownDirector: function(directores) {
      var html = '<div class="drilldown-filters__group" data-testid="filtro-director-container">';
      html += '<label class="drilldown-filters__label" for="filtro-director">Director</label>';
      html += '<select class="drilldown-filters__select" id="filtro-director" data-testid="filtro-director" onchange="DrillDownFilters.onDirectorChange(this.value)">';
      html += '<option value="" selected>Todos</option>';

      for (var i = 0; i < directores.length; i++) {
        var dir = directores[i];
        html += '<option value="' + this._escapeAttr(dir.email) + '">'
          + this._escapeHtml(dir.nombre) + '</option>';
      }

      html += '</select>';
      html += '</div>';
      return html;
    },

    _renderDropdownComercial: function(comerciales) {
      var html = '<div class="drilldown-filters__group" data-testid="filtro-comercial-container">';
      html += '<label class="drilldown-filters__label" for="filtro-comercial">Comercial</label>';
      html += '<select class="drilldown-filters__select" id="filtro-comercial" data-testid="filtro-comercial" onchange="DrillDownFilters.onComercialChange(this.value)">';
      html += '<option value="" selected>Todos</option>';

      for (var i = 0; i < comerciales.length; i++) {
        var com = comerciales[i];
        html += '<option value="' + this._escapeAttr(com.email) + '">'
          + this._escapeHtml(com.nombre) + '</option>';
      }

      html += '</select>';
      html += '</div>';
      return html;
    },

    onDirectorChange: function(emailDirector) {
      this._state.director = emailDirector || null;
      this._state.comercial = null;

      var comerciales = this._getComercialesVisibles(
        this._state.director,
        this._rol,
        this._emailUsuario,
        this._usuarios
      );

      var selectComercial = (typeof document !== 'undefined') ? document.getElementById('filtro-comercial') : null;
      if (selectComercial) {
        var html = '<option value="" selected>Todos</option>';
        for (var i = 0; i < comerciales.length; i++) {
          var com = comerciales[i];
          html += '<option value="' + this._escapeAttr(com.email) + '">'
            + this._escapeHtml(com.nombre) + '</option>';
        }
        selectComercial.innerHTML = html;
      }

      if (typeof this._onFiltroChange === 'function') {
        this._onFiltroChange({ director: this._state.director, comercial: this._state.comercial });
      }
    },

    onComercialChange: function(emailComercial) {
      this._state.comercial = emailComercial || null;

      if (typeof this._onFiltroChange === 'function') {
        this._onFiltroChange({ director: this._state.director, comercial: this._state.comercial });
      }
    },

    getEmailsFiltrados: function(usuarios) {
      if (this._state.comercial) {
        return [this._state.comercial];
      }

      if (this._state.director) {
        var comerciales = this._getComercialesVisibles(
          this._state.director,
          this._rol,
          this._emailUsuario,
          usuarios
        );
        var emails = [];
        for (var i = 0; i < comerciales.length; i++) {
          emails.push(comerciales[i].email);
        }
        return emails;
      }

      return null;
    },

    _getDirectoresVisibles: function(rol, emailUsuario, usuarios) {
      var resultado = [];
      if (!usuarios) return resultado;

      var rolUpper = (rol || '').toUpperCase();
      var emailNorm = (emailUsuario || '').toLowerCase().trim();

      for (var i = 0; i < usuarios.length; i++) {
        var u = usuarios[i];
        if (u.rol !== 'DIRECTOR' || !u.activo) continue;

        if (rolUpper === 'GERENTE') {
          var emailGerente = (u.emailGerente || '').toLowerCase().trim();
          if (emailGerente === emailNorm) {
            resultado.push({ email: u.email, nombre: u.nombre });
          }
        } else if (rolUpper === 'ADMIN' || rolUpper === 'ASESOR') {
          resultado.push({ email: u.email, nombre: u.nombre });
        }
      }

      return resultado;
    },

    _getComercialesVisibles: function(emailDirector, rol, emailUsuario, usuarios) {
      var resultado = [];
      if (!usuarios) return resultado;

      var rolUpper = (rol || '').toUpperCase();
      var emailNorm = (emailUsuario || '').toLowerCase().trim();
      var rolesComercial = ['COMERCIAL', 'CONSULTOR'];

      if (emailDirector) {
        var directorNorm = emailDirector.toLowerCase().trim();
        for (var i = 0; i < usuarios.length; i++) {
          var u = usuarios[i];
          if (!u.activo) continue;
          if (rolesComercial.indexOf(u.rol) === -1) continue;
          var uDir = (u.emailDirector || '').toLowerCase().trim();
          if (uDir === directorNorm) {
            resultado.push({ email: u.email, nombre: u.nombre });
          }
        }
      } else if (rolUpper === 'GERENTE') {
        var directoresDelGerente = {};
        for (var j = 0; j < usuarios.length; j++) {
          var d = usuarios[j];
          if (d.rol === 'DIRECTOR' && d.activo) {
            var dGerente = (d.emailGerente || '').toLowerCase().trim();
            if (dGerente === emailNorm) {
              directoresDelGerente[d.email.toLowerCase().trim()] = true;
            }
          }
        }
        for (var k = 0; k < usuarios.length; k++) {
          var c = usuarios[k];
          if (!c.activo) continue;
          if (rolesComercial.indexOf(c.rol) === -1) continue;
          var cDir = (c.emailDirector || '').toLowerCase().trim();
          if (directoresDelGerente[cDir]) {
            resultado.push({ email: c.email, nombre: c.nombre });
          }
        }
      } else if (rolUpper === 'DIRECTOR') {
        for (var m = 0; m < usuarios.length; m++) {
          var u2 = usuarios[m];
          if (!u2.activo) continue;
          if (rolesComercial.indexOf(u2.rol) === -1) continue;
          var u2Dir = (u2.emailDirector || '').toLowerCase().trim();
          if (u2Dir === emailNorm) {
            resultado.push({ email: u2.email, nombre: u2.nombre });
          }
        }
      } else if (rolUpper === 'ADMIN' || rolUpper === 'ASESOR') {
        for (var n = 0; n < usuarios.length; n++) {
          var u3 = usuarios[n];
          if (!u3.activo) continue;
          if (rolesComercial.indexOf(u3.rol) === -1) continue;
          resultado.push({ email: u3.email, nombre: u3.nombre });
        }
      }

      return resultado;
    },

    _escapeHtml: function(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    _escapeAttr: function(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  };
}

/** Sample users for testing */
function crearUsuariosMuestra() {
  return [
    { email: 'gerente@test.com', nombre: 'Gerente Test', rol: 'GERENTE', emailDirector: '', emailGerente: '', activo: true },
    { email: 'director1@test.com', nombre: 'Director Uno', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente@test.com', activo: true },
    { email: 'director2@test.com', nombre: 'Director Dos', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente@test.com', activo: true },
    { email: 'director-inactivo@test.com', nombre: 'Director Inactivo', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente@test.com', activo: false },
    { email: 'comercial1@test.com', nombre: 'Comercial Uno', rol: 'COMERCIAL', emailDirector: 'director1@test.com', emailGerente: 'gerente@test.com', activo: true },
    { email: 'comercial2@test.com', nombre: 'Comercial Dos', rol: 'COMERCIAL', emailDirector: 'director1@test.com', emailGerente: 'gerente@test.com', activo: true },
    { email: 'consultor1@test.com', nombre: 'Consultor Uno', rol: 'CONSULTOR', emailDirector: 'director2@test.com', emailGerente: 'gerente@test.com', activo: true },
    { email: 'comercial-inactivo@test.com', nombre: 'Comercial Inactivo', rol: 'COMERCIAL', emailDirector: 'director1@test.com', emailGerente: 'gerente@test.com', activo: false }
  ];
}

describe('DrillDownFilters', function() {
  let filters;
  let usuarios;

  beforeEach(function() {
    filters = createDrillDownFilters();
    usuarios = crearUsuariosMuestra();
  });

  describe('Visibilidad por rol (render)', function() {
    it('GERENTE → renderiza Filtro_Director + Filtro_Comercial', function() {
      var html = filters.render('GERENTE', usuarios, 'gerente@test.com');
      expect(html).toContain('data-testid="filtro-director-container"');
      expect(html).toContain('data-testid="filtro-comercial-container"');
      expect(html).toContain('data-testid="drilldown-filters"');
    });

    it('ADMIN → renderiza Filtro_Director + Filtro_Comercial', function() {
      var html = filters.render('ADMIN', usuarios, 'admin@test.com');
      expect(html).toContain('data-testid="filtro-director-container"');
      expect(html).toContain('data-testid="filtro-comercial-container"');
    });

    it('ASESOR → renderiza Filtro_Director + Filtro_Comercial', function() {
      var html = filters.render('ASESOR', usuarios, 'asesor@test.com');
      expect(html).toContain('data-testid="filtro-director-container"');
      expect(html).toContain('data-testid="filtro-comercial-container"');
    });

    it('DIRECTOR → renderiza solo Filtro_Comercial (sin Filtro_Director)', function() {
      var html = filters.render('DIRECTOR', usuarios, 'director1@test.com');
      expect(html).not.toContain('data-testid="filtro-director-container"');
      expect(html).toContain('data-testid="filtro-comercial-container"');
    });

    it('CONSULTOR → no renderiza (retorna vacío)', function() {
      var html = filters.render('CONSULTOR', usuarios, 'consultor1@test.com');
      expect(html).toBe('');
    });

    it('COMERCIAL → no renderiza (retorna vacío)', function() {
      var html = filters.render('COMERCIAL', usuarios, 'comercial1@test.com');
      expect(html).toBe('');
    });

    it('AUXILIAR → no renderiza (retorna vacío)', function() {
      var html = filters.render('AUXILIAR', usuarios, 'auxiliar@test.com');
      expect(html).toBe('');
    });

    it('ANALISTA → no renderiza (retorna vacío)', function() {
      var html = filters.render('ANALISTA', usuarios, 'analista@test.com');
      expect(html).toBe('');
    });

    it('Rol desconocido → no renderiza (retorna vacío)', function() {
      var html = filters.render('INVENTADO', usuarios, 'alguien@test.com');
      expect(html).toBe('');
    });

    it('Rol en minúsculas funciona igual (case-insensitive)', function() {
      var html = filters.render('gerente', usuarios, 'gerente@test.com');
      expect(html).toContain('data-testid="filtro-director-container"');
      expect(html).toContain('data-testid="filtro-comercial-container"');
    });
  });

  describe('Opción "Todos" por defecto', function() {
    it('Filtro_Director incluye "Todos" como primera opción seleccionada', function() {
      var html = filters.render('GERENTE', usuarios, 'gerente@test.com');
      var directorSelectRegex = /id="filtro-director"[^>]*>[\s\S]*?<option value="" selected>Todos<\/option>/;
      expect(html).toMatch(directorSelectRegex);
    });

    it('Filtro_Comercial incluye "Todos" como primera opción seleccionada', function() {
      var html = filters.render('GERENTE', usuarios, 'gerente@test.com');
      var comercialSelectRegex = /id="filtro-comercial"[^>]*>[\s\S]*?<option value="" selected>Todos<\/option>/;
      expect(html).toMatch(comercialSelectRegex);
    });

    it('Filtro_Comercial para DIRECTOR también incluye "Todos" por defecto', function() {
      var html = filters.render('DIRECTOR', usuarios, 'director1@test.com');
      expect(html).toContain('<option value="" selected>Todos</option>');
    });
  });

  describe('Contenido de dropdowns', function() {
    it('Filtro_Director para GERENTE lista solo directores de su equipo', function() {
      var html = filters.render('GERENTE', usuarios, 'gerente@test.com');
      expect(html).toContain('Director Uno');
      expect(html).toContain('Director Dos');
      expect(html).not.toContain('Director Inactivo');
    });

    it('Filtro_Comercial para GERENTE lista comerciales transitivos de sus directores', function() {
      var html = filters.render('GERENTE', usuarios, 'gerente@test.com');
      expect(html).toContain('Comercial Uno');
      expect(html).toContain('Comercial Dos');
      expect(html).toContain('Consultor Uno');
      expect(html).not.toContain('Comercial Inactivo');
    });

    it('Filtro_Comercial para DIRECTOR lista solo sus propios comerciales', function() {
      var html = filters.render('DIRECTOR', usuarios, 'director1@test.com');
      expect(html).toContain('Comercial Uno');
      expect(html).toContain('Comercial Dos');
      expect(html).not.toContain('Consultor Uno'); // pertenece a director2
      expect(html).not.toContain('Comercial Inactivo');
    });

    it('Render con usuarios vacíos no lanza error', function() {
      expect(function() {
        filters.render('GERENTE', [], 'gerente@test.com');
      }).not.toThrow();
    });

    it('Render con usuarios null no lanza error', function() {
      expect(function() {
        filters.render('GERENTE', null, 'gerente@test.com');
      }).not.toThrow();
    });
  });

  describe('Estado interno (_state)', function() {
    it('render() resetea _state a {director: null, comercial: null}', function() {
      filters._state = { director: 'alguien@test.com', comercial: 'otro@test.com' };
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      expect(filters._state).toEqual({ director: null, comercial: null });
    });

    it('render() almacena _rol, _emailUsuario y _usuarios para uso posterior', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      expect(filters._rol).toBe('GERENTE');
      expect(filters._emailUsuario).toBe('gerente@test.com');
      expect(filters._usuarios).toBe(usuarios);
    });

    it('onDirectorChange actualiza _state.director y resetea comercial', function() {
      filters._state.comercial = 'alguien@test.com';
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onDirectorChange('director1@test.com');
      expect(filters._state.director).toBe('director1@test.com');
      expect(filters._state.comercial).toBeNull();
    });

    it('onDirectorChange con string vacío setea director a null', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onDirectorChange('');
      expect(filters._state.director).toBeNull();
    });

    it('onComercialChange actualiza _state.comercial', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onComercialChange('comercial1@test.com');
      expect(filters._state.comercial).toBe('comercial1@test.com');
    });

    it('onComercialChange con string vacío setea comercial a null', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onComercialChange('');
      expect(filters._state.comercial).toBeNull();
    });
  });

  describe('Cascada — onDirectorChange (Req 4.1, 4.2)', function() {
    it('onDirectorChange invoca _onFiltroChange con estado actualizado', function() {
      var callbackArg = null;
      filters._onFiltroChange = function(state) { callbackArg = state; };
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onDirectorChange('director1@test.com');
      expect(callbackArg).toEqual({ director: 'director1@test.com', comercial: null });
    });

    it('onDirectorChange con "Todos" pasa director=null al callback', function() {
      var callbackArg = null;
      filters._onFiltroChange = function(state) { callbackArg = state; };
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onDirectorChange('director1@test.com');
      filters.onDirectorChange('');
      expect(callbackArg).toEqual({ director: null, comercial: null });
    });

    it('onDirectorChange no lanza error si _onFiltroChange es null', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters._onFiltroChange = null;
      expect(function() {
        filters.onDirectorChange('director1@test.com');
      }).not.toThrow();
    });

    it('onDirectorChange siempre resetea comercial a null', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onComercialChange('comercial1@test.com');
      expect(filters._state.comercial).toBe('comercial1@test.com');
      filters.onDirectorChange('director2@test.com');
      expect(filters._state.comercial).toBeNull();
    });
  });

  describe('Cascada — onComercialChange (Req 4.3)', function() {
    it('onComercialChange invoca _onFiltroChange con estado actualizado', function() {
      var callbackArg = null;
      filters._onFiltroChange = function(state) { callbackArg = state; };
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onDirectorChange('director1@test.com');
      filters.onComercialChange('comercial1@test.com');
      expect(callbackArg).toEqual({ director: 'director1@test.com', comercial: 'comercial1@test.com' });
    });

    it('onComercialChange con "Todos" pasa comercial=null al callback', function() {
      var callbackArg = null;
      filters._onFiltroChange = function(state) { callbackArg = state; };
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onComercialChange('comercial1@test.com');
      filters.onComercialChange('');
      expect(callbackArg).toEqual({ director: null, comercial: null });
    });

    it('onComercialChange no lanza error si _onFiltroChange es null', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters._onFiltroChange = null;
      expect(function() {
        filters.onComercialChange('comercial1@test.com');
      }).not.toThrow();
    });
  });

  describe('getEmailsFiltrados (Req 5.1, 5.3)', function() {
    it('ambos "Todos" (estado default) → retorna null', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      var result = filters.getEmailsFiltrados(usuarios);
      expect(result).toBeNull();
    });

    it('comercial seleccionado → retorna array con solo ese email', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onComercialChange('comercial1@test.com');
      var result = filters.getEmailsFiltrados(usuarios);
      expect(result).toEqual(['comercial1@test.com']);
    });

    it('director seleccionado, comercial "Todos" → retorna emails de comerciales del director', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onDirectorChange('director1@test.com');
      var result = filters.getEmailsFiltrados(usuarios);
      expect(result).toContain('comercial1@test.com');
      expect(result).toContain('comercial2@test.com');
      expect(result).not.toContain('consultor1@test.com'); // pertenece a director2
      expect(result).not.toContain('comercial-inactivo@test.com');
    });

    it('director2 seleccionado → retorna emails de comerciales del director2', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters.onDirectorChange('director2@test.com');
      var result = filters.getEmailsFiltrados(usuarios);
      expect(result).toEqual(['consultor1@test.com']);
    });

    it('DIRECTOR logueado sin selección → retorna null (sin filtro adicional)', function() {
      filters.render('DIRECTOR', usuarios, 'director1@test.com');
      var result = filters.getEmailsFiltrados(usuarios);
      expect(result).toBeNull();
    });

    it('comercial seleccionado prevalece sobre director seleccionado', function() {
      filters.render('GERENTE', usuarios, 'gerente@test.com');
      filters._state.director = 'director1@test.com';
      filters._state.comercial = 'comercial2@test.com';
      var result = filters.getEmailsFiltrados(usuarios);
      expect(result).toEqual(['comercial2@test.com']);
    });

    it('director sin comerciales → retorna array vacío', function() {
      var sinComerciales = [
        { email: 'gerente@test.com', nombre: 'Gerente', rol: 'GERENTE', emailDirector: '', emailGerente: '', activo: true },
        { email: 'dir-solo@test.com', nombre: 'Dir Solo', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente@test.com', activo: true }
      ];
      filters.render('GERENTE', sinComerciales, 'gerente@test.com');
      filters.onDirectorChange('dir-solo@test.com');
      var result = filters.getEmailsFiltrados(sinComerciales);
      expect(result).toEqual([]);
    });
  });

  describe('Seguridad (XSS prevention)', function() {
    it('escapa HTML en nombres de directores', function() {
      var maliciousUsers = [
        { email: 'evil@test.com', nombre: '<script>alert("xss")</script>', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente@test.com', activo: true }
      ];
      var html = filters.render('GERENTE', maliciousUsers, 'gerente@test.com');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapa caracteres especiales en emails', function() {
      var maliciousUsers = [
        { email: '" onclick="alert(1)"', nombre: 'Hacker', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente@test.com', activo: true }
      ];
      var html = filters.render('GERENTE', maliciousUsers, 'gerente@test.com');
      expect(html).not.toContain('" onclick="');
      expect(html).toContain('&quot;');
    });
  });

  describe('_getVisibilidad', function() {
    it('retorna "ambos" para GERENTE', function() {
      expect(filters._getVisibilidad('GERENTE')).toBe('ambos');
    });

    it('retorna "ambos" para ADMIN', function() {
      expect(filters._getVisibilidad('ADMIN')).toBe('ambos');
    });

    it('retorna "ambos" para ASESOR', function() {
      expect(filters._getVisibilidad('ASESOR')).toBe('ambos');
    });

    it('retorna "solo-comercial" para DIRECTOR', function() {
      expect(filters._getVisibilidad('DIRECTOR')).toBe('solo-comercial');
    });

    it('retorna "oculto" para CONSULTOR', function() {
      expect(filters._getVisibilidad('CONSULTOR')).toBe('oculto');
    });

    it('retorna "oculto" para COMERCIAL', function() {
      expect(filters._getVisibilidad('COMERCIAL')).toBe('oculto');
    });

    it('retorna "oculto" para AUXILIAR', function() {
      expect(filters._getVisibilidad('AUXILIAR')).toBe('oculto');
    });

    it('retorna "oculto" para ANALISTA', function() {
      expect(filters._getVisibilidad('ANALISTA')).toBe('oculto');
    });

    it('retorna "oculto" para rol null o undefined', function() {
      expect(filters._getVisibilidad(null)).toBe('oculto');
      expect(filters._getVisibilidad(undefined)).toBe('oculto');
    });
  });

  describe('_getDirectoresVisibles — Filtrado jerárquico (Req 2.1, 2.2)', function() {
    it('GERENTE → solo directores cuyo emailGerente === email del gerente', function() {
      var directores = filters._getDirectoresVisibles('GERENTE', 'gerente@test.com', usuarios);
      var emails = directores.map(function(d) { return d.email; });
      expect(emails).toContain('director1@test.com');
      expect(emails).toContain('director2@test.com');
      expect(emails).not.toContain('director-inactivo@test.com');
    });

    it('GERENTE → no ve directores de otro gerente', function() {
      var otroGerente = [
        { email: 'director-otro@test.com', nombre: 'Director Otro', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'otro-gerente@test.com', activo: true },
        { email: 'director-mio@test.com', nombre: 'Director Mio', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'mi-gerente@test.com', activo: true }
      ];
      var directores = filters._getDirectoresVisibles('GERENTE', 'mi-gerente@test.com', otroGerente);
      expect(directores).toHaveLength(1);
      expect(directores[0].email).toBe('director-mio@test.com');
    });

    it('GERENTE → excluye directores inactivos de su equipo', function() {
      var conInactivo = [
        { email: 'dir-activo@test.com', nombre: 'Dir Activo', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente@test.com', activo: true },
        { email: 'dir-inactivo@test.com', nombre: 'Dir Inactivo', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente@test.com', activo: false }
      ];
      var directores = filters._getDirectoresVisibles('GERENTE', 'gerente@test.com', conInactivo);
      expect(directores).toHaveLength(1);
      expect(directores[0].email).toBe('dir-activo@test.com');
    });

    it('ADMIN → ve todos los directores activos sin importar emailGerente', function() {
      var multiGerente = [
        { email: 'dir-a@test.com', nombre: 'Dir A', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente1@test.com', activo: true },
        { email: 'dir-b@test.com', nombre: 'Dir B', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente2@test.com', activo: true },
        { email: 'dir-inactivo@test.com', nombre: 'Dir Inactivo', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente1@test.com', activo: false }
      ];
      var directores = filters._getDirectoresVisibles('ADMIN', 'admin@test.com', multiGerente);
      expect(directores).toHaveLength(2);
      var emails = directores.map(function(d) { return d.email; });
      expect(emails).toContain('dir-a@test.com');
      expect(emails).toContain('dir-b@test.com');
    });

    it('ASESOR → ve todos los directores activos (mismo que ADMIN)', function() {
      var directores = filters._getDirectoresVisibles('ASESOR', 'asesor@test.com', usuarios);
      var emails = directores.map(function(d) { return d.email; });
      expect(emails).toContain('director1@test.com');
      expect(emails).toContain('director2@test.com');
      expect(emails).not.toContain('director-inactivo@test.com');
    });

    it('Comparación de email es case-insensitive', function() {
      var caseMix = [
        { email: 'dir@test.com', nombre: 'Dir', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'GERENTE@Test.Com', activo: true }
      ];
      var directores = filters._getDirectoresVisibles('GERENTE', 'gerente@test.com', caseMix);
      expect(directores).toHaveLength(1);
    });

    it('usuarios null retorna array vacío', function() {
      var directores = filters._getDirectoresVisibles('GERENTE', 'gerente@test.com', null);
      expect(directores).toEqual([]);
    });

    it('usuarios vacío retorna array vacío', function() {
      var directores = filters._getDirectoresVisibles('GERENTE', 'gerente@test.com', []);
      expect(directores).toEqual([]);
    });
  });

  describe('_getComercialesVisibles — Filtrado por director y cascada (Req 3.1, 3.2, 3.3)', function() {
    it('Director seleccionado → comerciales de ese director activos', function() {
      var comerciales = filters._getComercialesVisibles('director1@test.com', 'GERENTE', 'gerente@test.com', usuarios);
      var emails = comerciales.map(function(c) { return c.email; });
      expect(emails).toContain('comercial1@test.com');
      expect(emails).toContain('comercial2@test.com');
      expect(emails).not.toContain('consultor1@test.com'); // pertenece a director2
      expect(emails).not.toContain('comercial-inactivo@test.com'); // inactivo
    });

    it('Director seleccionado → incluye CONSULTOR si emailDirector coincide', function() {
      var comerciales = filters._getComercialesVisibles('director2@test.com', 'GERENTE', 'gerente@test.com', usuarios);
      var emails = comerciales.map(function(c) { return c.email; });
      expect(emails).toContain('consultor1@test.com');
      expect(emails).not.toContain('comercial1@test.com');
    });

    it('"Todos" para GERENTE → comerciales transitivos a través de directores del gerente', function() {
      var comerciales = filters._getComercialesVisibles(null, 'GERENTE', 'gerente@test.com', usuarios);
      var emails = comerciales.map(function(c) { return c.email; });
      // Comerciales activos de director1 y director2 (ambos son del gerente)
      expect(emails).toContain('comercial1@test.com');
      expect(emails).toContain('comercial2@test.com');
      expect(emails).toContain('consultor1@test.com');
      expect(emails).not.toContain('comercial-inactivo@test.com');
    });

    it('"Todos" para GERENTE → no incluye comerciales de directores de otro gerente', function() {
      var extendidos = [
        ...usuarios,
        { email: 'director-otro@test.com', nombre: 'Director Otro', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'otro-gerente@test.com', activo: true },
        { email: 'comercial-otro@test.com', nombre: 'Comercial Otro', rol: 'COMERCIAL', emailDirector: 'director-otro@test.com', emailGerente: 'otro-gerente@test.com', activo: true }
      ];
      var comerciales = filters._getComercialesVisibles(null, 'GERENTE', 'gerente@test.com', extendidos);
      var emails = comerciales.map(function(c) { return c.email; });
      expect(emails).not.toContain('comercial-otro@test.com');
    });

    it('"Todos" para GERENTE → excluye comerciales de directores inactivos', function() {
      // director-inactivo es del gerente pero activo=false
      // No debería incluir comerciales de ese director
      var conComercialDeDirInactivo = [
        ...usuarios,
        { email: 'com-de-inactivo@test.com', nombre: 'Com Dir Inactivo', rol: 'COMERCIAL', emailDirector: 'director-inactivo@test.com', emailGerente: 'gerente@test.com', activo: true }
      ];
      var comerciales = filters._getComercialesVisibles(null, 'GERENTE', 'gerente@test.com', conComercialDeDirInactivo);
      var emails = comerciales.map(function(c) { return c.email; });
      expect(emails).not.toContain('com-de-inactivo@test.com');
    });

    it('DIRECTOR → comerciales cuyo emailDirector === su email', function() {
      var comerciales = filters._getComercialesVisibles(null, 'DIRECTOR', 'director1@test.com', usuarios);
      var emails = comerciales.map(function(c) { return c.email; });
      expect(emails).toContain('comercial1@test.com');
      expect(emails).toContain('comercial2@test.com');
      expect(emails).not.toContain('consultor1@test.com'); // pertenece a director2
      expect(emails).not.toContain('comercial-inactivo@test.com');
    });

    it('ADMIN con "Todos" → todos los comerciales activos', function() {
      var comerciales = filters._getComercialesVisibles(null, 'ADMIN', 'admin@test.com', usuarios);
      var emails = comerciales.map(function(c) { return c.email; });
      expect(emails).toContain('comercial1@test.com');
      expect(emails).toContain('comercial2@test.com');
      expect(emails).toContain('consultor1@test.com');
      expect(emails).not.toContain('comercial-inactivo@test.com');
    });

    it('ASESOR con "Todos" → todos los comerciales activos', function() {
      var comerciales = filters._getComercialesVisibles(null, 'ASESOR', 'asesor@test.com', usuarios);
      var emails = comerciales.map(function(c) { return c.email; });
      expect(emails).toContain('comercial1@test.com');
      expect(emails).toContain('comercial2@test.com');
      expect(emails).toContain('consultor1@test.com');
      expect(emails).not.toContain('comercial-inactivo@test.com');
    });

    it('ADMIN con director seleccionado → filtra por ese director', function() {
      var comerciales = filters._getComercialesVisibles('director2@test.com', 'ADMIN', 'admin@test.com', usuarios);
      var emails = comerciales.map(function(c) { return c.email; });
      expect(emails).toContain('consultor1@test.com');
      expect(emails).not.toContain('comercial1@test.com');
    });

    it('Comparación de emailDirector es case-insensitive', function() {
      var caseMix = [
        { email: 'com1@test.com', nombre: 'Com1', rol: 'COMERCIAL', emailDirector: 'Director1@Test.Com', emailGerente: '', activo: true }
      ];
      var comerciales = filters._getComercialesVisibles('director1@test.com', 'GERENTE', 'gerente@test.com', caseMix);
      expect(comerciales).toHaveLength(1);
    });

    it('usuarios null retorna array vacío', function() {
      var comerciales = filters._getComercialesVisibles(null, 'GERENTE', 'gerente@test.com', null);
      expect(comerciales).toEqual([]);
    });

    it('Director seleccionado sin comerciales retorna array vacío', function() {
      var sinComerciales = [
        { email: 'dir-solo@test.com', nombre: 'Dir Solo', rol: 'DIRECTOR', emailDirector: '', emailGerente: 'gerente@test.com', activo: true }
      ];
      var comerciales = filters._getComercialesVisibles('dir-solo@test.com', 'GERENTE', 'gerente@test.com', sinComerciales);
      expect(comerciales).toEqual([]);
    });
  });
});
