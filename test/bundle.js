(function () {
  'use strict';

  function globals(defs) {
    defs('EPSG:4326', "+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees");
    defs('EPSG:4269', "+title=NAD83 (long/lat) +proj=longlat +a=6378137.0 +b=6356752.31414036 +ellps=GRS80 +datum=NAD83 +units=degrees");
    defs('EPSG:3857', "+title=WGS 84 / Pseudo-Mercator +proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs");

    defs.WGS84 = defs['EPSG:4326'];
    defs['EPSG:3785'] = defs['EPSG:3857']; // maintain backward compat, official code is 3857
    defs.GOOGLE = defs['EPSG:3857'];
    defs['EPSG:900913'] = defs['EPSG:3857'];
    defs['EPSG:102113'] = defs['EPSG:3857'];
  }

  var PJD_3PARAM = 1;
  var PJD_7PARAM = 2;
  var PJD_GRIDSHIFT = 3;
  var PJD_WGS84 = 4; // WGS84 or equivalent
  var PJD_NODATUM = 5; // WGS84 or equivalent
  var SRS_WGS84_SEMIMAJOR = 6378137.0;  // only used in grid shift transforms
  var SRS_WGS84_SEMIMINOR = 6356752.314;  // only used in grid shift transforms
  var SRS_WGS84_ESQUARED = 0.0066943799901413165; // only used in grid shift transforms
  var SEC_TO_RAD = 4.84813681109535993589914102357e-6;
  var HALF_PI = Math.PI/2;
  // ellipoid pj_set_ell.c
  var SIXTH = 0.1666666666666666667;
  /* 1/6 */
  var RA4 = 0.04722222222222222222;
  /* 17/360 */
  var RA6 = 0.02215608465608465608;
  var EPSLN = 1.0e-10;
  // you'd think you could use Number.EPSILON above but that makes
  // Mollweide get into an infinate loop.

  var D2R$1 = 0.01745329251994329577;
  var R2D = 57.29577951308232088;
  var FORTPI = Math.PI/4;
  var TWO_PI = Math.PI * 2;
  // SPI is slightly greater than Math.PI, so values that exceed the -180..180
  // degree range by a tiny amount don't get wrapped. This prevents points that
  // have drifted from their original location along the 180th meridian (due to
  // floating point error) from changing their sign.
  var SPI = 3.14159265359;

  var exports$3 = {};

  exports$3.greenwich = 0.0; //"0dE",
  exports$3.lisbon = -9.131906111111; //"9d07'54.862\"W",
  exports$3.paris = 2.337229166667; //"2d20'14.025\"E",
  exports$3.bogota = -74.080916666667; //"74d04'51.3\"W",
  exports$3.madrid = -3.687938888889; //"3d41'16.58\"W",
  exports$3.rome = 12.452333333333; //"12d27'8.4\"E",
  exports$3.bern = 7.439583333333; //"7d26'22.5\"E",
  exports$3.jakarta = 106.807719444444; //"106d48'27.79\"E",
  exports$3.ferro = -17.666666666667; //"17d40'W",
  exports$3.brussels = 4.367975; //"4d22'4.71\"E",
  exports$3.stockholm = 18.058277777778; //"18d3'29.8\"E",
  exports$3.athens = 23.7163375; //"23d42'58.815\"E",
  exports$3.oslo = 10.722916666667; //"10d43'22.5\"E"

  var units = {
    ft: {to_meter: 0.3048},
    'us-ft': {to_meter: 1200 / 3937}
  };

  var ignoredChar = /[\s_\-\/\(\)]/g;
  function match(obj, key) {
    if (obj[key]) {
      return obj[key];
    }
    var keys = Object.keys(obj);
    var lkey = key.toLowerCase().replace(ignoredChar, '');
    var i = -1;
    var testkey, processedKey;
    while (++i < keys.length) {
      testkey = keys[i];
      processedKey = testkey.toLowerCase().replace(ignoredChar, '');
      if (processedKey === lkey) {
        return obj[testkey];
      }
    }
  }

  function projStr(defData) {
    var self = {};
    var paramObj = defData.split('+').map(function(v) {
      return v.trim();
    }).filter(function(a) {
      return a;
    }).reduce(function(p, a) {
      var split = a.split('=');
      split.push(true);
      p[split[0].toLowerCase()] = split[1];
      return p;
    }, {});
    var paramName, paramVal, paramOutname;
    var params = {
      proj: 'projName',
      datum: 'datumCode',
      rf: function(v) {
        self.rf = parseFloat(v);
      },
      lat_0: function(v) {
        self.lat0 = v * D2R$1;
      },
      lat_1: function(v) {
        self.lat1 = v * D2R$1;
      },
      lat_2: function(v) {
        self.lat2 = v * D2R$1;
      },
      lat_ts: function(v) {
        self.lat_ts = v * D2R$1;
      },
      lon_0: function(v) {
        self.long0 = v * D2R$1;
      },
      lon_1: function(v) {
        self.long1 = v * D2R$1;
      },
      lon_2: function(v) {
        self.long2 = v * D2R$1;
      },
      alpha: function(v) {
        self.alpha = parseFloat(v) * D2R$1;
      },
      gamma: function(v) {
        self.rectified_grid_angle = parseFloat(v);
      },
      lonc: function(v) {
        self.longc = v * D2R$1;
      },
      x_0: function(v) {
        self.x0 = parseFloat(v);
      },
      y_0: function(v) {
        self.y0 = parseFloat(v);
      },
      k_0: function(v) {
        self.k0 = parseFloat(v);
      },
      k: function(v) {
        self.k0 = parseFloat(v);
      },
      a: function(v) {
        self.a = parseFloat(v);
      },
      b: function(v) {
        self.b = parseFloat(v);
      },
      r_a: function() {
        self.R_A = true;
      },
      zone: function(v) {
        self.zone = parseInt(v, 10);
      },
      south: function() {
        self.utmSouth = true;
      },
      towgs84: function(v) {
        self.datum_params = v.split(",").map(function(a) {
          return parseFloat(a);
        });
      },
      to_meter: function(v) {
        self.to_meter = parseFloat(v);
      },
      units: function(v) {
        self.units = v;
        var unit = match(units, v);
        if (unit) {
          self.to_meter = unit.to_meter;
        }
      },
      from_greenwich: function(v) {
        self.from_greenwich = v * D2R$1;
      },
      pm: function(v) {
        var pm = match(exports$3, v);
        self.from_greenwich = (pm ? pm : parseFloat(v)) * D2R$1;
      },
      nadgrids: function(v) {
        if (v === '@null') {
          self.datumCode = 'none';
        }
        else {
          self.nadgrids = v;
        }
      },
      axis: function(v) {
        var legalAxis = "ewnsud";
        if (v.length === 3 && legalAxis.indexOf(v.substr(0, 1)) !== -1 && legalAxis.indexOf(v.substr(1, 1)) !== -1 && legalAxis.indexOf(v.substr(2, 1)) !== -1) {
          self.axis = v;
        }
      },
      approx: function() {
        self.approx = true;
      }
    };
    for (paramName in paramObj) {
      paramVal = paramObj[paramName];
      if (paramName in params) {
        paramOutname = params[paramName];
        if (typeof paramOutname === 'function') {
          paramOutname(paramVal);
        }
        else {
          self[paramOutname] = paramVal;
        }
      }
      else {
        self[paramName] = paramVal;
      }
    }
    if(typeof self.datumCode === 'string' && self.datumCode !== "WGS84"){
      self.datumCode = self.datumCode.toLowerCase();
    }
    return self;
  }

  var NEUTRAL = 1;
  var KEYWORD = 2;
  var NUMBER = 3;
  var QUOTED = 4;
  var AFTERQUOTE = 5;
  var ENDED = -1;
  var whitespace = /\s/;
  var latin = /[A-Za-z]/;
  var keyword = /[A-Za-z84_]/;
  var endThings = /[,\]]/;
  var digets = /[\d\.E\-\+]/;
  // const ignoredChar = /[\s_\-\/\(\)]/g;
  function Parser(text) {
    if (typeof text !== 'string') {
      throw new Error('not a string');
    }
    this.text = text.trim();
    this.level = 0;
    this.place = 0;
    this.root = null;
    this.stack = [];
    this.currentObject = null;
    this.state = NEUTRAL;
  }
  Parser.prototype.readCharicter = function() {
    var char = this.text[this.place++];
    if (this.state !== QUOTED) {
      while (whitespace.test(char)) {
        if (this.place >= this.text.length) {
          return;
        }
        char = this.text[this.place++];
      }
    }
    switch (this.state) {
      case NEUTRAL:
        return this.neutral(char);
      case KEYWORD:
        return this.keyword(char)
      case QUOTED:
        return this.quoted(char);
      case AFTERQUOTE:
        return this.afterquote(char);
      case NUMBER:
        return this.number(char);
      case ENDED:
        return;
    }
  };
  Parser.prototype.afterquote = function(char) {
    if (char === '"') {
      this.word += '"';
      this.state = QUOTED;
      return;
    }
    if (endThings.test(char)) {
      this.word = this.word.trim();
      this.afterItem(char);
      return;
    }
    throw new Error('havn\'t handled "' +char + '" in afterquote yet, index ' + this.place);
  };
  Parser.prototype.afterItem = function(char) {
    if (char === ',') {
      if (this.word !== null) {
        this.currentObject.push(this.word);
      }
      this.word = null;
      this.state = NEUTRAL;
      return;
    }
    if (char === ']') {
      this.level--;
      if (this.word !== null) {
        this.currentObject.push(this.word);
        this.word = null;
      }
      this.state = NEUTRAL;
      this.currentObject = this.stack.pop();
      if (!this.currentObject) {
        this.state = ENDED;
      }

      return;
    }
  };
  Parser.prototype.number = function(char) {
    if (digets.test(char)) {
      this.word += char;
      return;
    }
    if (endThings.test(char)) {
      this.word = parseFloat(this.word);
      this.afterItem(char);
      return;
    }
    throw new Error('havn\'t handled "' +char + '" in number yet, index ' + this.place);
  };
  Parser.prototype.quoted = function(char) {
    if (char === '"') {
      this.state = AFTERQUOTE;
      return;
    }
    this.word += char;
    return;
  };
  Parser.prototype.keyword = function(char) {
    if (keyword.test(char)) {
      this.word += char;
      return;
    }
    if (char === '[') {
      var newObjects = [];
      newObjects.push(this.word);
      this.level++;
      if (this.root === null) {
        this.root = newObjects;
      } else {
        this.currentObject.push(newObjects);
      }
      this.stack.push(this.currentObject);
      this.currentObject = newObjects;
      this.state = NEUTRAL;
      return;
    }
    if (endThings.test(char)) {
      this.afterItem(char);
      return;
    }
    throw new Error('havn\'t handled "' +char + '" in keyword yet, index ' + this.place);
  };
  Parser.prototype.neutral = function(char) {
    if (latin.test(char)) {
      this.word = char;
      this.state = KEYWORD;
      return;
    }
    if (char === '"') {
      this.word = '';
      this.state = QUOTED;
      return;
    }
    if (digets.test(char)) {
      this.word = char;
      this.state = NUMBER;
      return;
    }
    if (endThings.test(char)) {
      this.afterItem(char);
      return;
    }
    throw new Error('havn\'t handled "' +char + '" in neutral yet, index ' + this.place);
  };
  Parser.prototype.output = function() {
    while (this.place < this.text.length) {
      this.readCharicter();
    }
    if (this.state === ENDED) {
      return this.root;
    }
    throw new Error('unable to parse string "' +this.text + '". State is ' + this.state);
  };

  function parseString(txt) {
    var parser = new Parser(txt);
    return parser.output();
  }

  function mapit(obj, key, value) {
    if (Array.isArray(key)) {
      value.unshift(key);
      key = null;
    }
    var thing = key ? {} : obj;

    var out = value.reduce(function(newObj, item) {
      sExpr(item, newObj);
      return newObj
    }, thing);
    if (key) {
      obj[key] = out;
    }
  }

  function sExpr(v, obj) {
    if (!Array.isArray(v)) {
      obj[v] = true;
      return;
    }
    var key = v.shift();
    if (key === 'PARAMETER') {
      key = v.shift();
    }
    if (v.length === 1) {
      if (Array.isArray(v[0])) {
        obj[key] = {};
        sExpr(v[0], obj[key]);
        return;
      }
      obj[key] = v[0];
      return;
    }
    if (!v.length) {
      obj[key] = true;
      return;
    }
    if (key === 'TOWGS84') {
      obj[key] = v;
      return;
    }
    if (key === 'AXIS') {
      if (!(key in obj)) {
        obj[key] = [];
      }
      obj[key].push(v);
      return;
    }
    if (!Array.isArray(key)) {
      obj[key] = {};
    }

    var i;
    switch (key) {
      case 'UNIT':
      case 'PRIMEM':
      case 'VERT_DATUM':
        obj[key] = {
          name: v[0].toLowerCase(),
          convert: v[1]
        };
        if (v.length === 3) {
          sExpr(v[2], obj[key]);
        }
        return;
      case 'SPHEROID':
      case 'ELLIPSOID':
        obj[key] = {
          name: v[0],
          a: v[1],
          rf: v[2]
        };
        if (v.length === 4) {
          sExpr(v[3], obj[key]);
        }
        return;
      case 'PROJECTEDCRS':
      case 'PROJCRS':
      case 'GEOGCS':
      case 'GEOCCS':
      case 'PROJCS':
      case 'LOCAL_CS':
      case 'GEODCRS':
      case 'GEODETICCRS':
      case 'GEODETICDATUM':
      case 'EDATUM':
      case 'ENGINEERINGDATUM':
      case 'VERT_CS':
      case 'VERTCRS':
      case 'VERTICALCRS':
      case 'COMPD_CS':
      case 'COMPOUNDCRS':
      case 'ENGINEERINGCRS':
      case 'ENGCRS':
      case 'FITTED_CS':
      case 'LOCAL_DATUM':
      case 'DATUM':
        v[0] = ['name', v[0]];
        mapit(obj, key, v);
        return;
      default:
        i = -1;
        while (++i < v.length) {
          if (!Array.isArray(v[i])) {
            return sExpr(v, obj[key]);
          }
        }
        return mapit(obj, key, v);
    }
  }

  var D2R = 0.01745329251994329577;



  function rename(obj, params) {
    var outName = params[0];
    var inName = params[1];
    if (!(outName in obj) && (inName in obj)) {
      obj[outName] = obj[inName];
      if (params.length === 3) {
        obj[outName] = params[2](obj[outName]);
      }
    }
  }

  function d2r(input) {
    return input * D2R;
  }

  function cleanWKT(wkt) {
    if (wkt.type === 'GEOGCS') {
      wkt.projName = 'longlat';
    } else if (wkt.type === 'LOCAL_CS') {
      wkt.projName = 'identity';
      wkt.local = true;
    } else {
      if (typeof wkt.PROJECTION === 'object') {
        wkt.projName = Object.keys(wkt.PROJECTION)[0];
      } else {
        wkt.projName = wkt.PROJECTION;
      }
    }
    if (wkt.AXIS) {
      var axisOrder = '';
      for (var i = 0, ii = wkt.AXIS.length; i < ii; ++i) {
        var axis = [wkt.AXIS[i][0].toLowerCase(), wkt.AXIS[i][1].toLowerCase()];
        if (axis[0].indexOf('north') !== -1 || ((axis[0] === 'y' || axis[0] === 'lat') && axis[1] === 'north')) {
          axisOrder += 'n';
        } else if (axis[0].indexOf('south') !== -1 || ((axis[0] === 'y' || axis[0] === 'lat') && axis[1] === 'south')) {
          axisOrder += 's';
        } else if (axis[0].indexOf('east') !== -1 || ((axis[0] === 'x' || axis[0] === 'lon') && axis[1] === 'east')) {
          axisOrder += 'e';
        } else if (axis[0].indexOf('west') !== -1 || ((axis[0] === 'x' || axis[0] === 'lon') && axis[1] === 'west')) {
          axisOrder += 'w';
        }
      }
      if (axisOrder.length === 2) {
        axisOrder += 'u';
      }
      if (axisOrder.length === 3) {
        wkt.axis = axisOrder;
      }
    }
    if (wkt.UNIT) {
      wkt.units = wkt.UNIT.name.toLowerCase();
      if (wkt.units === 'metre') {
        wkt.units = 'meter';
      }
      if (wkt.UNIT.convert) {
        if (wkt.type === 'GEOGCS') {
          if (wkt.DATUM && wkt.DATUM.SPHEROID) {
            wkt.to_meter = wkt.UNIT.convert*wkt.DATUM.SPHEROID.a;
          }
        } else {
          wkt.to_meter = wkt.UNIT.convert;
        }
      }
    }
    var geogcs = wkt.GEOGCS;
    if (wkt.type === 'GEOGCS') {
      geogcs = wkt;
    }
    if (geogcs) {
      //if(wkt.GEOGCS.PRIMEM&&wkt.GEOGCS.PRIMEM.convert){
      //  wkt.from_greenwich=wkt.GEOGCS.PRIMEM.convert*D2R;
      //}
      if (geogcs.DATUM) {
        wkt.datumCode = geogcs.DATUM.name.toLowerCase();
      } else {
        wkt.datumCode = geogcs.name.toLowerCase();
      }
      if (wkt.datumCode.slice(0, 2) === 'd_') {
        wkt.datumCode = wkt.datumCode.slice(2);
      }
      if (wkt.datumCode === 'new_zealand_geodetic_datum_1949' || wkt.datumCode === 'new_zealand_1949') {
        wkt.datumCode = 'nzgd49';
      }
      if (wkt.datumCode === 'wgs_1984' || wkt.datumCode === 'world_geodetic_system_1984') {
        if (wkt.PROJECTION === 'Mercator_Auxiliary_Sphere') {
          wkt.sphere = true;
        }
        wkt.datumCode = 'wgs84';
      }
      if (wkt.datumCode.slice(-6) === '_ferro') {
        wkt.datumCode = wkt.datumCode.slice(0, - 6);
      }
      if (wkt.datumCode.slice(-8) === '_jakarta') {
        wkt.datumCode = wkt.datumCode.slice(0, - 8);
      }
      if (~wkt.datumCode.indexOf('belge')) {
        wkt.datumCode = 'rnb72';
      }
      if (geogcs.DATUM && geogcs.DATUM.SPHEROID) {
        wkt.ellps = geogcs.DATUM.SPHEROID.name.replace('_19', '').replace(/[Cc]larke\_18/, 'clrk');
        if (wkt.ellps.toLowerCase().slice(0, 13) === 'international') {
          wkt.ellps = 'intl';
        }

        wkt.a = geogcs.DATUM.SPHEROID.a;
        wkt.rf = parseFloat(geogcs.DATUM.SPHEROID.rf, 10);
      }

      if (geogcs.DATUM && geogcs.DATUM.TOWGS84) {
        wkt.datum_params = geogcs.DATUM.TOWGS84;
      }
      if (~wkt.datumCode.indexOf('osgb_1936')) {
        wkt.datumCode = 'osgb36';
      }
      if (~wkt.datumCode.indexOf('osni_1952')) {
        wkt.datumCode = 'osni52';
      }
      if (~wkt.datumCode.indexOf('tm65')
        || ~wkt.datumCode.indexOf('geodetic_datum_of_1965')) {
        wkt.datumCode = 'ire65';
      }
      if (wkt.datumCode === 'ch1903+') {
        wkt.datumCode = 'ch1903';
      }
      if (~wkt.datumCode.indexOf('israel')) {
        wkt.datumCode = 'isr93';
      }
    }
    if (wkt.b && !isFinite(wkt.b)) {
      wkt.b = wkt.a;
    }

    function toMeter(input) {
      var ratio = wkt.to_meter || 1;
      return input * ratio;
    }
    var renamer = function(a) {
      return rename(wkt, a);
    };
    var list = [
      ['standard_parallel_1', 'Standard_Parallel_1'],
      ['standard_parallel_1', 'Latitude of 1st standard parallel'],
      ['standard_parallel_2', 'Standard_Parallel_2'],
      ['standard_parallel_2', 'Latitude of 2nd standard parallel'],
      ['false_easting', 'False_Easting'],
      ['false_easting', 'False easting'],
      ['false-easting', 'Easting at false origin'],
      ['false_northing', 'False_Northing'],
      ['false_northing', 'False northing'],
      ['false_northing', 'Northing at false origin'],
      ['central_meridian', 'Central_Meridian'],
      ['central_meridian', 'Longitude of natural origin'],
      ['central_meridian', 'Longitude of false origin'],
      ['latitude_of_origin', 'Latitude_Of_Origin'],
      ['latitude_of_origin', 'Central_Parallel'],
      ['latitude_of_origin', 'Latitude of natural origin'],
      ['latitude_of_origin', 'Latitude of false origin'],
      ['scale_factor', 'Scale_Factor'],
      ['k0', 'scale_factor'],
      ['latitude_of_center', 'Latitude_Of_Center'],
      ['latitude_of_center', 'Latitude_of_center'],
      ['lat0', 'latitude_of_center', d2r],
      ['longitude_of_center', 'Longitude_Of_Center'],
      ['longitude_of_center', 'Longitude_of_center'],
      ['longc', 'longitude_of_center', d2r],
      ['x0', 'false_easting', toMeter],
      ['y0', 'false_northing', toMeter],
      ['long0', 'central_meridian', d2r],
      ['lat0', 'latitude_of_origin', d2r],
      ['lat0', 'standard_parallel_1', d2r],
      ['lat1', 'standard_parallel_1', d2r],
      ['lat2', 'standard_parallel_2', d2r],
      ['azimuth', 'Azimuth'],
      ['alpha', 'azimuth', d2r],
      ['srsCode', 'name']
    ];
    list.forEach(renamer);
    if (!wkt.long0 && wkt.longc && (wkt.projName === 'Albers_Conic_Equal_Area' || wkt.projName === 'Lambert_Azimuthal_Equal_Area')) {
      wkt.long0 = wkt.longc;
    }
    if (!wkt.lat_ts && wkt.lat1 && (wkt.projName === 'Stereographic_South_Pole' || wkt.projName === 'Polar Stereographic (variant B)')) {
      wkt.lat0 = d2r(wkt.lat1 > 0 ? 90 : -90);
      wkt.lat_ts = wkt.lat1;
    } else if (!wkt.lat_ts && wkt.lat0 && wkt.projName === 'Polar_Stereographic') {
      wkt.lat_ts = wkt.lat0;
      wkt.lat0 = d2r(wkt.lat0 > 0 ? 90 : -90);
    }
  }
  function wkt(wkt) {
    var lisp = parseString(wkt);
    var type = lisp.shift();
    var name = lisp.shift();
    lisp.unshift(['name', name]);
    lisp.unshift(['type', type]);
    var obj = {};
    sExpr(lisp, obj);
    cleanWKT(obj);
    return obj;
  }

  function defs(name) {
    /*global console*/
    var that = this;
    if (arguments.length === 2) {
      var def = arguments[1];
      if (typeof def === 'string') {
        if (def.charAt(0) === '+') {
          defs[name] = projStr(arguments[1]);
        }
        else {
          defs[name] = wkt(arguments[1]);
        }
      } else {
        defs[name] = def;
      }
    }
    else if (arguments.length === 1) {
      if (Array.isArray(name)) {
        return name.map(function(v) {
          if (Array.isArray(v)) {
            defs.apply(that, v);
          }
          else {
            defs(v);
          }
        });
      }
      else if (typeof name === 'string') {
        if (name in defs) {
          return defs[name];
        }
      }
      else if ('EPSG' in name) {
        defs['EPSG:' + name.EPSG] = name;
      }
      else if ('ESRI' in name) {
        defs['ESRI:' + name.ESRI] = name;
      }
      else if ('IAU2000' in name) {
        defs['IAU2000:' + name.IAU2000] = name;
      }
      else {
        console.log(name);
      }
      return;
    }


  }
  globals(defs);

  function testObj(code){
    return typeof code === 'string';
  }
  function testDef(code){
    return code in defs;
  }
  var codeWords = ['PROJECTEDCRS', 'PROJCRS', 'GEOGCS','GEOCCS','PROJCS','LOCAL_CS', 'GEODCRS', 'GEODETICCRS', 'GEODETICDATUM', 'ENGCRS', 'ENGINEERINGCRS'];
  function testWKT(code){
    return codeWords.some(function (word) {
      return code.indexOf(word) > -1;
    });
  }
  var codes = ['3857', '900913', '3785', '102113'];
  function checkMercator(item) {
    var auth = match(item, 'authority');
    if (!auth) {
      return;
    }
    var code = match(auth, 'epsg');
    return code && codes.indexOf(code) > -1;
  }
  function checkProjStr(item) {
    var ext = match(item, 'extension');
    if (!ext) {
      return;
    }
    return match(ext, 'proj4');
  }
  function testProj(code){
    return code[0] === '+';
  }
  function parse(code){
    if (testObj(code)) {
      //check to see if this is a WKT string
      if (testDef(code)) {
        return defs[code];
      }
      if (testWKT(code)) {
        var out = wkt(code);
        // test of spetial case, due to this being a very common and often malformed
        if (checkMercator(out)) {
          return defs['EPSG:3857'];
        }
        var maybeProjStr = checkProjStr(out);
        if (maybeProjStr) {
          return projStr(maybeProjStr);
        }
        return out;
      }
      if (testProj(code)) {
        return projStr(code);
      }
    }else {
      return code;
    }
  }

  function extend(destination, source) {
    destination = destination || {};
    var value, property;
    if (!source) {
      return destination;
    }
    for (property in source) {
      value = source[property];
      if (value !== undefined) {
        destination[property] = value;
      }
    }
    return destination;
  }

  function msfnz(eccent, sinphi, cosphi) {
    var con = eccent * sinphi;
    return cosphi / (Math.sqrt(1 - con * con));
  }

  function sign(x) {
    return x<0 ? -1 : 1;
  }

  function adjust_lon(x) {
    return (Math.abs(x) <= SPI) ? x : (x - (sign(x) * TWO_PI));
  }

  function tsfnz(eccent, phi, sinphi) {
    var con = eccent * sinphi;
    var com = 0.5 * eccent;
    con = Math.pow(((1 - con) / (1 + con)), com);
    return (Math.tan(0.5 * (HALF_PI - phi)) / con);
  }

  function phi2z(eccent, ts) {
    var eccnth = 0.5 * eccent;
    var con, dphi;
    var phi = HALF_PI - 2 * Math.atan(ts);
    for (var i = 0; i <= 15; i++) {
      con = eccent * Math.sin(phi);
      dphi = HALF_PI - 2 * Math.atan(ts * (Math.pow(((1 - con) / (1 + con)), eccnth))) - phi;
      phi += dphi;
      if (Math.abs(dphi) <= 0.0000000001) {
        return phi;
      }
    }
    //console.log("phi2z has NoConvergence");
    return -9999;
  }

  function init$v() {
    var con = this.b / this.a;
    this.es = 1 - con * con;
    if(!('x0' in this)){
      this.x0 = 0;
    }
    if(!('y0' in this)){
      this.y0 = 0;
    }
    this.e = Math.sqrt(this.es);
    if (this.lat_ts) {
      if (this.sphere) {
        this.k0 = Math.cos(this.lat_ts);
      }
      else {
        this.k0 = msfnz(this.e, Math.sin(this.lat_ts), Math.cos(this.lat_ts));
      }
    }
    else {
      if (!this.k0) {
        if (this.k) {
          this.k0 = this.k;
        }
        else {
          this.k0 = 1;
        }
      }
    }
  }

  /* Mercator forward equations--mapping lat,long to x,y
    --------------------------------------------------*/

  function forward$u(p) {
    var lon = p.x;
    var lat = p.y;
    // convert to radians
    if (lat * R2D > 90 && lat * R2D < -90 && lon * R2D > 180 && lon * R2D < -180) {
      return null;
    }

    var x, y;
    if (Math.abs(Math.abs(lat) - HALF_PI) <= EPSLN) {
      return null;
    }
    else {
      if (this.sphere) {
        x = this.x0 + this.a * this.k0 * adjust_lon(lon - this.long0);
        y = this.y0 + this.a * this.k0 * Math.log(Math.tan(FORTPI + 0.5 * lat));
      }
      else {
        var sinphi = Math.sin(lat);
        var ts = tsfnz(this.e, lat, sinphi);
        x = this.x0 + this.a * this.k0 * adjust_lon(lon - this.long0);
        y = this.y0 - this.a * this.k0 * Math.log(ts);
      }
      p.x = x;
      p.y = y;
      return p;
    }
  }

  /* Mercator inverse equations--mapping x,y to lat/long
    --------------------------------------------------*/
  function inverse$u(p) {

    var x = p.x - this.x0;
    var y = p.y - this.y0;
    var lon, lat;

    if (this.sphere) {
      lat = HALF_PI - 2 * Math.atan(Math.exp(-y / (this.a * this.k0)));
    }
    else {
      var ts = Math.exp(-y / (this.a * this.k0));
      lat = phi2z(this.e, ts);
      if (lat === -9999) {
        return null;
      }
    }
    lon = adjust_lon(this.long0 + x / (this.a * this.k0));

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$w = ["Mercator", "Popular Visualisation Pseudo Mercator", "Mercator_1SP", "Mercator_Auxiliary_Sphere", "merc"];
  var merc = {
    init: init$v,
    forward: forward$u,
    inverse: inverse$u,
    names: names$w
  };

  function init$u() {
    //no-op for longlat
  }

  function identity(pt) {
    return pt;
  }
  var names$v = ["longlat", "identity"];
  var longlat = {
    init: init$u,
    forward: identity,
    inverse: identity,
    names: names$v
  };

  var projs = [merc, longlat];
  var names$u = {};
  var projStore = [];

  function add(proj, i) {
    var len = projStore.length;
    if (!proj.names) {
      console.log(i);
      return true;
    }
    projStore[len] = proj;
    proj.names.forEach(function(n) {
      names$u[n.toLowerCase()] = len;
    });
    return this;
  }

  function get$1(name) {
    if (!name) {
      return false;
    }
    var n = name.toLowerCase();
    if (typeof names$u[n] !== 'undefined' && projStore[names$u[n]]) {
      return projStore[names$u[n]];
    }
  }

  function start() {
    projs.forEach(add);
  }
  var projections = {
    start: start,
    add: add,
    get: get$1
  };

  var exports$2 = {};
  exports$2.MERIT = {
    a: 6378137.0,
    rf: 298.257,
    ellipseName: "MERIT 1983"
  };

  exports$2.SGS85 = {
    a: 6378136.0,
    rf: 298.257,
    ellipseName: "Soviet Geodetic System 85"
  };

  exports$2.GRS80 = {
    a: 6378137.0,
    rf: 298.257222101,
    ellipseName: "GRS 1980(IUGG, 1980)"
  };

  exports$2.IAU76 = {
    a: 6378140.0,
    rf: 298.257,
    ellipseName: "IAU 1976"
  };

  exports$2.airy = {
    a: 6377563.396,
    b: 6356256.910,
    ellipseName: "Airy 1830"
  };

  exports$2.APL4 = {
    a: 6378137,
    rf: 298.25,
    ellipseName: "Appl. Physics. 1965"
  };

  exports$2.NWL9D = {
    a: 6378145.0,
    rf: 298.25,
    ellipseName: "Naval Weapons Lab., 1965"
  };

  exports$2.mod_airy = {
    a: 6377340.189,
    b: 6356034.446,
    ellipseName: "Modified Airy"
  };

  exports$2.andrae = {
    a: 6377104.43,
    rf: 300.0,
    ellipseName: "Andrae 1876 (Den., Iclnd.)"
  };

  exports$2.aust_SA = {
    a: 6378160.0,
    rf: 298.25,
    ellipseName: "Australian Natl & S. Amer. 1969"
  };

  exports$2.GRS67 = {
    a: 6378160.0,
    rf: 298.2471674270,
    ellipseName: "GRS 67(IUGG 1967)"
  };

  exports$2.bessel = {
    a: 6377397.155,
    rf: 299.1528128,
    ellipseName: "Bessel 1841"
  };

  exports$2.bess_nam = {
    a: 6377483.865,
    rf: 299.1528128,
    ellipseName: "Bessel 1841 (Namibia)"
  };

  exports$2.clrk66 = {
    a: 6378206.4,
    b: 6356583.8,
    ellipseName: "Clarke 1866"
  };

  exports$2.clrk80 = {
    a: 6378249.145,
    rf: 293.4663,
    ellipseName: "Clarke 1880 mod."
  };

  exports$2.clrk80ign = {
    a: 6378249.2,
    b: 6356515,
    rf: 293.4660213,
    ellipseName: "Clarke 1880 (IGN)"
  };

  exports$2.clrk58 = {
    a: 6378293.645208759,
    rf: 294.2606763692654,
    ellipseName: "Clarke 1858"
  };

  exports$2.CPM = {
    a: 6375738.7,
    rf: 334.29,
    ellipseName: "Comm. des Poids et Mesures 1799"
  };

  exports$2.delmbr = {
    a: 6376428.0,
    rf: 311.5,
    ellipseName: "Delambre 1810 (Belgium)"
  };

  exports$2.engelis = {
    a: 6378136.05,
    rf: 298.2566,
    ellipseName: "Engelis 1985"
  };

  exports$2.evrst30 = {
    a: 6377276.345,
    rf: 300.8017,
    ellipseName: "Everest 1830"
  };

  exports$2.evrst48 = {
    a: 6377304.063,
    rf: 300.8017,
    ellipseName: "Everest 1948"
  };

  exports$2.evrst56 = {
    a: 6377301.243,
    rf: 300.8017,
    ellipseName: "Everest 1956"
  };

  exports$2.evrst69 = {
    a: 6377295.664,
    rf: 300.8017,
    ellipseName: "Everest 1969"
  };

  exports$2.evrstSS = {
    a: 6377298.556,
    rf: 300.8017,
    ellipseName: "Everest (Sabah & Sarawak)"
  };

  exports$2.fschr60 = {
    a: 6378166.0,
    rf: 298.3,
    ellipseName: "Fischer (Mercury Datum) 1960"
  };

  exports$2.fschr60m = {
    a: 6378155.0,
    rf: 298.3,
    ellipseName: "Fischer 1960"
  };

  exports$2.fschr68 = {
    a: 6378150.0,
    rf: 298.3,
    ellipseName: "Fischer 1968"
  };

  exports$2.helmert = {
    a: 6378200.0,
    rf: 298.3,
    ellipseName: "Helmert 1906"
  };

  exports$2.hough = {
    a: 6378270.0,
    rf: 297.0,
    ellipseName: "Hough"
  };

  exports$2.intl = {
    a: 6378388.0,
    rf: 297.0,
    ellipseName: "International 1909 (Hayford)"
  };

  exports$2.kaula = {
    a: 6378163.0,
    rf: 298.24,
    ellipseName: "Kaula 1961"
  };

  exports$2.lerch = {
    a: 6378139.0,
    rf: 298.257,
    ellipseName: "Lerch 1979"
  };

  exports$2.mprts = {
    a: 6397300.0,
    rf: 191.0,
    ellipseName: "Maupertius 1738"
  };

  exports$2.new_intl = {
    a: 6378157.5,
    b: 6356772.2,
    ellipseName: "New International 1967"
  };

  exports$2.plessis = {
    a: 6376523.0,
    rf: 6355863.0,
    ellipseName: "Plessis 1817 (France)"
  };

  exports$2.krass = {
    a: 6378245.0,
    rf: 298.3,
    ellipseName: "Krassovsky, 1942"
  };

  exports$2.SEasia = {
    a: 6378155.0,
    b: 6356773.3205,
    ellipseName: "Southeast Asia"
  };

  exports$2.walbeck = {
    a: 6376896.0,
    b: 6355834.8467,
    ellipseName: "Walbeck"
  };

  exports$2.WGS60 = {
    a: 6378165.0,
    rf: 298.3,
    ellipseName: "WGS 60"
  };

  exports$2.WGS66 = {
    a: 6378145.0,
    rf: 298.25,
    ellipseName: "WGS 66"
  };

  exports$2.WGS7 = {
    a: 6378135.0,
    rf: 298.26,
    ellipseName: "WGS 72"
  };

  var WGS84 = exports$2.WGS84 = {
    a: 6378137.0,
    rf: 298.257223563,
    ellipseName: "WGS 84"
  };

  exports$2.sphere = {
    a: 6370997.0,
    b: 6370997.0,
    ellipseName: "Normal Sphere (r=6370997)"
  };

  function eccentricity(a, b, rf, R_A) {
    var a2 = a * a; // used in geocentric
    var b2 = b * b; // used in geocentric
    var es = (a2 - b2) / a2; // e ^ 2
    var e = 0;
    if (R_A) {
      a *= 1 - es * (SIXTH + es * (RA4 + es * RA6));
      a2 = a * a;
      es = 0;
    } else {
      e = Math.sqrt(es); // eccentricity
    }
    var ep2 = (a2 - b2) / b2; // used in geocentric
    return {
      es: es,
      e: e,
      ep2: ep2
    };
  }
  function sphere(a, b, rf, ellps, sphere) {
    if (!a) { // do we have an ellipsoid?
      var ellipse = match(exports$2, ellps);
      if (!ellipse) {
        ellipse = WGS84;
      }
      a = ellipse.a;
      b = ellipse.b;
      rf = ellipse.rf;
    }

    if (rf && !b) {
      b = (1.0 - 1.0 / rf) * a;
    }
    if (rf === 0 || Math.abs(a - b) < EPSLN) {
      sphere = true;
      b = a;
    }
    return {
      a: a,
      b: b,
      rf: rf,
      sphere: sphere
    };
  }

  var exports$1 = {};
  exports$1.wgs84 = {
    towgs84: "0,0,0",
    ellipse: "WGS84",
    datumName: "WGS84"
  };

  exports$1.ch1903 = {
    towgs84: "674.374,15.056,405.346",
    ellipse: "bessel",
    datumName: "swiss"
  };

  exports$1.ggrs87 = {
    towgs84: "-199.87,74.79,246.62",
    ellipse: "GRS80",
    datumName: "Greek_Geodetic_Reference_System_1987"
  };

  exports$1.nad83 = {
    towgs84: "0,0,0",
    ellipse: "GRS80",
    datumName: "North_American_Datum_1983"
  };

  exports$1.nad27 = {
    nadgrids: "@conus,@alaska,@ntv2_0.gsb,@ntv1_can.dat",
    ellipse: "clrk66",
    datumName: "North_American_Datum_1927"
  };

  exports$1.potsdam = {
    towgs84: "598.1,73.7,418.2,0.202,0.045,-2.455,6.7",
    ellipse: "bessel",
    datumName: "Potsdam Rauenberg 1950 DHDN"
  };

  exports$1.carthage = {
    towgs84: "-263.0,6.0,431.0",
    ellipse: "clark80",
    datumName: "Carthage 1934 Tunisia"
  };

  exports$1.hermannskogel = {
    towgs84: "577.326,90.129,463.919,5.137,1.474,5.297,2.4232",
    ellipse: "bessel",
    datumName: "Hermannskogel"
  };

  exports$1.militargeographische_institut = {
    towgs84: "577.326,90.129,463.919,5.137,1.474,5.297,2.4232",
    ellipse: "bessel",
    datumName: "Militar-Geographische Institut"
  };

  exports$1.osni52 = {
    towgs84: "482.530,-130.596,564.557,-1.042,-0.214,-0.631,8.15",
    ellipse: "airy",
    datumName: "Irish National"
  };

  exports$1.ire65 = {
    towgs84: "482.530,-130.596,564.557,-1.042,-0.214,-0.631,8.15",
    ellipse: "mod_airy",
    datumName: "Ireland 1965"
  };

  exports$1.rassadiran = {
    towgs84: "-133.63,-157.5,-158.62",
    ellipse: "intl",
    datumName: "Rassadiran"
  };

  exports$1.nzgd49 = {
    towgs84: "59.47,-5.04,187.44,0.47,-0.1,1.024,-4.5993",
    ellipse: "intl",
    datumName: "New Zealand Geodetic Datum 1949"
  };

  exports$1.osgb36 = {
    towgs84: "446.448,-125.157,542.060,0.1502,0.2470,0.8421,-20.4894",
    ellipse: "airy",
    datumName: "Airy 1830"
  };

  exports$1.s_jtsk = {
    towgs84: "589,76,480",
    ellipse: 'bessel',
    datumName: 'S-JTSK (Ferro)'
  };

  exports$1.beduaram = {
    towgs84: '-106,-87,188',
    ellipse: 'clrk80',
    datumName: 'Beduaram'
  };

  exports$1.gunung_segara = {
    towgs84: '-403,684,41',
    ellipse: 'bessel',
    datumName: 'Gunung Segara Jakarta'
  };

  exports$1.rnb72 = {
    towgs84: "106.869,-52.2978,103.724,-0.33657,0.456955,-1.84218,1",
    ellipse: "intl",
    datumName: "Reseau National Belge 1972"
  };

  function datum(datumCode, datum_params, a, b, es, ep2, nadgrids) {
    var out = {};

    if (datumCode === undefined || datumCode === 'none') {
      out.datum_type = PJD_NODATUM;
    } else {
      out.datum_type = PJD_WGS84;
    }

    if (datum_params) {
      out.datum_params = datum_params.map(parseFloat);
      if (out.datum_params[0] !== 0 || out.datum_params[1] !== 0 || out.datum_params[2] !== 0) {
        out.datum_type = PJD_3PARAM;
      }
      if (out.datum_params.length > 3) {
        if (out.datum_params[3] !== 0 || out.datum_params[4] !== 0 || out.datum_params[5] !== 0 || out.datum_params[6] !== 0) {
          out.datum_type = PJD_7PARAM;
          out.datum_params[3] *= SEC_TO_RAD;
          out.datum_params[4] *= SEC_TO_RAD;
          out.datum_params[5] *= SEC_TO_RAD;
          out.datum_params[6] = (out.datum_params[6] / 1000000.0) + 1.0;
        }
      }
    }

    if (nadgrids) {
      out.datum_type = PJD_GRIDSHIFT;
      out.grids = nadgrids;
    }
    out.a = a; //datum object also uses these values
    out.b = b;
    out.es = es;
    out.ep2 = ep2;
    return out;
  }

  /**
   * Resources for details of NTv2 file formats:
   * - https://web.archive.org/web/20140127204822if_/http://www.mgs.gov.on.ca:80/stdprodconsume/groups/content/@mgs/@iandit/documents/resourcelist/stel02_047447.pdf
   * - http://mimaka.com/help/gs/html/004_NTV2%20Data%20Format.htm
   */

  var loadedNadgrids = {};

  /**
   * Load a binary NTv2 file (.gsb) to a key that can be used in a proj string like +nadgrids=<key>. Pass the NTv2 file
   * as an ArrayBuffer.
   */
  function nadgrid(key, data) {
    var view = new DataView(data);
    var isLittleEndian = detectLittleEndian(view);
    var header = readHeader(view, isLittleEndian);
    var subgrids = readSubgrids(view, header, isLittleEndian);
    var nadgrid = {header: header, subgrids: subgrids};
    loadedNadgrids[key] = nadgrid;
    return nadgrid;
  }

  /**
   * Given a proj4 value for nadgrids, return an array of loaded grids
   */
  function getNadgrids(nadgrids) {
    // Format details: http://proj.maptools.org/gen_parms.html
    if (nadgrids === undefined) { return null; }
    var grids = nadgrids.split(',');
    return grids.map(parseNadgridString);
  }

  function parseNadgridString(value) {
    if (value.length === 0) {
      return null;
    }
    var optional = value[0] === '@';
    if (optional) {
      value = value.slice(1);
    }
    if (value === 'null') {
      return {name: 'null', mandatory: !optional, grid: null, isNull: true};
    }
    return {
      name: value,
      mandatory: !optional,
      grid: loadedNadgrids[value] || null,
      isNull: false
    };
  }

  function secondsToRadians(seconds) {
    return (seconds / 3600) * Math.PI / 180;
  }

  function detectLittleEndian(view) {
    var nFields = view.getInt32(8, false);
    if (nFields === 11) {
      return false;
    }
    nFields = view.getInt32(8, true);
    if (nFields !== 11) {
      console.warn('Failed to detect nadgrid endian-ness, defaulting to little-endian');
    }
    return true;
  }

  function readHeader(view, isLittleEndian) {
    return {
      nFields: view.getInt32(8, isLittleEndian),
      nSubgridFields: view.getInt32(24, isLittleEndian),
      nSubgrids: view.getInt32(40, isLittleEndian),
      shiftType: decodeString(view, 56, 56 + 8).trim(),
      fromSemiMajorAxis: view.getFloat64(120, isLittleEndian),
      fromSemiMinorAxis: view.getFloat64(136, isLittleEndian),
      toSemiMajorAxis: view.getFloat64(152, isLittleEndian),
      toSemiMinorAxis: view.getFloat64(168, isLittleEndian),
    };
  }

  function decodeString(view, start, end) {
    return String.fromCharCode.apply(null, new Uint8Array(view.buffer.slice(start, end)));
  }

  function readSubgrids(view, header, isLittleEndian) {
    var gridOffset = 176;
    var grids = [];
    for (var i = 0; i < header.nSubgrids; i++) {
      var subHeader = readGridHeader(view, gridOffset, isLittleEndian);
      var nodes = readGridNodes(view, gridOffset, subHeader, isLittleEndian);
      var lngColumnCount = Math.round(
        1 + (subHeader.upperLongitude - subHeader.lowerLongitude) / subHeader.longitudeInterval);
      var latColumnCount = Math.round(
        1 + (subHeader.upperLatitude - subHeader.lowerLatitude) / subHeader.latitudeInterval);
      // Proj4 operates on radians whereas the coordinates are in seconds in the grid
      grids.push({
        ll: [secondsToRadians(subHeader.lowerLongitude), secondsToRadians(subHeader.lowerLatitude)],
        del: [secondsToRadians(subHeader.longitudeInterval), secondsToRadians(subHeader.latitudeInterval)],
        lim: [lngColumnCount, latColumnCount],
        count: subHeader.gridNodeCount,
        cvs: mapNodes(nodes)
      });
      gridOffset += 176 + subHeader.gridNodeCount * 16;
    }
    return grids;
  }

  function mapNodes(nodes) {
    return nodes.map(function (r) {return [secondsToRadians(r.longitudeShift), secondsToRadians(r.latitudeShift)];});
  }

  function readGridHeader(view, offset, isLittleEndian) {
    return {
      name: decodeString(view, offset + 8, offset + 16).trim(),
      parent: decodeString(view, offset + 24, offset + 24 + 8).trim(),
      lowerLatitude: view.getFloat64(offset + 72, isLittleEndian),
      upperLatitude: view.getFloat64(offset + 88, isLittleEndian),
      lowerLongitude: view.getFloat64(offset + 104, isLittleEndian),
      upperLongitude: view.getFloat64(offset + 120, isLittleEndian),
      latitudeInterval: view.getFloat64(offset + 136, isLittleEndian),
      longitudeInterval: view.getFloat64(offset + 152, isLittleEndian),
      gridNodeCount: view.getInt32(offset + 168, isLittleEndian)
    };
  }

  function readGridNodes(view, offset, gridHeader, isLittleEndian) {
    var nodesOffset = offset + 176;
    var gridRecordLength = 16;
    var gridShiftRecords = [];
    for (var i = 0; i < gridHeader.gridNodeCount; i++) {
      var record = {
        latitudeShift: view.getFloat32(nodesOffset + i * gridRecordLength, isLittleEndian),
        longitudeShift: view.getFloat32(nodesOffset + i * gridRecordLength + 4, isLittleEndian),
        latitudeAccuracy: view.getFloat32(nodesOffset + i * gridRecordLength + 8, isLittleEndian),
        longitudeAccuracy: view.getFloat32(nodesOffset + i * gridRecordLength + 12, isLittleEndian),
      };
      gridShiftRecords.push(record);
    }
    return gridShiftRecords;
  }

  function Projection(srsCode,callback) {
    if (!(this instanceof Projection)) {
      return new Projection(srsCode);
    }
    callback = callback || function(error){
      if(error){
        throw error;
      }
    };
    var json = parse(srsCode);
    if(typeof json !== 'object'){
      callback(srsCode);
      return;
    }
    var ourProj = Projection.projections.get(json.projName);
    if(!ourProj){
      callback(srsCode);
      return;
    }
    if (json.datumCode && json.datumCode !== 'none') {
      var datumDef = match(exports$1, json.datumCode);
      if (datumDef) {
        json.datum_params = json.datum_params || (datumDef.towgs84 ? datumDef.towgs84.split(',') : null);
        json.ellps = datumDef.ellipse;
        json.datumName = datumDef.datumName ? datumDef.datumName : json.datumCode;
      }
    }
    json.k0 = json.k0 || 1.0;
    json.axis = json.axis || 'enu';
    json.ellps = json.ellps || 'wgs84';
    json.lat1 = json.lat1 || json.lat0; // Lambert_Conformal_Conic_1SP, for example, needs this

    var sphere_ = sphere(json.a, json.b, json.rf, json.ellps, json.sphere);
    var ecc = eccentricity(sphere_.a, sphere_.b, sphere_.rf, json.R_A);
    var nadgrids = getNadgrids(json.nadgrids);
    var datumObj = json.datum || datum(json.datumCode, json.datum_params, sphere_.a, sphere_.b, ecc.es, ecc.ep2,
      nadgrids);

    extend(this, json); // transfer everything over from the projection because we don't know what we'll need
    extend(this, ourProj); // transfer all the methods from the projection

    // copy the 4 things over we calculated in deriveConstants.sphere
    this.a = sphere_.a;
    this.b = sphere_.b;
    this.rf = sphere_.rf;
    this.sphere = sphere_.sphere;

    // copy the 3 things we calculated in deriveConstants.eccentricity
    this.es = ecc.es;
    this.e = ecc.e;
    this.ep2 = ecc.ep2;

    // add in the datum object
    this.datum = datumObj;

    // init the projection
    this.init();

    // legecy callback from back in the day when it went to spatialreference.org
    callback(null, this);

  }
  Projection.projections = projections;
  Projection.projections.start();

  function compareDatums(source, dest) {
    if (source.datum_type !== dest.datum_type) {
      return false; // false, datums are not equal
    } else if (source.a !== dest.a || Math.abs(source.es - dest.es) > 0.000000000050) {
      // the tolerance for es is to ensure that GRS80 and WGS84
      // are considered identical
      return false;
    } else if (source.datum_type === PJD_3PARAM) {
      return (source.datum_params[0] === dest.datum_params[0] && source.datum_params[1] === dest.datum_params[1] && source.datum_params[2] === dest.datum_params[2]);
    } else if (source.datum_type === PJD_7PARAM) {
      return (source.datum_params[0] === dest.datum_params[0] && source.datum_params[1] === dest.datum_params[1] && source.datum_params[2] === dest.datum_params[2] && source.datum_params[3] === dest.datum_params[3] && source.datum_params[4] === dest.datum_params[4] && source.datum_params[5] === dest.datum_params[5] && source.datum_params[6] === dest.datum_params[6]);
    } else {
      return true; // datums are equal
    }
  } // cs_compare_datums()

  /*
   * The function Convert_Geodetic_To_Geocentric converts geodetic coordinates
   * (latitude, longitude, and height) to geocentric coordinates (X, Y, Z),
   * according to the current ellipsoid parameters.
   *
   *    Latitude  : Geodetic latitude in radians                     (input)
   *    Longitude : Geodetic longitude in radians                    (input)
   *    Height    : Geodetic height, in meters                       (input)
   *    X         : Calculated Geocentric X coordinate, in meters    (output)
   *    Y         : Calculated Geocentric Y coordinate, in meters    (output)
   *    Z         : Calculated Geocentric Z coordinate, in meters    (output)
   *
   */
  function geodeticToGeocentric(p, es, a) {
    var Longitude = p.x;
    var Latitude = p.y;
    var Height = p.z ? p.z : 0; //Z value not always supplied

    var Rn; /*  Earth radius at location  */
    var Sin_Lat; /*  Math.sin(Latitude)  */
    var Sin2_Lat; /*  Square of Math.sin(Latitude)  */
    var Cos_Lat; /*  Math.cos(Latitude)  */

    /*
     ** Don't blow up if Latitude is just a little out of the value
     ** range as it may just be a rounding issue.  Also removed longitude
     ** test, it should be wrapped by Math.cos() and Math.sin().  NFW for PROJ.4, Sep/2001.
     */
    if (Latitude < -HALF_PI && Latitude > -1.001 * HALF_PI) {
      Latitude = -HALF_PI;
    } else if (Latitude > HALF_PI && Latitude < 1.001 * HALF_PI) {
      Latitude = HALF_PI;
    } else if (Latitude < -HALF_PI) {
      /* Latitude out of range */
      //..reportError('geocent:lat out of range:' + Latitude);
      return { x: -Infinity, y: -Infinity, z: p.z };
    } else if (Latitude > HALF_PI) {
      /* Latitude out of range */
      return { x: Infinity, y: Infinity, z: p.z };
    }

    if (Longitude > Math.PI) {
      Longitude -= (2 * Math.PI);
    }
    Sin_Lat = Math.sin(Latitude);
    Cos_Lat = Math.cos(Latitude);
    Sin2_Lat = Sin_Lat * Sin_Lat;
    Rn = a / (Math.sqrt(1.0e0 - es * Sin2_Lat));
    return {
      x: (Rn + Height) * Cos_Lat * Math.cos(Longitude),
      y: (Rn + Height) * Cos_Lat * Math.sin(Longitude),
      z: ((Rn * (1 - es)) + Height) * Sin_Lat
    };
  } // cs_geodetic_to_geocentric()

  function geocentricToGeodetic(p, es, a, b) {
    /* local defintions and variables */
    /* end-criterium of loop, accuracy of sin(Latitude) */
    var genau = 1e-12;
    var genau2 = (genau * genau);
    var maxiter = 30;

    var P; /* distance between semi-minor axis and location */
    var RR; /* distance between center and location */
    var CT; /* sin of geocentric latitude */
    var ST; /* cos of geocentric latitude */
    var RX;
    var RK;
    var RN; /* Earth radius at location */
    var CPHI0; /* cos of start or old geodetic latitude in iterations */
    var SPHI0; /* sin of start or old geodetic latitude in iterations */
    var CPHI; /* cos of searched geodetic latitude */
    var SPHI; /* sin of searched geodetic latitude */
    var SDPHI; /* end-criterium: addition-theorem of sin(Latitude(iter)-Latitude(iter-1)) */
    var iter; /* # of continous iteration, max. 30 is always enough (s.a.) */

    var X = p.x;
    var Y = p.y;
    var Z = p.z ? p.z : 0.0; //Z value not always supplied
    var Longitude;
    var Latitude;
    var Height;

    P = Math.sqrt(X * X + Y * Y);
    RR = Math.sqrt(X * X + Y * Y + Z * Z);

    /*      special cases for latitude and longitude */
    if (P / a < genau) {

      /*  special case, if P=0. (X=0., Y=0.) */
      Longitude = 0.0;

      /*  if (X,Y,Z)=(0.,0.,0.) then Height becomes semi-minor axis
       *  of ellipsoid (=center of mass), Latitude becomes PI/2 */
      if (RR / a < genau) {
        Latitude = HALF_PI;
        Height = -b;
        return {
          x: p.x,
          y: p.y,
          z: p.z
        };
      }
    } else {
      /*  ellipsoidal (geodetic) longitude
       *  interval: -PI < Longitude <= +PI */
      Longitude = Math.atan2(Y, X);
    }

    /* --------------------------------------------------------------
     * Following iterative algorithm was developped by
     * "Institut for Erdmessung", University of Hannover, July 1988.
     * Internet: www.ife.uni-hannover.de
     * Iterative computation of CPHI,SPHI and Height.
     * Iteration of CPHI and SPHI to 10**-12 radian resp.
     * 2*10**-7 arcsec.
     * --------------------------------------------------------------
     */
    CT = Z / RR;
    ST = P / RR;
    RX = 1.0 / Math.sqrt(1.0 - es * (2.0 - es) * ST * ST);
    CPHI0 = ST * (1.0 - es) * RX;
    SPHI0 = CT * RX;
    iter = 0;

    /* loop to find sin(Latitude) resp. Latitude
     * until |sin(Latitude(iter)-Latitude(iter-1))| < genau */
    do {
      iter++;
      RN = a / Math.sqrt(1.0 - es * SPHI0 * SPHI0);

      /*  ellipsoidal (geodetic) height */
      Height = P * CPHI0 + Z * SPHI0 - RN * (1.0 - es * SPHI0 * SPHI0);

      RK = es * RN / (RN + Height);
      RX = 1.0 / Math.sqrt(1.0 - RK * (2.0 - RK) * ST * ST);
      CPHI = ST * (1.0 - RK) * RX;
      SPHI = CT * RX;
      SDPHI = SPHI * CPHI0 - CPHI * SPHI0;
      CPHI0 = CPHI;
      SPHI0 = SPHI;
    }
    while (SDPHI * SDPHI > genau2 && iter < maxiter);

    /*      ellipsoidal (geodetic) latitude */
    Latitude = Math.atan(SPHI / Math.abs(CPHI));
    return {
      x: Longitude,
      y: Latitude,
      z: Height
    };
  } // cs_geocentric_to_geodetic()

  /****************************************************************/
  // pj_geocentic_to_wgs84( p )
  //  p = point to transform in geocentric coordinates (x,y,z)


  /** point object, nothing fancy, just allows values to be
      passed back and forth by reference rather than by value.
      Other point classes may be used as long as they have
      x and y properties, which will get modified in the transform method.
  */
  function geocentricToWgs84(p, datum_type, datum_params) {

    if (datum_type === PJD_3PARAM) {
      // if( x[io] === HUGE_VAL )
      //    continue;
      return {
        x: p.x + datum_params[0],
        y: p.y + datum_params[1],
        z: p.z + datum_params[2],
      };
    } else if (datum_type === PJD_7PARAM) {
      var Dx_BF = datum_params[0];
      var Dy_BF = datum_params[1];
      var Dz_BF = datum_params[2];
      var Rx_BF = datum_params[3];
      var Ry_BF = datum_params[4];
      var Rz_BF = datum_params[5];
      var M_BF = datum_params[6];
      // if( x[io] === HUGE_VAL )
      //    continue;
      return {
        x: M_BF * (p.x - Rz_BF * p.y + Ry_BF * p.z) + Dx_BF,
        y: M_BF * (Rz_BF * p.x + p.y - Rx_BF * p.z) + Dy_BF,
        z: M_BF * (-Ry_BF * p.x + Rx_BF * p.y + p.z) + Dz_BF
      };
    }
  } // cs_geocentric_to_wgs84

  /****************************************************************/
  // pj_geocentic_from_wgs84()
  //  coordinate system definition,
  //  point to transform in geocentric coordinates (x,y,z)
  function geocentricFromWgs84(p, datum_type, datum_params) {

    if (datum_type === PJD_3PARAM) {
      //if( x[io] === HUGE_VAL )
      //    continue;
      return {
        x: p.x - datum_params[0],
        y: p.y - datum_params[1],
        z: p.z - datum_params[2],
      };

    } else if (datum_type === PJD_7PARAM) {
      var Dx_BF = datum_params[0];
      var Dy_BF = datum_params[1];
      var Dz_BF = datum_params[2];
      var Rx_BF = datum_params[3];
      var Ry_BF = datum_params[4];
      var Rz_BF = datum_params[5];
      var M_BF = datum_params[6];
      var x_tmp = (p.x - Dx_BF) / M_BF;
      var y_tmp = (p.y - Dy_BF) / M_BF;
      var z_tmp = (p.z - Dz_BF) / M_BF;
      //if( x[io] === HUGE_VAL )
      //    continue;

      return {
        x: x_tmp + Rz_BF * y_tmp - Ry_BF * z_tmp,
        y: -Rz_BF * x_tmp + y_tmp + Rx_BF * z_tmp,
        z: Ry_BF * x_tmp - Rx_BF * y_tmp + z_tmp
      };
    } //cs_geocentric_from_wgs84()
  }

  function checkParams(type) {
    return (type === PJD_3PARAM || type === PJD_7PARAM);
  }

  function datum_transform(source, dest, point) {
    // Short cut if the datums are identical.
    if (compareDatums(source, dest)) {
      return point; // in this case, zero is sucess,
      // whereas cs_compare_datums returns 1 to indicate TRUE
      // confusing, should fix this
    }

    // Explicitly skip datum transform by setting 'datum=none' as parameter for either source or dest
    if (source.datum_type === PJD_NODATUM || dest.datum_type === PJD_NODATUM) {
      return point;
    }

    // If this datum requires grid shifts, then apply it to geodetic coordinates.
    var source_a = source.a;
    var source_es = source.es;
    if (source.datum_type === PJD_GRIDSHIFT) {
      var gridShiftCode = applyGridShift(source, false, point);
      if (gridShiftCode !== 0) {
        return undefined;
      }
      source_a = SRS_WGS84_SEMIMAJOR;
      source_es = SRS_WGS84_ESQUARED;
    }

    var dest_a = dest.a;
    var dest_b = dest.b;
    var dest_es = dest.es;
    if (dest.datum_type === PJD_GRIDSHIFT) {
      dest_a = SRS_WGS84_SEMIMAJOR;
      dest_b = SRS_WGS84_SEMIMINOR;
      dest_es = SRS_WGS84_ESQUARED;
    }

    // Do we need to go through geocentric coordinates?
    if (source_es === dest_es && source_a === dest_a && !checkParams(source.datum_type) &&  !checkParams(dest.datum_type)) {
      return point;
    }

    // Convert to geocentric coordinates.
    point = geodeticToGeocentric(point, source_es, source_a);
    // Convert between datums
    if (checkParams(source.datum_type)) {
      point = geocentricToWgs84(point, source.datum_type, source.datum_params);
    }
    if (checkParams(dest.datum_type)) {
      point = geocentricFromWgs84(point, dest.datum_type, dest.datum_params);
    }
    point = geocentricToGeodetic(point, dest_es, dest_a, dest_b);

    if (dest.datum_type === PJD_GRIDSHIFT) {
      var destGridShiftResult = applyGridShift(dest, true, point);
      if (destGridShiftResult !== 0) {
        return undefined;
      }
    }

    return point;
  }

  function applyGridShift(source, inverse, point) {
    if (source.grids === null || source.grids.length === 0) {
      console.log('Grid shift grids not found');
      return -1;
    }
    var input = {x: -point.x, y: point.y};
    var output = {x: Number.NaN, y: Number.NaN};
    var attemptedGrids = [];
    outer:
    for (var i = 0; i < source.grids.length; i++) {
      var grid = source.grids[i];
      attemptedGrids.push(grid.name);
      if (grid.isNull) {
        output = input;
        break;
      }
      grid.mandatory;
      if (grid.grid === null) {
        if (grid.mandatory) {
          console.log("Unable to find mandatory grid '" + grid.name + "'");
          return -1;
        }
        continue;
      }
      var subgrids = grid.grid.subgrids;
      for (var j = 0, jj = subgrids.length; j < jj; j++) {
        var subgrid = subgrids[j];
        // skip tables that don't match our point at all
        var epsilon = (Math.abs(subgrid.del[1]) + Math.abs(subgrid.del[0])) / 10000.0;
        var minX = subgrid.ll[0] - epsilon;
        var minY = subgrid.ll[1] - epsilon;
        var maxX = subgrid.ll[0] + (subgrid.lim[0] - 1) * subgrid.del[0] + epsilon;
        var maxY = subgrid.ll[1] + (subgrid.lim[1] - 1) * subgrid.del[1] + epsilon;
        if (minY > input.y || minX > input.x || maxY < input.y || maxX < input.x ) {
          continue;
        }
        output = applySubgridShift(input, inverse, subgrid);
        if (!isNaN(output.x)) {
          break outer;
        }
      }
    }
    if (isNaN(output.x)) {
      console.log("Failed to find a grid shift table for location '"+
        -input.x * R2D + " " + input.y * R2D + " tried: '" + attemptedGrids + "'");
      return -1;
    }
    point.x = -output.x;
    point.y = output.y;
    return 0;
  }

  function applySubgridShift(pin, inverse, ct) {
    var val = {x: Number.NaN, y: Number.NaN};
    if (isNaN(pin.x)) { return val; }
    var tb = {x: pin.x, y: pin.y};
    tb.x -= ct.ll[0];
    tb.y -= ct.ll[1];
    tb.x = adjust_lon(tb.x - Math.PI) + Math.PI;
    var t = nadInterpolate(tb, ct);
    if (inverse) {
      if (isNaN(t.x)) {
        return val;
      }
      t.x = tb.x - t.x;
      t.y = tb.y - t.y;
      var i = 9, tol = 1e-12;
      var dif, del;
      do {
        del = nadInterpolate(t, ct);
        if (isNaN(del.x)) {
          console.log("Inverse grid shift iteration failed, presumably at grid edge.  Using first approximation.");
          break;
        }
        dif = {x: tb.x - (del.x + t.x), y: tb.y - (del.y + t.y)};
        t.x += dif.x;
        t.y += dif.y;
      } while (i-- && Math.abs(dif.x) > tol && Math.abs(dif.y) > tol);
      if (i < 0) {
        console.log("Inverse grid shift iterator failed to converge.");
        return val;
      }
      val.x = adjust_lon(t.x + ct.ll[0]);
      val.y = t.y + ct.ll[1];
    } else {
      if (!isNaN(t.x)) {
        val.x = pin.x + t.x;
        val.y = pin.y + t.y;
      }
    }
    return val;
  }

  function nadInterpolate(pin, ct) {
    var t = {x: pin.x / ct.del[0], y: pin.y / ct.del[1]};
    var indx = {x: Math.floor(t.x), y: Math.floor(t.y)};
    var frct = {x: t.x - 1.0 * indx.x, y: t.y - 1.0 * indx.y};
    var val= {x: Number.NaN, y: Number.NaN};
    var inx;
    if (indx.x < 0 || indx.x >= ct.lim[0]) {
      return val;
    }
    if (indx.y < 0 || indx.y >= ct.lim[1]) {
      return val;
    }
    inx = (indx.y * ct.lim[0]) + indx.x;
    var f00 = {x: ct.cvs[inx][0], y: ct.cvs[inx][1]};
    inx++;
    var f10= {x: ct.cvs[inx][0], y: ct.cvs[inx][1]};
    inx += ct.lim[0];
    var f11 = {x: ct.cvs[inx][0], y: ct.cvs[inx][1]};
    inx--;
    var f01 = {x: ct.cvs[inx][0], y: ct.cvs[inx][1]};
    var m11 = frct.x * frct.y, m10 = frct.x * (1.0 - frct.y),
      m00 = (1.0 - frct.x) * (1.0 - frct.y), m01 = (1.0 - frct.x) * frct.y;
    val.x = (m00 * f00.x + m10 * f10.x + m01 * f01.x + m11 * f11.x);
    val.y = (m00 * f00.y + m10 * f10.y + m01 * f01.y + m11 * f11.y);
    return val;
  }

  function adjust_axis(crs, denorm, point) {
    var xin = point.x,
      yin = point.y,
      zin = point.z || 0.0;
    var v, t, i;
    var out = {};
    for (i = 0; i < 3; i++) {
      if (denorm && i === 2 && point.z === undefined) {
        continue;
      }
      if (i === 0) {
        v = xin;
        if ("ew".indexOf(crs.axis[i]) !== -1) {
          t = 'x';
        } else {
          t = 'y';
        }

      }
      else if (i === 1) {
        v = yin;
        if ("ns".indexOf(crs.axis[i]) !== -1) {
          t = 'y';
        } else {
          t = 'x';
        }
      }
      else {
        v = zin;
        t = 'z';
      }
      switch (crs.axis[i]) {
      case 'e':
        out[t] = v;
        break;
      case 'w':
        out[t] = -v;
        break;
      case 'n':
        out[t] = v;
        break;
      case 's':
        out[t] = -v;
        break;
      case 'u':
        if (point[t] !== undefined) {
          out.z = v;
        }
        break;
      case 'd':
        if (point[t] !== undefined) {
          out.z = -v;
        }
        break;
      default:
        //console.log("ERROR: unknow axis ("+crs.axis[i]+") - check definition of "+crs.projName);
        return null;
      }
    }
    return out;
  }

  function common (array){
    var out = {
      x: array[0],
      y: array[1]
    };
    if (array.length>2) {
      out.z = array[2];
    }
    if (array.length>3) {
      out.m = array[3];
    }
    return out;
  }

  function checkSanity (point) {
    checkCoord(point.x);
    checkCoord(point.y);
  }
  function checkCoord(num) {
    if (typeof Number.isFinite === 'function') {
      if (Number.isFinite(num)) {
        return;
      }
      throw new TypeError('coordinates must be finite numbers');
    }
    if (typeof num !== 'number' || num !== num || !isFinite(num)) {
      throw new TypeError('coordinates must be finite numbers');
    }
  }

  function checkNotWGS(source, dest) {
    return (
      (source.datum.datum_type === PJD_3PARAM || source.datum.datum_type === PJD_7PARAM || source.datum.datum_type === PJD_GRIDSHIFT) && dest.datumCode !== 'WGS84') ||
      ((dest.datum.datum_type === PJD_3PARAM || dest.datum.datum_type === PJD_7PARAM || dest.datum.datum_type === PJD_GRIDSHIFT) && source.datumCode !== 'WGS84');
  }

  function transform(source, dest, point, enforceAxis) {
    var wgs84;
    if (Array.isArray(point)) {
      point = common(point);
    } else {
      // Clone the point object so inputs don't get modified
      point = {
        x: point.x,
        y: point.y,
        z: point.z,
        m: point.m
      };
    }
    var hasZ = point.z !== undefined;
    checkSanity(point);
    // Workaround for datum shifts towgs84, if either source or destination projection is not wgs84
    if (source.datum && dest.datum && checkNotWGS(source, dest)) {
      wgs84 = new Projection('WGS84');
      point = transform(source, wgs84, point, enforceAxis);
      source = wgs84;
    }
    // DGR, 2010/11/12
    if (enforceAxis && source.axis !== 'enu') {
      point = adjust_axis(source, false, point);
    }
    // Transform source points to long/lat, if they aren't already.
    if (source.projName === 'longlat') {
      point = {
        x: point.x * D2R$1,
        y: point.y * D2R$1,
        z: point.z || 0
      };
    } else {
      if (source.to_meter) {
        point = {
          x: point.x * source.to_meter,
          y: point.y * source.to_meter,
          z: point.z || 0
        };
      }
      point = source.inverse(point); // Convert Cartesian to longlat
      if (!point) {
        return;
      }
    }
    // Adjust for the prime meridian if necessary
    if (source.from_greenwich) {
      point.x += source.from_greenwich;
    }

    // Convert datums if needed, and if possible.
    point = datum_transform(source.datum, dest.datum, point);
    if (!point) {
      return;
    }

    // Adjust for the prime meridian if necessary
    if (dest.from_greenwich) {
      point = {
        x: point.x - dest.from_greenwich,
        y: point.y,
        z: point.z || 0
      };
    }

    if (dest.projName === 'longlat') {
      // convert radians to decimal degrees
      point = {
        x: point.x * R2D,
        y: point.y * R2D,
        z: point.z || 0
      };
    } else { // else project
      point = dest.forward(point);
      if (dest.to_meter) {
        point = {
          x: point.x / dest.to_meter,
          y: point.y / dest.to_meter,
          z: point.z || 0
        };
      }
    }

    // DGR, 2010/11/12
    if (enforceAxis && dest.axis !== 'enu') {
      return adjust_axis(dest, true, point);
    }

    if (point && !hasZ) {
      delete point.z;
    }
    return point;
  }

  var wgs84 = Projection('WGS84');

  function transformer(from, to, coords, enforceAxis) {
    var transformedArray, out, keys;
    if (Array.isArray(coords)) {
      transformedArray = transform(from, to, coords, enforceAxis) || {x: NaN, y: NaN};
      if (coords.length > 2) {
        if ((typeof from.name !== 'undefined' && from.name === 'geocent') || (typeof to.name !== 'undefined' && to.name === 'geocent')) {
          if (typeof transformedArray.z === 'number') {
            return [transformedArray.x, transformedArray.y, transformedArray.z].concat(coords.splice(3));
          } else {
            return [transformedArray.x, transformedArray.y, coords[2]].concat(coords.splice(3));
          }
        } else {
          return [transformedArray.x, transformedArray.y].concat(coords.splice(2));
        }
      } else {
        return [transformedArray.x, transformedArray.y];
      }
    } else {
      out = transform(from, to, coords, enforceAxis);
      keys = Object.keys(coords);
      if (keys.length === 2) {
        return out;
      }
      keys.forEach(function (key) {
        if ((typeof from.name !== 'undefined' && from.name === 'geocent') || (typeof to.name !== 'undefined' && to.name === 'geocent')) {
          if (key === 'x' || key === 'y' || key === 'z') {
            return;
          }
        } else {
          if (key === 'x' || key === 'y') {
            return;
          }
        }
        out[key] = coords[key];
      });
      return out;
    }
  }

  function checkProj(item) {
    if (item instanceof Projection) {
      return item;
    }
    if (item.oProj) {
      return item.oProj;
    }
    return Projection(item);
  }

  function proj4(fromProj, toProj, coord) {
    fromProj = checkProj(fromProj);
    var single = false;
    var obj;
    if (typeof toProj === 'undefined') {
      toProj = fromProj;
      fromProj = wgs84;
      single = true;
    } else if (typeof toProj.x !== 'undefined' || Array.isArray(toProj)) {
      coord = toProj;
      toProj = fromProj;
      fromProj = wgs84;
      single = true;
    }
    toProj = checkProj(toProj);
    if (coord) {
      return transformer(fromProj, toProj, coord);
    } else {
      obj = {
        forward: function (coords, enforceAxis) {
          return transformer(fromProj, toProj, coords, enforceAxis);
        },
        inverse: function (coords, enforceAxis) {
          return transformer(toProj, fromProj, coords, enforceAxis);
        }
      };
      if (single) {
        obj.oProj = toProj;
      }
      return obj;
    }
  }

  /**
   * UTM zones are grouped, and assigned to one of a group of 6
   * sets.
   *
   * {int} @private
   */
  var NUM_100K_SETS = 6;

  /**
   * The column letters (for easting) of the lower left value, per
   * set.
   *
   * {string} @private
   */
  var SET_ORIGIN_COLUMN_LETTERS = 'AJSAJS';

  /**
   * The row letters (for northing) of the lower left value, per
   * set.
   *
   * {string} @private
   */
  var SET_ORIGIN_ROW_LETTERS = 'AFAFAF';

  var A$1 = 65; // A
  var I = 73; // I
  var O = 79; // O
  var V = 86; // V
  var Z = 90; // Z
  var mgrs = {
    forward: forward$t,
    inverse: inverse$t,
    toPoint: toPoint
  };
  /**
   * Conversion of lat/lon to MGRS.
   *
   * @param {object} ll Object literal with lat and lon properties on a
   *     WGS84 ellipsoid.
   * @param {int} accuracy Accuracy in digits (5 for 1 m, 4 for 10 m, 3 for
   *      100 m, 2 for 1000 m or 1 for 10000 m). Optional, default is 5.
   * @return {string} the MGRS string for the given location and accuracy.
   */
  function forward$t(ll, accuracy) {
    accuracy = accuracy || 5; // default accuracy 1m
    return encode(LLtoUTM({
      lat: ll[1],
      lon: ll[0]
    }), accuracy);
  }
  /**
   * Conversion of MGRS to lat/lon.
   *
   * @param {string} mgrs MGRS string.
   * @return {array} An array with left (longitude), bottom (latitude), right
   *     (longitude) and top (latitude) values in WGS84, representing the
   *     bounding box for the provided MGRS reference.
   */
  function inverse$t(mgrs) {
    var bbox = UTMtoLL(decode(mgrs.toUpperCase()));
    if (bbox.lat && bbox.lon) {
      return [bbox.lon, bbox.lat, bbox.lon, bbox.lat];
    }
    return [bbox.left, bbox.bottom, bbox.right, bbox.top];
  }
  function toPoint(mgrs) {
    var bbox = UTMtoLL(decode(mgrs.toUpperCase()));
    if (bbox.lat && bbox.lon) {
      return [bbox.lon, bbox.lat];
    }
    return [(bbox.left + bbox.right) / 2, (bbox.top + bbox.bottom) / 2];
  }/**
   * Conversion from degrees to radians.
   *
   * @private
   * @param {number} deg the angle in degrees.
   * @return {number} the angle in radians.
   */
  function degToRad(deg) {
    return (deg * (Math.PI / 180.0));
  }

  /**
   * Conversion from radians to degrees.
   *
   * @private
   * @param {number} rad the angle in radians.
   * @return {number} the angle in degrees.
   */
  function radToDeg(rad) {
    return (180.0 * (rad / Math.PI));
  }

  /**
   * Converts a set of Longitude and Latitude co-ordinates to UTM
   * using the WGS84 ellipsoid.
   *
   * @private
   * @param {object} ll Object literal with lat and lon properties
   *     representing the WGS84 coordinate to be converted.
   * @return {object} Object literal containing the UTM value with easting,
   *     northing, zoneNumber and zoneLetter properties, and an optional
   *     accuracy property in digits. Returns null if the conversion failed.
   */
  function LLtoUTM(ll) {
    var Lat = ll.lat;
    var Long = ll.lon;
    var a = 6378137.0; //ellip.radius;
    var eccSquared = 0.00669438; //ellip.eccsq;
    var k0 = 0.9996;
    var LongOrigin;
    var eccPrimeSquared;
    var N, T, C, A, M;
    var LatRad = degToRad(Lat);
    var LongRad = degToRad(Long);
    var LongOriginRad;
    var ZoneNumber;
    // (int)
    ZoneNumber = Math.floor((Long + 180) / 6) + 1;

    //Make sure the longitude 180.00 is in Zone 60
    if (Long === 180) {
      ZoneNumber = 60;
    }

    // Special zone for Norway
    if (Lat >= 56.0 && Lat < 64.0 && Long >= 3.0 && Long < 12.0) {
      ZoneNumber = 32;
    }

    // Special zones for Svalbard
    if (Lat >= 72.0 && Lat < 84.0) {
      if (Long >= 0.0 && Long < 9.0) {
        ZoneNumber = 31;
      }
      else if (Long >= 9.0 && Long < 21.0) {
        ZoneNumber = 33;
      }
      else if (Long >= 21.0 && Long < 33.0) {
        ZoneNumber = 35;
      }
      else if (Long >= 33.0 && Long < 42.0) {
        ZoneNumber = 37;
      }
    }

    LongOrigin = (ZoneNumber - 1) * 6 - 180 + 3; //+3 puts origin
    // in middle of
    // zone
    LongOriginRad = degToRad(LongOrigin);

    eccPrimeSquared = (eccSquared) / (1 - eccSquared);

    N = a / Math.sqrt(1 - eccSquared * Math.sin(LatRad) * Math.sin(LatRad));
    T = Math.tan(LatRad) * Math.tan(LatRad);
    C = eccPrimeSquared * Math.cos(LatRad) * Math.cos(LatRad);
    A = Math.cos(LatRad) * (LongRad - LongOriginRad);

    M = a * ((1 - eccSquared / 4 - 3 * eccSquared * eccSquared / 64 - 5 * eccSquared * eccSquared * eccSquared / 256) * LatRad - (3 * eccSquared / 8 + 3 * eccSquared * eccSquared / 32 + 45 * eccSquared * eccSquared * eccSquared / 1024) * Math.sin(2 * LatRad) + (15 * eccSquared * eccSquared / 256 + 45 * eccSquared * eccSquared * eccSquared / 1024) * Math.sin(4 * LatRad) - (35 * eccSquared * eccSquared * eccSquared / 3072) * Math.sin(6 * LatRad));

    var UTMEasting = (k0 * N * (A + (1 - T + C) * A * A * A / 6.0 + (5 - 18 * T + T * T + 72 * C - 58 * eccPrimeSquared) * A * A * A * A * A / 120.0) + 500000.0);

    var UTMNorthing = (k0 * (M + N * Math.tan(LatRad) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24.0 + (61 - 58 * T + T * T + 600 * C - 330 * eccPrimeSquared) * A * A * A * A * A * A / 720.0)));
    if (Lat < 0.0) {
      UTMNorthing += 10000000.0; //10000000 meter offset for
      // southern hemisphere
    }

    return {
      northing: Math.round(UTMNorthing),
      easting: Math.round(UTMEasting),
      zoneNumber: ZoneNumber,
      zoneLetter: getLetterDesignator(Lat)
    };
  }

  /**
   * Converts UTM coords to lat/long, using the WGS84 ellipsoid. This is a convenience
   * class where the Zone can be specified as a single string eg."60N" which
   * is then broken down into the ZoneNumber and ZoneLetter.
   *
   * @private
   * @param {object} utm An object literal with northing, easting, zoneNumber
   *     and zoneLetter properties. If an optional accuracy property is
   *     provided (in meters), a bounding box will be returned instead of
   *     latitude and longitude.
   * @return {object} An object literal containing either lat and lon values
   *     (if no accuracy was provided), or top, right, bottom and left values
   *     for the bounding box calculated according to the provided accuracy.
   *     Returns null if the conversion failed.
   */
  function UTMtoLL(utm) {

    var UTMNorthing = utm.northing;
    var UTMEasting = utm.easting;
    var zoneLetter = utm.zoneLetter;
    var zoneNumber = utm.zoneNumber;
    // check the ZoneNummber is valid
    if (zoneNumber < 0 || zoneNumber > 60) {
      return null;
    }

    var k0 = 0.9996;
    var a = 6378137.0; //ellip.radius;
    var eccSquared = 0.00669438; //ellip.eccsq;
    var eccPrimeSquared;
    var e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
    var N1, T1, C1, R1, D, M;
    var LongOrigin;
    var mu, phi1Rad;

    // remove 500,000 meter offset for longitude
    var x = UTMEasting - 500000.0;
    var y = UTMNorthing;

    // We must know somehow if we are in the Northern or Southern
    // hemisphere, this is the only time we use the letter So even
    // if the Zone letter isn't exactly correct it should indicate
    // the hemisphere correctly
    if (zoneLetter < 'N') {
      y -= 10000000.0; // remove 10,000,000 meter offset used
      // for southern hemisphere
    }

    // There are 60 zones with zone 1 being at West -180 to -174
    LongOrigin = (zoneNumber - 1) * 6 - 180 + 3; // +3 puts origin
    // in middle of
    // zone

    eccPrimeSquared = (eccSquared) / (1 - eccSquared);

    M = y / k0;
    mu = M / (a * (1 - eccSquared / 4 - 3 * eccSquared * eccSquared / 64 - 5 * eccSquared * eccSquared * eccSquared / 256));

    phi1Rad = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu) + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu);
    // double phi1 = ProjMath.radToDeg(phi1Rad);

    N1 = a / Math.sqrt(1 - eccSquared * Math.sin(phi1Rad) * Math.sin(phi1Rad));
    T1 = Math.tan(phi1Rad) * Math.tan(phi1Rad);
    C1 = eccPrimeSquared * Math.cos(phi1Rad) * Math.cos(phi1Rad);
    R1 = a * (1 - eccSquared) / Math.pow(1 - eccSquared * Math.sin(phi1Rad) * Math.sin(phi1Rad), 1.5);
    D = x / (N1 * k0);

    var lat = phi1Rad - (N1 * Math.tan(phi1Rad) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * eccPrimeSquared) * D * D * D * D / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * eccPrimeSquared - 3 * C1 * C1) * D * D * D * D * D * D / 720);
    lat = radToDeg(lat);

    var lon = (D - (1 + 2 * T1 + C1) * D * D * D / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * eccPrimeSquared + 24 * T1 * T1) * D * D * D * D * D / 120) / Math.cos(phi1Rad);
    lon = LongOrigin + radToDeg(lon);

    var result;
    if (utm.accuracy) {
      var topRight = UTMtoLL({
        northing: utm.northing + utm.accuracy,
        easting: utm.easting + utm.accuracy,
        zoneLetter: utm.zoneLetter,
        zoneNumber: utm.zoneNumber
      });
      result = {
        top: topRight.lat,
        right: topRight.lon,
        bottom: lat,
        left: lon
      };
    }
    else {
      result = {
        lat: lat,
        lon: lon
      };
    }
    return result;
  }

  /**
   * Calculates the MGRS letter designator for the given latitude.
   *
   * @private
   * @param {number} lat The latitude in WGS84 to get the letter designator
   *     for.
   * @return {char} The letter designator.
   */
  function getLetterDesignator(lat) {
    //This is here as an error flag to show that the Latitude is
    //outside MGRS limits
    var LetterDesignator = 'Z';

    if ((84 >= lat) && (lat >= 72)) {
      LetterDesignator = 'X';
    }
    else if ((72 > lat) && (lat >= 64)) {
      LetterDesignator = 'W';
    }
    else if ((64 > lat) && (lat >= 56)) {
      LetterDesignator = 'V';
    }
    else if ((56 > lat) && (lat >= 48)) {
      LetterDesignator = 'U';
    }
    else if ((48 > lat) && (lat >= 40)) {
      LetterDesignator = 'T';
    }
    else if ((40 > lat) && (lat >= 32)) {
      LetterDesignator = 'S';
    }
    else if ((32 > lat) && (lat >= 24)) {
      LetterDesignator = 'R';
    }
    else if ((24 > lat) && (lat >= 16)) {
      LetterDesignator = 'Q';
    }
    else if ((16 > lat) && (lat >= 8)) {
      LetterDesignator = 'P';
    }
    else if ((8 > lat) && (lat >= 0)) {
      LetterDesignator = 'N';
    }
    else if ((0 > lat) && (lat >= -8)) {
      LetterDesignator = 'M';
    }
    else if ((-8 > lat) && (lat >= -16)) {
      LetterDesignator = 'L';
    }
    else if ((-16 > lat) && (lat >= -24)) {
      LetterDesignator = 'K';
    }
    else if ((-24 > lat) && (lat >= -32)) {
      LetterDesignator = 'J';
    }
    else if ((-32 > lat) && (lat >= -40)) {
      LetterDesignator = 'H';
    }
    else if ((-40 > lat) && (lat >= -48)) {
      LetterDesignator = 'G';
    }
    else if ((-48 > lat) && (lat >= -56)) {
      LetterDesignator = 'F';
    }
    else if ((-56 > lat) && (lat >= -64)) {
      LetterDesignator = 'E';
    }
    else if ((-64 > lat) && (lat >= -72)) {
      LetterDesignator = 'D';
    }
    else if ((-72 > lat) && (lat >= -80)) {
      LetterDesignator = 'C';
    }
    return LetterDesignator;
  }

  /**
   * Encodes a UTM location as MGRS string.
   *
   * @private
   * @param {object} utm An object literal with easting, northing,
   *     zoneLetter, zoneNumber
   * @param {number} accuracy Accuracy in digits (1-5).
   * @return {string} MGRS string for the given UTM location.
   */
  function encode(utm, accuracy) {
    // prepend with leading zeroes
    var seasting = "00000" + utm.easting,
      snorthing = "00000" + utm.northing;

    return utm.zoneNumber + utm.zoneLetter + get100kID(utm.easting, utm.northing, utm.zoneNumber) + seasting.substr(seasting.length - 5, accuracy) + snorthing.substr(snorthing.length - 5, accuracy);
  }

  /**
   * Get the two letter 100k designator for a given UTM easting,
   * northing and zone number value.
   *
   * @private
   * @param {number} easting
   * @param {number} northing
   * @param {number} zoneNumber
   * @return the two letter 100k designator for the given UTM location.
   */
  function get100kID(easting, northing, zoneNumber) {
    var setParm = get100kSetForZone(zoneNumber);
    var setColumn = Math.floor(easting / 100000);
    var setRow = Math.floor(northing / 100000) % 20;
    return getLetter100kID(setColumn, setRow, setParm);
  }

  /**
   * Given a UTM zone number, figure out the MGRS 100K set it is in.
   *
   * @private
   * @param {number} i An UTM zone number.
   * @return {number} the 100k set the UTM zone is in.
   */
  function get100kSetForZone(i) {
    var setParm = i % NUM_100K_SETS;
    if (setParm === 0) {
      setParm = NUM_100K_SETS;
    }

    return setParm;
  }

  /**
   * Get the two-letter MGRS 100k designator given information
   * translated from the UTM northing, easting and zone number.
   *
   * @private
   * @param {number} column the column index as it relates to the MGRS
   *        100k set spreadsheet, created from the UTM easting.
   *        Values are 1-8.
   * @param {number} row the row index as it relates to the MGRS 100k set
   *        spreadsheet, created from the UTM northing value. Values
   *        are from 0-19.
   * @param {number} parm the set block, as it relates to the MGRS 100k set
   *        spreadsheet, created from the UTM zone. Values are from
   *        1-60.
   * @return two letter MGRS 100k code.
   */
  function getLetter100kID(column, row, parm) {
    // colOrigin and rowOrigin are the letters at the origin of the set
    var index = parm - 1;
    var colOrigin = SET_ORIGIN_COLUMN_LETTERS.charCodeAt(index);
    var rowOrigin = SET_ORIGIN_ROW_LETTERS.charCodeAt(index);

    // colInt and rowInt are the letters to build to return
    var colInt = colOrigin + column - 1;
    var rowInt = rowOrigin + row;
    var rollover = false;

    if (colInt > Z) {
      colInt = colInt - Z + A$1 - 1;
      rollover = true;
    }

    if (colInt === I || (colOrigin < I && colInt > I) || ((colInt > I || colOrigin < I) && rollover)) {
      colInt++;
    }

    if (colInt === O || (colOrigin < O && colInt > O) || ((colInt > O || colOrigin < O) && rollover)) {
      colInt++;

      if (colInt === I) {
        colInt++;
      }
    }

    if (colInt > Z) {
      colInt = colInt - Z + A$1 - 1;
    }

    if (rowInt > V) {
      rowInt = rowInt - V + A$1 - 1;
      rollover = true;
    }
    else {
      rollover = false;
    }

    if (((rowInt === I) || ((rowOrigin < I) && (rowInt > I))) || (((rowInt > I) || (rowOrigin < I)) && rollover)) {
      rowInt++;
    }

    if (((rowInt === O) || ((rowOrigin < O) && (rowInt > O))) || (((rowInt > O) || (rowOrigin < O)) && rollover)) {
      rowInt++;

      if (rowInt === I) {
        rowInt++;
      }
    }

    if (rowInt > V) {
      rowInt = rowInt - V + A$1 - 1;
    }

    var twoLetter = String.fromCharCode(colInt) + String.fromCharCode(rowInt);
    return twoLetter;
  }

  /**
   * Decode the UTM parameters from a MGRS string.
   *
   * @private
   * @param {string} mgrsString an UPPERCASE coordinate string is expected.
   * @return {object} An object literal with easting, northing, zoneLetter,
   *     zoneNumber and accuracy (in meters) properties.
   */
  function decode(mgrsString) {

    if (mgrsString && mgrsString.length === 0) {
      throw ("MGRSPoint coverting from nothing");
    }

    var length = mgrsString.length;

    var hunK = null;
    var sb = "";
    var testChar;
    var i = 0;

    // get Zone number
    while (!(/[A-Z]/).test(testChar = mgrsString.charAt(i))) {
      if (i >= 2) {
        throw ("MGRSPoint bad conversion from: " + mgrsString);
      }
      sb += testChar;
      i++;
    }

    var zoneNumber = parseInt(sb, 10);

    if (i === 0 || i + 3 > length) {
      // A good MGRS string has to be 4-5 digits long,
      // ##AAA/#AAA at least.
      throw ("MGRSPoint bad conversion from: " + mgrsString);
    }

    var zoneLetter = mgrsString.charAt(i++);

    // Should we check the zone letter here? Why not.
    if (zoneLetter <= 'A' || zoneLetter === 'B' || zoneLetter === 'Y' || zoneLetter >= 'Z' || zoneLetter === 'I' || zoneLetter === 'O') {
      throw ("MGRSPoint zone letter " + zoneLetter + " not handled: " + mgrsString);
    }

    hunK = mgrsString.substring(i, i += 2);

    var set = get100kSetForZone(zoneNumber);

    var east100k = getEastingFromChar(hunK.charAt(0), set);
    var north100k = getNorthingFromChar(hunK.charAt(1), set);

    // We have a bug where the northing may be 2000000 too low.
    // How
    // do we know when to roll over?

    while (north100k < getMinNorthing(zoneLetter)) {
      north100k += 2000000;
    }

    // calculate the char index for easting/northing separator
    var remainder = length - i;

    if (remainder % 2 !== 0) {
      throw ("MGRSPoint has to have an even number \nof digits after the zone letter and two 100km letters - front \nhalf for easting meters, second half for \nnorthing meters" + mgrsString);
    }

    var sep = remainder / 2;

    var sepEasting = 0.0;
    var sepNorthing = 0.0;
    var accuracyBonus, sepEastingString, sepNorthingString, easting, northing;
    if (sep > 0) {
      accuracyBonus = 100000.0 / Math.pow(10, sep);
      sepEastingString = mgrsString.substring(i, i + sep);
      sepEasting = parseFloat(sepEastingString) * accuracyBonus;
      sepNorthingString = mgrsString.substring(i + sep);
      sepNorthing = parseFloat(sepNorthingString) * accuracyBonus;
    }

    easting = sepEasting + east100k;
    northing = sepNorthing + north100k;

    return {
      easting: easting,
      northing: northing,
      zoneLetter: zoneLetter,
      zoneNumber: zoneNumber,
      accuracy: accuracyBonus
    };
  }

  /**
   * Given the first letter from a two-letter MGRS 100k zone, and given the
   * MGRS table set for the zone number, figure out the easting value that
   * should be added to the other, secondary easting value.
   *
   * @private
   * @param {char} e The first letter from a two-letter MGRS 100´k zone.
   * @param {number} set The MGRS table set for the zone number.
   * @return {number} The easting value for the given letter and set.
   */
  function getEastingFromChar(e, set) {
    // colOrigin is the letter at the origin of the set for the
    // column
    var curCol = SET_ORIGIN_COLUMN_LETTERS.charCodeAt(set - 1);
    var eastingValue = 100000.0;
    var rewindMarker = false;

    while (curCol !== e.charCodeAt(0)) {
      curCol++;
      if (curCol === I) {
        curCol++;
      }
      if (curCol === O) {
        curCol++;
      }
      if (curCol > Z) {
        if (rewindMarker) {
          throw ("Bad character: " + e);
        }
        curCol = A$1;
        rewindMarker = true;
      }
      eastingValue += 100000.0;
    }

    return eastingValue;
  }

  /**
   * Given the second letter from a two-letter MGRS 100k zone, and given the
   * MGRS table set for the zone number, figure out the northing value that
   * should be added to the other, secondary northing value. You have to
   * remember that Northings are determined from the equator, and the vertical
   * cycle of letters mean a 2000000 additional northing meters. This happens
   * approx. every 18 degrees of latitude. This method does *NOT* count any
   * additional northings. You have to figure out how many 2000000 meters need
   * to be added for the zone letter of the MGRS coordinate.
   *
   * @private
   * @param {char} n Second letter of the MGRS 100k zone
   * @param {number} set The MGRS table set number, which is dependent on the
   *     UTM zone number.
   * @return {number} The northing value for the given letter and set.
   */
  function getNorthingFromChar(n, set) {

    if (n > 'V') {
      throw ("MGRSPoint given invalid Northing " + n);
    }

    // rowOrigin is the letter at the origin of the set for the
    // column
    var curRow = SET_ORIGIN_ROW_LETTERS.charCodeAt(set - 1);
    var northingValue = 0.0;
    var rewindMarker = false;

    while (curRow !== n.charCodeAt(0)) {
      curRow++;
      if (curRow === I) {
        curRow++;
      }
      if (curRow === O) {
        curRow++;
      }
      // fixing a bug making whole application hang in this loop
      // when 'n' is a wrong character
      if (curRow > V) {
        if (rewindMarker) { // making sure that this loop ends
          throw ("Bad character: " + n);
        }
        curRow = A$1;
        rewindMarker = true;
      }
      northingValue += 100000.0;
    }

    return northingValue;
  }

  /**
   * The function getMinNorthing returns the minimum northing value of a MGRS
   * zone.
   *
   * Ported from Geotrans' c Lattitude_Band_Value structure table.
   *
   * @private
   * @param {char} zoneLetter The MGRS zone to get the min northing for.
   * @return {number}
   */
  function getMinNorthing(zoneLetter) {
    var northing;
    switch (zoneLetter) {
    case 'C':
      northing = 1100000.0;
      break;
    case 'D':
      northing = 2000000.0;
      break;
    case 'E':
      northing = 2800000.0;
      break;
    case 'F':
      northing = 3700000.0;
      break;
    case 'G':
      northing = 4600000.0;
      break;
    case 'H':
      northing = 5500000.0;
      break;
    case 'J':
      northing = 6400000.0;
      break;
    case 'K':
      northing = 7300000.0;
      break;
    case 'L':
      northing = 8200000.0;
      break;
    case 'M':
      northing = 9100000.0;
      break;
    case 'N':
      northing = 0.0;
      break;
    case 'P':
      northing = 800000.0;
      break;
    case 'Q':
      northing = 1700000.0;
      break;
    case 'R':
      northing = 2600000.0;
      break;
    case 'S':
      northing = 3500000.0;
      break;
    case 'T':
      northing = 4400000.0;
      break;
    case 'U':
      northing = 5300000.0;
      break;
    case 'V':
      northing = 6200000.0;
      break;
    case 'W':
      northing = 7000000.0;
      break;
    case 'X':
      northing = 7900000.0;
      break;
    default:
      northing = -1.0;
    }
    if (northing >= 0.0) {
      return northing;
    }
    else {
      throw ("Invalid zone letter: " + zoneLetter);
    }

  }

  function Point(x, y, z) {
    if (!(this instanceof Point)) {
      return new Point(x, y, z);
    }
    if (Array.isArray(x)) {
      this.x = x[0];
      this.y = x[1];
      this.z = x[2] || 0.0;
    } else if(typeof x === 'object') {
      this.x = x.x;
      this.y = x.y;
      this.z = x.z || 0.0;
    } else if (typeof x === 'string' && typeof y === 'undefined') {
      var coords = x.split(',');
      this.x = parseFloat(coords[0], 10);
      this.y = parseFloat(coords[1], 10);
      this.z = parseFloat(coords[2], 10) || 0.0;
    } else {
      this.x = x;
      this.y = y;
      this.z = z || 0.0;
    }
    console.warn('proj4.Point will be removed in version 3, use proj4.toPoint');
  }

  Point.fromMGRS = function(mgrsStr) {
    return new Point(toPoint(mgrsStr));
  };
  Point.prototype.toMGRS = function(accuracy) {
    return forward$t([this.x, this.y], accuracy);
  };

  var C00 = 1;
  var C02 = 0.25;
  var C04 = 0.046875;
  var C06 = 0.01953125;
  var C08 = 0.01068115234375;
  var C22 = 0.75;
  var C44 = 0.46875;
  var C46 = 0.01302083333333333333;
  var C48 = 0.00712076822916666666;
  var C66 = 0.36458333333333333333;
  var C68 = 0.00569661458333333333;
  var C88 = 0.3076171875;

  function pj_enfn(es) {
    var en = [];
    en[0] = C00 - es * (C02 + es * (C04 + es * (C06 + es * C08)));
    en[1] = es * (C22 - es * (C04 + es * (C06 + es * C08)));
    var t = es * es;
    en[2] = t * (C44 - es * (C46 + es * C48));
    t *= es;
    en[3] = t * (C66 - es * C68);
    en[4] = t * es * C88;
    return en;
  }

  function pj_mlfn(phi, sphi, cphi, en) {
    cphi *= sphi;
    sphi *= sphi;
    return (en[0] * phi - cphi * (en[1] + sphi * (en[2] + sphi * (en[3] + sphi * en[4]))));
  }

  var MAX_ITER$3 = 20;

  function pj_inv_mlfn(arg, es, en) {
    var k = 1 / (1 - es);
    var phi = arg;
    for (var i = MAX_ITER$3; i; --i) { /* rarely goes over 2 iterations */
      var s = Math.sin(phi);
      var t = 1 - es * s * s;
      //t = this.pj_mlfn(phi, s, Math.cos(phi), en) - arg;
      //phi -= t * (t * Math.sqrt(t)) * k;
      t = (pj_mlfn(phi, s, Math.cos(phi), en) - arg) * (t * Math.sqrt(t)) * k;
      phi -= t;
      if (Math.abs(t) < EPSLN) {
        return phi;
      }
    }
    //..reportError("cass:pj_inv_mlfn: Convergence error");
    return phi;
  }

  // Heavily based on this tmerc projection implementation
  // https://github.com/mbloch/mapshaper-proj/blob/master/src/projections/tmerc.js


  function init$t() {
    this.x0 = this.x0 !== undefined ? this.x0 : 0;
    this.y0 = this.y0 !== undefined ? this.y0 : 0;
    this.long0 = this.long0 !== undefined ? this.long0 : 0;
    this.lat0 = this.lat0 !== undefined ? this.lat0 : 0;

    if (this.es) {
      this.en = pj_enfn(this.es);
      this.ml0 = pj_mlfn(this.lat0, Math.sin(this.lat0), Math.cos(this.lat0), this.en);
    }
  }

  /**
      Transverse Mercator Forward  - long/lat to x/y
      long/lat in radians
    */
  function forward$s(p) {
    var lon = p.x;
    var lat = p.y;

    var delta_lon = adjust_lon(lon - this.long0);
    var con;
    var x, y;
    var sin_phi = Math.sin(lat);
    var cos_phi = Math.cos(lat);

    if (!this.es) {
      var b = cos_phi * Math.sin(delta_lon);

      if ((Math.abs(Math.abs(b) - 1)) < EPSLN) {
        return (93);
      }
      else {
        x = 0.5 * this.a * this.k0 * Math.log((1 + b) / (1 - b)) + this.x0;
        y = cos_phi * Math.cos(delta_lon) / Math.sqrt(1 - Math.pow(b, 2));
        b = Math.abs(y);

        if (b >= 1) {
          if ((b - 1) > EPSLN) {
            return (93);
          }
          else {
            y = 0;
          }
        }
        else {
          y = Math.acos(y);
        }

        if (lat < 0) {
          y = -y;
        }

        y = this.a * this.k0 * (y - this.lat0) + this.y0;
      }
    }
    else {
      var al = cos_phi * delta_lon;
      var als = Math.pow(al, 2);
      var c = this.ep2 * Math.pow(cos_phi, 2);
      var cs = Math.pow(c, 2);
      var tq = Math.abs(cos_phi) > EPSLN ? Math.tan(lat) : 0;
      var t = Math.pow(tq, 2);
      var ts = Math.pow(t, 2);
      con = 1 - this.es * Math.pow(sin_phi, 2);
      al = al / Math.sqrt(con);
      var ml = pj_mlfn(lat, sin_phi, cos_phi, this.en);

      x = this.a * (this.k0 * al * (1 +
        als / 6 * (1 - t + c +
        als / 20 * (5 - 18 * t + ts + 14 * c - 58 * t * c +
        als / 42 * (61 + 179 * ts - ts * t - 479 * t))))) +
        this.x0;

      y = this.a * (this.k0 * (ml - this.ml0 +
        sin_phi * delta_lon * al / 2 * (1 +
        als / 12 * (5 - t + 9 * c + 4 * cs +
        als / 30 * (61 + ts - 58 * t + 270 * c - 330 * t * c +
        als / 56 * (1385 + 543 * ts - ts * t - 3111 * t)))))) +
        this.y0;
    }

    p.x = x;
    p.y = y;

    return p;
  }

  /**
      Transverse Mercator Inverse  -  x/y to long/lat
    */
  function inverse$s(p) {
    var con, phi;
    var lat, lon;
    var x = (p.x - this.x0) * (1 / this.a);
    var y = (p.y - this.y0) * (1 / this.a);

    if (!this.es) {
      var f = Math.exp(x / this.k0);
      var g = 0.5 * (f - 1 / f);
      var temp = this.lat0 + y / this.k0;
      var h = Math.cos(temp);
      con = Math.sqrt((1 - Math.pow(h, 2)) / (1 + Math.pow(g, 2)));
      lat = Math.asin(con);

      if (y < 0) {
        lat = -lat;
      }

      if ((g === 0) && (h === 0)) {
        lon = 0;
      }
      else {
        lon = adjust_lon(Math.atan2(g, h) + this.long0);
      }
    }
    else { // ellipsoidal form
      con = this.ml0 + y / this.k0;
      phi = pj_inv_mlfn(con, this.es, this.en);

      if (Math.abs(phi) < HALF_PI) {
        var sin_phi = Math.sin(phi);
        var cos_phi = Math.cos(phi);
        var tan_phi = Math.abs(cos_phi) > EPSLN ? Math.tan(phi) : 0;
        var c = this.ep2 * Math.pow(cos_phi, 2);
        var cs = Math.pow(c, 2);
        var t = Math.pow(tan_phi, 2);
        var ts = Math.pow(t, 2);
        con = 1 - this.es * Math.pow(sin_phi, 2);
        var d = x * Math.sqrt(con) / this.k0;
        var ds = Math.pow(d, 2);
        con = con * tan_phi;

        lat = phi - (con * ds / (1 - this.es)) * 0.5 * (1 -
          ds / 12 * (5 + 3 * t - 9 * c * t + c - 4 * cs -
          ds / 30 * (61 + 90 * t - 252 * c * t + 45 * ts + 46 * c -
          ds / 56 * (1385 + 3633 * t + 4095 * ts + 1574 * ts * t))));

        lon = adjust_lon(this.long0 + (d * (1 -
          ds / 6 * (1 + 2 * t + c -
          ds / 20 * (5 + 28 * t + 24 * ts + 8 * c * t + 6 * c -
          ds / 42 * (61 + 662 * t + 1320 * ts + 720 * ts * t)))) / cos_phi));
      }
      else {
        lat = HALF_PI * sign(y);
        lon = 0;
      }
    }

    p.x = lon;
    p.y = lat;

    return p;
  }

  var names$t = ["Fast_Transverse_Mercator", "Fast Transverse Mercator"];
  var tmerc = {
    init: init$t,
    forward: forward$s,
    inverse: inverse$s,
    names: names$t
  };

  function sinh(x) {
    var r = Math.exp(x);
    r = (r - 1 / r) / 2;
    return r;
  }

  function hypot(x, y) {
    x = Math.abs(x);
    y = Math.abs(y);
    var a = Math.max(x, y);
    var b = Math.min(x, y) / (a ? a : 1);

    return a * Math.sqrt(1 + Math.pow(b, 2));
  }

  function log1py(x) {
    var y = 1 + x;
    var z = y - 1;

    return z === 0 ? x : x * Math.log(y) / z;
  }

  function asinhy(x) {
    var y = Math.abs(x);
    y = log1py(y * (1 + y / (hypot(1, y) + 1)));

    return x < 0 ? -y : y;
  }

  function gatg(pp, B) {
    var cos_2B = 2 * Math.cos(2 * B);
    var i = pp.length - 1;
    var h1 = pp[i];
    var h2 = 0;
    var h;

    while (--i >= 0) {
      h = -h2 + cos_2B * h1 + pp[i];
      h2 = h1;
      h1 = h;
    }

    return (B + h * Math.sin(2 * B));
  }

  function clens(pp, arg_r) {
    var r = 2 * Math.cos(arg_r);
    var i = pp.length - 1;
    var hr1 = pp[i];
    var hr2 = 0;
    var hr;

    while (--i >= 0) {
      hr = -hr2 + r * hr1 + pp[i];
      hr2 = hr1;
      hr1 = hr;
    }

    return Math.sin(arg_r) * hr;
  }

  function cosh(x) {
    var r = Math.exp(x);
    r = (r + 1 / r) / 2;
    return r;
  }

  function clens_cmplx(pp, arg_r, arg_i) {
    var sin_arg_r = Math.sin(arg_r);
    var cos_arg_r = Math.cos(arg_r);
    var sinh_arg_i = sinh(arg_i);
    var cosh_arg_i = cosh(arg_i);
    var r = 2 * cos_arg_r * cosh_arg_i;
    var i = -2 * sin_arg_r * sinh_arg_i;
    var j = pp.length - 1;
    var hr = pp[j];
    var hi1 = 0;
    var hr1 = 0;
    var hi = 0;
    var hr2;
    var hi2;

    while (--j >= 0) {
      hr2 = hr1;
      hi2 = hi1;
      hr1 = hr;
      hi1 = hi;
      hr = -hr2 + r * hr1 - i * hi1 + pp[j];
      hi = -hi2 + i * hr1 + r * hi1;
    }

    r = sin_arg_r * cosh_arg_i;
    i = cos_arg_r * sinh_arg_i;

    return [r * hr - i * hi, r * hi + i * hr];
  }

  // Heavily based on this etmerc projection implementation
  // https://github.com/mbloch/mapshaper-proj/blob/master/src/projections/etmerc.js


  function init$s() {
    if (!this.approx && (isNaN(this.es) || this.es <= 0)) {
      throw new Error('Incorrect elliptical usage. Try using the +approx option in the proj string, or PROJECTION["Fast_Transverse_Mercator"] in the WKT.');
    }
    if (this.approx) {
      // When '+approx' is set, use tmerc instead
      tmerc.init.apply(this);
      this.forward = tmerc.forward;
      this.inverse = tmerc.inverse;
    }

    this.x0 = this.x0 !== undefined ? this.x0 : 0;
    this.y0 = this.y0 !== undefined ? this.y0 : 0;
    this.long0 = this.long0 !== undefined ? this.long0 : 0;
    this.lat0 = this.lat0 !== undefined ? this.lat0 : 0;

    this.cgb = [];
    this.cbg = [];
    this.utg = [];
    this.gtu = [];

    var f = this.es / (1 + Math.sqrt(1 - this.es));
    var n = f / (2 - f);
    var np = n;

    this.cgb[0] = n * (2 + n * (-2 / 3 + n * (-2 + n * (116 / 45 + n * (26 / 45 + n * (-2854 / 675 ))))));
    this.cbg[0] = n * (-2 + n * ( 2 / 3 + n * ( 4 / 3 + n * (-82 / 45 + n * (32 / 45 + n * (4642 / 4725))))));

    np = np * n;
    this.cgb[1] = np * (7 / 3 + n * (-8 / 5 + n * (-227 / 45 + n * (2704 / 315 + n * (2323 / 945)))));
    this.cbg[1] = np * (5 / 3 + n * (-16 / 15 + n * ( -13 / 9 + n * (904 / 315 + n * (-1522 / 945)))));

    np = np * n;
    this.cgb[2] = np * (56 / 15 + n * (-136 / 35 + n * (-1262 / 105 + n * (73814 / 2835))));
    this.cbg[2] = np * (-26 / 15 + n * (34 / 21 + n * (8 / 5 + n * (-12686 / 2835))));

    np = np * n;
    this.cgb[3] = np * (4279 / 630 + n * (-332 / 35 + n * (-399572 / 14175)));
    this.cbg[3] = np * (1237 / 630 + n * (-12 / 5 + n * ( -24832 / 14175)));

    np = np * n;
    this.cgb[4] = np * (4174 / 315 + n * (-144838 / 6237));
    this.cbg[4] = np * (-734 / 315 + n * (109598 / 31185));

    np = np * n;
    this.cgb[5] = np * (601676 / 22275);
    this.cbg[5] = np * (444337 / 155925);

    np = Math.pow(n, 2);
    this.Qn = this.k0 / (1 + n) * (1 + np * (1 / 4 + np * (1 / 64 + np / 256)));

    this.utg[0] = n * (-0.5 + n * ( 2 / 3 + n * (-37 / 96 + n * ( 1 / 360 + n * (81 / 512 + n * (-96199 / 604800))))));
    this.gtu[0] = n * (0.5 + n * (-2 / 3 + n * (5 / 16 + n * (41 / 180 + n * (-127 / 288 + n * (7891 / 37800))))));

    this.utg[1] = np * (-1 / 48 + n * (-1 / 15 + n * (437 / 1440 + n * (-46 / 105 + n * (1118711 / 3870720)))));
    this.gtu[1] = np * (13 / 48 + n * (-3 / 5 + n * (557 / 1440 + n * (281 / 630 + n * (-1983433 / 1935360)))));

    np = np * n;
    this.utg[2] = np * (-17 / 480 + n * (37 / 840 + n * (209 / 4480 + n * (-5569 / 90720 ))));
    this.gtu[2] = np * (61 / 240 + n * (-103 / 140 + n * (15061 / 26880 + n * (167603 / 181440))));

    np = np * n;
    this.utg[3] = np * (-4397 / 161280 + n * (11 / 504 + n * (830251 / 7257600)));
    this.gtu[3] = np * (49561 / 161280 + n * (-179 / 168 + n * (6601661 / 7257600)));

    np = np * n;
    this.utg[4] = np * (-4583 / 161280 + n * (108847 / 3991680));
    this.gtu[4] = np * (34729 / 80640 + n * (-3418889 / 1995840));

    np = np * n;
    this.utg[5] = np * (-20648693 / 638668800);
    this.gtu[5] = np * (212378941 / 319334400);

    var Z = gatg(this.cbg, this.lat0);
    this.Zb = -this.Qn * (Z + clens(this.gtu, 2 * Z));
  }

  function forward$r(p) {
    var Ce = adjust_lon(p.x - this.long0);
    var Cn = p.y;

    Cn = gatg(this.cbg, Cn);
    var sin_Cn = Math.sin(Cn);
    var cos_Cn = Math.cos(Cn);
    var sin_Ce = Math.sin(Ce);
    var cos_Ce = Math.cos(Ce);

    Cn = Math.atan2(sin_Cn, cos_Ce * cos_Cn);
    Ce = Math.atan2(sin_Ce * cos_Cn, hypot(sin_Cn, cos_Cn * cos_Ce));
    Ce = asinhy(Math.tan(Ce));

    var tmp = clens_cmplx(this.gtu, 2 * Cn, 2 * Ce);

    Cn = Cn + tmp[0];
    Ce = Ce + tmp[1];

    var x;
    var y;

    if (Math.abs(Ce) <= 2.623395162778) {
      x = this.a * (this.Qn * Ce) + this.x0;
      y = this.a * (this.Qn * Cn + this.Zb) + this.y0;
    }
    else {
      x = Infinity;
      y = Infinity;
    }

    p.x = x;
    p.y = y;

    return p;
  }

  function inverse$r(p) {
    var Ce = (p.x - this.x0) * (1 / this.a);
    var Cn = (p.y - this.y0) * (1 / this.a);

    Cn = (Cn - this.Zb) / this.Qn;
    Ce = Ce / this.Qn;

    var lon;
    var lat;

    if (Math.abs(Ce) <= 2.623395162778) {
      var tmp = clens_cmplx(this.utg, 2 * Cn, 2 * Ce);

      Cn = Cn + tmp[0];
      Ce = Ce + tmp[1];
      Ce = Math.atan(sinh(Ce));

      var sin_Cn = Math.sin(Cn);
      var cos_Cn = Math.cos(Cn);
      var sin_Ce = Math.sin(Ce);
      var cos_Ce = Math.cos(Ce);

      Cn = Math.atan2(sin_Cn * cos_Ce, hypot(sin_Ce, cos_Ce * cos_Cn));
      Ce = Math.atan2(sin_Ce, cos_Ce * cos_Cn);

      lon = adjust_lon(Ce + this.long0);
      lat = gatg(this.cgb, Cn);
    }
    else {
      lon = Infinity;
      lat = Infinity;
    }

    p.x = lon;
    p.y = lat;

    return p;
  }

  var names$s = ["Extended_Transverse_Mercator", "Extended Transverse Mercator", "etmerc", "Transverse_Mercator", "Transverse Mercator", "Gauss Kruger", "Gauss_Kruger", "tmerc"];
  var etmerc = {
    init: init$s,
    forward: forward$r,
    inverse: inverse$r,
    names: names$s
  };

  function adjust_zone(zone, lon) {
    if (zone === undefined) {
      zone = Math.floor((adjust_lon(lon) + Math.PI) * 30 / Math.PI) + 1;

      if (zone < 0) {
        return 0;
      } else if (zone > 60) {
        return 60;
      }
    }
    return zone;
  }

  var dependsOn = 'etmerc';


  function init$r() {
    var zone = adjust_zone(this.zone, this.long0);
    if (zone === undefined) {
      throw new Error('unknown utm zone');
    }
    this.lat0 = 0;
    this.long0 =  ((6 * Math.abs(zone)) - 183) * D2R$1;
    this.x0 = 500000;
    this.y0 = this.utmSouth ? 10000000 : 0;
    this.k0 = 0.9996;

    etmerc.init.apply(this);
    this.forward = etmerc.forward;
    this.inverse = etmerc.inverse;
  }

  var names$r = ["Universal Transverse Mercator System", "utm"];
  var utm = {
    init: init$r,
    names: names$r,
    dependsOn: dependsOn
  };

  function srat(esinp, exp) {
    return (Math.pow((1 - esinp) / (1 + esinp), exp));
  }

  var MAX_ITER$2 = 20;

  function init$q() {
    var sphi = Math.sin(this.lat0);
    var cphi = Math.cos(this.lat0);
    cphi *= cphi;
    this.rc = Math.sqrt(1 - this.es) / (1 - this.es * sphi * sphi);
    this.C = Math.sqrt(1 + this.es * cphi * cphi / (1 - this.es));
    this.phic0 = Math.asin(sphi / this.C);
    this.ratexp = 0.5 * this.C * this.e;
    this.K = Math.tan(0.5 * this.phic0 + FORTPI) / (Math.pow(Math.tan(0.5 * this.lat0 + FORTPI), this.C) * srat(this.e * sphi, this.ratexp));
  }

  function forward$q(p) {
    var lon = p.x;
    var lat = p.y;

    p.y = 2 * Math.atan(this.K * Math.pow(Math.tan(0.5 * lat + FORTPI), this.C) * srat(this.e * Math.sin(lat), this.ratexp)) - HALF_PI;
    p.x = this.C * lon;
    return p;
  }

  function inverse$q(p) {
    var DEL_TOL = 1e-14;
    var lon = p.x / this.C;
    var lat = p.y;
    var num = Math.pow(Math.tan(0.5 * lat + FORTPI) / this.K, 1 / this.C);
    for (var i = MAX_ITER$2; i > 0; --i) {
      lat = 2 * Math.atan(num * srat(this.e * Math.sin(p.y), - 0.5 * this.e)) - HALF_PI;
      if (Math.abs(lat - p.y) < DEL_TOL) {
        break;
      }
      p.y = lat;
    }
    /* convergence failed */
    if (!i) {
      return null;
    }
    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$q = ["gauss"];
  var gauss = {
    init: init$q,
    forward: forward$q,
    inverse: inverse$q,
    names: names$q
  };

  function init$p() {
    gauss.init.apply(this);
    if (!this.rc) {
      return;
    }
    this.sinc0 = Math.sin(this.phic0);
    this.cosc0 = Math.cos(this.phic0);
    this.R2 = 2 * this.rc;
    if (!this.title) {
      this.title = "Oblique Stereographic Alternative";
    }
  }

  function forward$p(p) {
    var sinc, cosc, cosl, k;
    p.x = adjust_lon(p.x - this.long0);
    gauss.forward.apply(this, [p]);
    sinc = Math.sin(p.y);
    cosc = Math.cos(p.y);
    cosl = Math.cos(p.x);
    k = this.k0 * this.R2 / (1 + this.sinc0 * sinc + this.cosc0 * cosc * cosl);
    p.x = k * cosc * Math.sin(p.x);
    p.y = k * (this.cosc0 * sinc - this.sinc0 * cosc * cosl);
    p.x = this.a * p.x + this.x0;
    p.y = this.a * p.y + this.y0;
    return p;
  }

  function inverse$p(p) {
    var sinc, cosc, lon, lat, rho;
    p.x = (p.x - this.x0) / this.a;
    p.y = (p.y - this.y0) / this.a;

    p.x /= this.k0;
    p.y /= this.k0;
    if ((rho = hypot(p.x, p.y))) {
      var c = 2 * Math.atan2(rho, this.R2);
      sinc = Math.sin(c);
      cosc = Math.cos(c);
      lat = Math.asin(cosc * this.sinc0 + p.y * sinc * this.cosc0 / rho);
      lon = Math.atan2(p.x * sinc, rho * this.cosc0 * cosc - p.y * this.sinc0 * sinc);
    }
    else {
      lat = this.phic0;
      lon = 0;
    }

    p.x = lon;
    p.y = lat;
    gauss.inverse.apply(this, [p]);
    p.x = adjust_lon(p.x + this.long0);
    return p;
  }

  var names$p = ["Stereographic_North_Pole", "Oblique_Stereographic", "sterea","Oblique Stereographic Alternative","Double_Stereographic"];
  var sterea = {
    init: init$p,
    forward: forward$p,
    inverse: inverse$p,
    names: names$p
  };

  function ssfn_(phit, sinphi, eccen) {
    sinphi *= eccen;
    return (Math.tan(0.5 * (HALF_PI + phit)) * Math.pow((1 - sinphi) / (1 + sinphi), 0.5 * eccen));
  }

  function init$o() {

    // setting default parameters
    this.x0 = this.x0 || 0;
    this.y0 = this.y0 || 0;
    this.lat0 = this.lat0 || 0;
    this.long0 = this.long0 || 0;

    this.coslat0 = Math.cos(this.lat0);
    this.sinlat0 = Math.sin(this.lat0);
    if (this.sphere) {
      if (this.k0 === 1 && !isNaN(this.lat_ts) && Math.abs(this.coslat0) <= EPSLN) {
        this.k0 = 0.5 * (1 + sign(this.lat0) * Math.sin(this.lat_ts));
      }
    }
    else {
      if (Math.abs(this.coslat0) <= EPSLN) {
        if (this.lat0 > 0) {
          //North pole
          //trace('stere:north pole');
          this.con = 1;
        }
        else {
          //South pole
          //trace('stere:south pole');
          this.con = -1;
        }
      }
      this.cons = Math.sqrt(Math.pow(1 + this.e, 1 + this.e) * Math.pow(1 - this.e, 1 - this.e));
      if (this.k0 === 1 && !isNaN(this.lat_ts) && Math.abs(this.coslat0) <= EPSLN && Math.abs(Math.cos(this.lat_ts)) > EPSLN) {
        // When k0 is 1 (default value) and lat_ts is a vaild number and lat0 is at a pole and lat_ts is not at a pole
        // Recalculate k0 using formula 21-35 from p161 of Snyder, 1987
        this.k0 = 0.5 * this.cons * msfnz(this.e, Math.sin(this.lat_ts), Math.cos(this.lat_ts)) / tsfnz(this.e, this.con * this.lat_ts, this.con * Math.sin(this.lat_ts));
      }
      this.ms1 = msfnz(this.e, this.sinlat0, this.coslat0);
      this.X0 = 2 * Math.atan(this.ssfn_(this.lat0, this.sinlat0, this.e)) - HALF_PI;
      this.cosX0 = Math.cos(this.X0);
      this.sinX0 = Math.sin(this.X0);
    }
  }

  // Stereographic forward equations--mapping lat,long to x,y
  function forward$o(p) {
    var lon = p.x;
    var lat = p.y;
    var sinlat = Math.sin(lat);
    var coslat = Math.cos(lat);
    var A, X, sinX, cosX, ts, rh;
    var dlon = adjust_lon(lon - this.long0);

    if (Math.abs(Math.abs(lon - this.long0) - Math.PI) <= EPSLN && Math.abs(lat + this.lat0) <= EPSLN) {
      //case of the origine point
      //trace('stere:this is the origin point');
      p.x = NaN;
      p.y = NaN;
      return p;
    }
    if (this.sphere) {
      //trace('stere:sphere case');
      A = 2 * this.k0 / (1 + this.sinlat0 * sinlat + this.coslat0 * coslat * Math.cos(dlon));
      p.x = this.a * A * coslat * Math.sin(dlon) + this.x0;
      p.y = this.a * A * (this.coslat0 * sinlat - this.sinlat0 * coslat * Math.cos(dlon)) + this.y0;
      return p;
    }
    else {
      X = 2 * Math.atan(this.ssfn_(lat, sinlat, this.e)) - HALF_PI;
      cosX = Math.cos(X);
      sinX = Math.sin(X);
      if (Math.abs(this.coslat0) <= EPSLN) {
        ts = tsfnz(this.e, lat * this.con, this.con * sinlat);
        rh = 2 * this.a * this.k0 * ts / this.cons;
        p.x = this.x0 + rh * Math.sin(lon - this.long0);
        p.y = this.y0 - this.con * rh * Math.cos(lon - this.long0);
        //trace(p.toString());
        return p;
      }
      else if (Math.abs(this.sinlat0) < EPSLN) {
        //Eq
        //trace('stere:equateur');
        A = 2 * this.a * this.k0 / (1 + cosX * Math.cos(dlon));
        p.y = A * sinX;
      }
      else {
        //other case
        //trace('stere:normal case');
        A = 2 * this.a * this.k0 * this.ms1 / (this.cosX0 * (1 + this.sinX0 * sinX + this.cosX0 * cosX * Math.cos(dlon)));
        p.y = A * (this.cosX0 * sinX - this.sinX0 * cosX * Math.cos(dlon)) + this.y0;
      }
      p.x = A * cosX * Math.sin(dlon) + this.x0;
    }
    //trace(p.toString());
    return p;
  }

  //* Stereographic inverse equations--mapping x,y to lat/long
  function inverse$o(p) {
    p.x -= this.x0;
    p.y -= this.y0;
    var lon, lat, ts, ce, Chi;
    var rh = Math.sqrt(p.x * p.x + p.y * p.y);
    if (this.sphere) {
      var c = 2 * Math.atan(rh / (2 * this.a * this.k0));
      lon = this.long0;
      lat = this.lat0;
      if (rh <= EPSLN) {
        p.x = lon;
        p.y = lat;
        return p;
      }
      lat = Math.asin(Math.cos(c) * this.sinlat0 + p.y * Math.sin(c) * this.coslat0 / rh);
      if (Math.abs(this.coslat0) < EPSLN) {
        if (this.lat0 > 0) {
          lon = adjust_lon(this.long0 + Math.atan2(p.x, - 1 * p.y));
        }
        else {
          lon = adjust_lon(this.long0 + Math.atan2(p.x, p.y));
        }
      }
      else {
        lon = adjust_lon(this.long0 + Math.atan2(p.x * Math.sin(c), rh * this.coslat0 * Math.cos(c) - p.y * this.sinlat0 * Math.sin(c)));
      }
      p.x = lon;
      p.y = lat;
      return p;
    }
    else {
      if (Math.abs(this.coslat0) <= EPSLN) {
        if (rh <= EPSLN) {
          lat = this.lat0;
          lon = this.long0;
          p.x = lon;
          p.y = lat;
          //trace(p.toString());
          return p;
        }
        p.x *= this.con;
        p.y *= this.con;
        ts = rh * this.cons / (2 * this.a * this.k0);
        lat = this.con * phi2z(this.e, ts);
        lon = this.con * adjust_lon(this.con * this.long0 + Math.atan2(p.x, - 1 * p.y));
      }
      else {
        ce = 2 * Math.atan(rh * this.cosX0 / (2 * this.a * this.k0 * this.ms1));
        lon = this.long0;
        if (rh <= EPSLN) {
          Chi = this.X0;
        }
        else {
          Chi = Math.asin(Math.cos(ce) * this.sinX0 + p.y * Math.sin(ce) * this.cosX0 / rh);
          lon = adjust_lon(this.long0 + Math.atan2(p.x * Math.sin(ce), rh * this.cosX0 * Math.cos(ce) - p.y * this.sinX0 * Math.sin(ce)));
        }
        lat = -1 * phi2z(this.e, Math.tan(0.5 * (HALF_PI + Chi)));
      }
    }
    p.x = lon;
    p.y = lat;

    //trace(p.toString());
    return p;

  }

  var names$o = ["stere", "Stereographic_South_Pole", "Polar Stereographic (variant B)", "Polar_Stereographic"];
  var stere = {
    init: init$o,
    forward: forward$o,
    inverse: inverse$o,
    names: names$o,
    ssfn_: ssfn_
  };

  /*
    references:
      Formules et constantes pour le Calcul pour la
      projection cylindrique conforme à axe oblique et pour la transformation entre
      des systèmes de référence.
      http://www.swisstopo.admin.ch/internet/swisstopo/fr/home/topics/survey/sys/refsys/switzerland.parsysrelated1.31216.downloadList.77004.DownloadFile.tmp/swissprojectionfr.pdf
    */

  function init$n() {
    var phy0 = this.lat0;
    this.lambda0 = this.long0;
    var sinPhy0 = Math.sin(phy0);
    var semiMajorAxis = this.a;
    var invF = this.rf;
    var flattening = 1 / invF;
    var e2 = 2 * flattening - Math.pow(flattening, 2);
    var e = this.e = Math.sqrt(e2);
    this.R = this.k0 * semiMajorAxis * Math.sqrt(1 - e2) / (1 - e2 * Math.pow(sinPhy0, 2));
    this.alpha = Math.sqrt(1 + e2 / (1 - e2) * Math.pow(Math.cos(phy0), 4));
    this.b0 = Math.asin(sinPhy0 / this.alpha);
    var k1 = Math.log(Math.tan(Math.PI / 4 + this.b0 / 2));
    var k2 = Math.log(Math.tan(Math.PI / 4 + phy0 / 2));
    var k3 = Math.log((1 + e * sinPhy0) / (1 - e * sinPhy0));
    this.K = k1 - this.alpha * k2 + this.alpha * e / 2 * k3;
  }

  function forward$n(p) {
    var Sa1 = Math.log(Math.tan(Math.PI / 4 - p.y / 2));
    var Sa2 = this.e / 2 * Math.log((1 + this.e * Math.sin(p.y)) / (1 - this.e * Math.sin(p.y)));
    var S = -this.alpha * (Sa1 + Sa2) + this.K;

    // spheric latitude
    var b = 2 * (Math.atan(Math.exp(S)) - Math.PI / 4);

    // spheric longitude
    var I = this.alpha * (p.x - this.lambda0);

    // psoeudo equatorial rotation
    var rotI = Math.atan(Math.sin(I) / (Math.sin(this.b0) * Math.tan(b) + Math.cos(this.b0) * Math.cos(I)));

    var rotB = Math.asin(Math.cos(this.b0) * Math.sin(b) - Math.sin(this.b0) * Math.cos(b) * Math.cos(I));

    p.y = this.R / 2 * Math.log((1 + Math.sin(rotB)) / (1 - Math.sin(rotB))) + this.y0;
    p.x = this.R * rotI + this.x0;
    return p;
  }

  function inverse$n(p) {
    var Y = p.x - this.x0;
    var X = p.y - this.y0;

    var rotI = Y / this.R;
    var rotB = 2 * (Math.atan(Math.exp(X / this.R)) - Math.PI / 4);

    var b = Math.asin(Math.cos(this.b0) * Math.sin(rotB) + Math.sin(this.b0) * Math.cos(rotB) * Math.cos(rotI));
    var I = Math.atan(Math.sin(rotI) / (Math.cos(this.b0) * Math.cos(rotI) - Math.sin(this.b0) * Math.tan(rotB)));

    var lambda = this.lambda0 + I / this.alpha;

    var S = 0;
    var phy = b;
    var prevPhy = -1000;
    var iteration = 0;
    while (Math.abs(phy - prevPhy) > 0.0000001) {
      if (++iteration > 20) {
        //...reportError("omercFwdInfinity");
        return;
      }
      //S = Math.log(Math.tan(Math.PI / 4 + phy / 2));
      S = 1 / this.alpha * (Math.log(Math.tan(Math.PI / 4 + b / 2)) - this.K) + this.e * Math.log(Math.tan(Math.PI / 4 + Math.asin(this.e * Math.sin(phy)) / 2));
      prevPhy = phy;
      phy = 2 * Math.atan(Math.exp(S)) - Math.PI / 2;
    }

    p.x = lambda;
    p.y = phy;
    return p;
  }

  var names$n = ["somerc"];
  var somerc = {
    init: init$n,
    forward: forward$n,
    inverse: inverse$n,
    names: names$n
  };

  var TOL = 1e-7;

  function isTypeA(P) {
    var typeAProjections = ['Hotine_Oblique_Mercator','Hotine_Oblique_Mercator_Azimuth_Natural_Origin'];
    var projectionName = typeof P.PROJECTION === "object" ? Object.keys(P.PROJECTION)[0] : P.PROJECTION;
    
    return 'no_uoff' in P || 'no_off' in P || typeAProjections.indexOf(projectionName) !== -1;
  }


  /* Initialize the Oblique Mercator  projection
      ------------------------------------------*/
  function init$m() {  
    var con, com, cosph0, D, F, H, L, sinph0, p, J, gamma = 0,
      gamma0, lamc = 0, lam1 = 0, lam2 = 0, phi1 = 0, phi2 = 0, alpha_c = 0;
    
    // only Type A uses the no_off or no_uoff property
    // https://github.com/OSGeo/proj.4/issues/104
    this.no_off = isTypeA(this);
    this.no_rot = 'no_rot' in this;
    
    var alp = false;
    if ("alpha" in this) {
      alp = true;
    }

    var gam = false;
    if ("rectified_grid_angle" in this) {
      gam = true;
    }

    if (alp) {
      alpha_c = this.alpha;
    }
    
    if (gam) {
      gamma = (this.rectified_grid_angle * D2R$1);
    }
    
    if (alp || gam) {
      lamc = this.longc;
    } else {
      lam1 = this.long1;
      phi1 = this.lat1;
      lam2 = this.long2;
      phi2 = this.lat2;
      
      if (Math.abs(phi1 - phi2) <= TOL || (con = Math.abs(phi1)) <= TOL ||
          Math.abs(con - HALF_PI) <= TOL || Math.abs(Math.abs(this.lat0) - HALF_PI) <= TOL ||
          Math.abs(Math.abs(phi2) - HALF_PI) <= TOL) {
        throw new Error();
      }
    }
    
    var one_es = 1.0 - this.es;
    com = Math.sqrt(one_es);
    
    if (Math.abs(this.lat0) > EPSLN) {
      sinph0 = Math.sin(this.lat0);
      cosph0 = Math.cos(this.lat0);
      con = 1 - this.es * sinph0 * sinph0;
      this.B = cosph0 * cosph0;
      this.B = Math.sqrt(1 + this.es * this.B * this.B / one_es);
      this.A = this.B * this.k0 * com / con;
      D = this.B * com / (cosph0 * Math.sqrt(con));
      F = D * D -1;
      
      if (F <= 0) {
        F = 0;
      } else {
        F = Math.sqrt(F);
        if (this.lat0 < 0) {
          F = -F;
        }
      }
      
      this.E = F += D;
      this.E *= Math.pow(tsfnz(this.e, this.lat0, sinph0), this.B);
    } else {
      this.B = 1 / com;
      this.A = this.k0;
      this.E = D = F = 1;
    }
    
    if (alp || gam) {
      if (alp) {
        gamma0 = Math.asin(Math.sin(alpha_c) / D);
        if (!gam) {
          gamma = alpha_c;
        }
      } else {
        gamma0 = gamma;
        alpha_c = Math.asin(D * Math.sin(gamma0));
      }
      this.lam0 = lamc - Math.asin(0.5 * (F - 1 / F) * Math.tan(gamma0)) / this.B;
    } else {
      H = Math.pow(tsfnz(this.e, phi1, Math.sin(phi1)), this.B);
      L = Math.pow(tsfnz(this.e, phi2, Math.sin(phi2)), this.B);
      F = this.E / H;
      p = (L - H) / (L + H);
      J = this.E * this.E;
      J = (J - L * H) / (J + L * H);
      con = lam1 - lam2;
      
      if (con < -Math.pi) {
        lam2 -=TWO_PI;
      } else if (con > Math.pi) {
        lam2 += TWO_PI;
      }
      
      this.lam0 = adjust_lon(0.5 * (lam1 + lam2) - Math.atan(J * Math.tan(0.5 * this.B * (lam1 - lam2)) / p) / this.B);
      gamma0 = Math.atan(2 * Math.sin(this.B * adjust_lon(lam1 - this.lam0)) / (F - 1 / F));
      gamma = alpha_c = Math.asin(D * Math.sin(gamma0));
    }
    
    this.singam = Math.sin(gamma0);
    this.cosgam = Math.cos(gamma0);
    this.sinrot = Math.sin(gamma);
    this.cosrot = Math.cos(gamma);
    
    this.rB = 1 / this.B;
    this.ArB = this.A * this.rB;
    this.BrA = 1 / this.ArB;
    this.A * this.B;
    
    if (this.no_off) {
      this.u_0 = 0;
    } else {
      this.u_0 = Math.abs(this.ArB * Math.atan(Math.sqrt(D * D - 1) / Math.cos(alpha_c)));
      
      if (this.lat0 < 0) {
        this.u_0 = - this.u_0;
      }  
    }
      
    F = 0.5 * gamma0;
    this.v_pole_n = this.ArB * Math.log(Math.tan(FORTPI - F));
    this.v_pole_s = this.ArB * Math.log(Math.tan(FORTPI + F));
  }


  /* Oblique Mercator forward equations--mapping lat,long to x,y
      ----------------------------------------------------------*/
  function forward$m(p) {
    var coords = {};
    var S, T, U, V, W, temp, u, v;
    p.x = p.x - this.lam0;
    
    if (Math.abs(Math.abs(p.y) - HALF_PI) > EPSLN) {
      W = this.E / Math.pow(tsfnz(this.e, p.y, Math.sin(p.y)), this.B);
      
      temp = 1 / W;
      S = 0.5 * (W - temp);
      T = 0.5 * (W + temp);
      V = Math.sin(this.B * p.x);
      U = (S * this.singam - V * this.cosgam) / T;
          
      if (Math.abs(Math.abs(U) - 1.0) < EPSLN) {
        throw new Error();
      }
      
      v = 0.5 * this.ArB * Math.log((1 - U)/(1 + U));
      temp = Math.cos(this.B * p.x);
      
      if (Math.abs(temp) < TOL) {
        u = this.A * p.x;
      } else {
        u = this.ArB * Math.atan2((S * this.cosgam + V * this.singam), temp);
      }    
    } else {
      v = p.y > 0 ? this.v_pole_n : this.v_pole_s;
      u = this.ArB * p.y;
    }
       
    if (this.no_rot) {
      coords.x = u;
      coords.y = v;
    } else {
      u -= this.u_0;
      coords.x = v * this.cosrot + u * this.sinrot;
      coords.y = u * this.cosrot - v * this.sinrot;
    }
    
    coords.x = (this.a * coords.x + this.x0);
    coords.y = (this.a * coords.y + this.y0);
    
    return coords;
  }

  function inverse$m(p) {
    var u, v, Qp, Sp, Tp, Vp, Up;
    var coords = {};
    
    p.x = (p.x - this.x0) * (1.0 / this.a);
    p.y = (p.y - this.y0) * (1.0 / this.a);

    if (this.no_rot) {
      v = p.y;
      u = p.x;
    } else {
      v = p.x * this.cosrot - p.y * this.sinrot;
      u = p.y * this.cosrot + p.x * this.sinrot + this.u_0;
    }
    
    Qp = Math.exp(-this.BrA * v);
    Sp = 0.5 * (Qp - 1 / Qp);
    Tp = 0.5 * (Qp + 1 / Qp);
    Vp = Math.sin(this.BrA * u);
    Up = (Vp * this.cosgam + Sp * this.singam) / Tp;
    
    if (Math.abs(Math.abs(Up) - 1) < EPSLN) {
      coords.x = 0;
      coords.y = Up < 0 ? -HALF_PI : HALF_PI;
    } else {
      coords.y = this.E / Math.sqrt((1 + Up) / (1 - Up));
      coords.y = phi2z(this.e, Math.pow(coords.y, 1 / this.B));
      
      if (coords.y === Infinity) {
        throw new Error();
      }
          
      coords.x = -this.rB * Math.atan2((Sp * this.cosgam - Vp * this.singam), Math.cos(this.BrA * u));
    }
    
    coords.x += this.lam0;
    
    return coords;
  }

  var names$m = ["Hotine_Oblique_Mercator", "Hotine Oblique Mercator", "Hotine_Oblique_Mercator_Azimuth_Natural_Origin", "Hotine_Oblique_Mercator_Two_Point_Natural_Origin", "Hotine_Oblique_Mercator_Azimuth_Center", "Oblique_Mercator", "omerc"];
  var omerc = {
    init: init$m,
    forward: forward$m,
    inverse: inverse$m,
    names: names$m
  };

  function init$l() {
    
    //double lat0;                    /* the reference latitude               */
    //double long0;                   /* the reference longitude              */
    //double lat1;                    /* first standard parallel              */
    //double lat2;                    /* second standard parallel             */
    //double r_maj;                   /* major axis                           */
    //double r_min;                   /* minor axis                           */
    //double false_east;              /* x offset in meters                   */
    //double false_north;             /* y offset in meters                   */
    
    //the above value can be set with proj4.defs
    //example: proj4.defs("EPSG:2154","+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

    if (!this.lat2) {
      this.lat2 = this.lat1;
    } //if lat2 is not defined
    if (!this.k0) {
      this.k0 = 1;
    }
    this.x0 = this.x0 || 0;
    this.y0 = this.y0 || 0;
    // Standard Parallels cannot be equal and on opposite sides of the equator
    if (Math.abs(this.lat1 + this.lat2) < EPSLN) {
      return;
    }

    var temp = this.b / this.a;
    this.e = Math.sqrt(1 - temp * temp);

    var sin1 = Math.sin(this.lat1);
    var cos1 = Math.cos(this.lat1);
    var ms1 = msfnz(this.e, sin1, cos1);
    var ts1 = tsfnz(this.e, this.lat1, sin1);

    var sin2 = Math.sin(this.lat2);
    var cos2 = Math.cos(this.lat2);
    var ms2 = msfnz(this.e, sin2, cos2);
    var ts2 = tsfnz(this.e, this.lat2, sin2);

    var ts0 = tsfnz(this.e, this.lat0, Math.sin(this.lat0));

    if (Math.abs(this.lat1 - this.lat2) > EPSLN) {
      this.ns = Math.log(ms1 / ms2) / Math.log(ts1 / ts2);
    }
    else {
      this.ns = sin1;
    }
    if (isNaN(this.ns)) {
      this.ns = sin1;
    }
    this.f0 = ms1 / (this.ns * Math.pow(ts1, this.ns));
    this.rh = this.a * this.f0 * Math.pow(ts0, this.ns);
    if (!this.title) {
      this.title = "Lambert Conformal Conic";
    }
  }

  // Lambert Conformal conic forward equations--mapping lat,long to x,y
  // -----------------------------------------------------------------
  function forward$l(p) {

    var lon = p.x;
    var lat = p.y;

    // singular cases :
    if (Math.abs(2 * Math.abs(lat) - Math.PI) <= EPSLN) {
      lat = sign(lat) * (HALF_PI - 2 * EPSLN);
    }

    var con = Math.abs(Math.abs(lat) - HALF_PI);
    var ts, rh1;
    if (con > EPSLN) {
      ts = tsfnz(this.e, lat, Math.sin(lat));
      rh1 = this.a * this.f0 * Math.pow(ts, this.ns);
    }
    else {
      con = lat * this.ns;
      if (con <= 0) {
        return null;
      }
      rh1 = 0;
    }
    var theta = this.ns * adjust_lon(lon - this.long0);
    p.x = this.k0 * (rh1 * Math.sin(theta)) + this.x0;
    p.y = this.k0 * (this.rh - rh1 * Math.cos(theta)) + this.y0;

    return p;
  }

  // Lambert Conformal Conic inverse equations--mapping x,y to lat/long
  // -----------------------------------------------------------------
  function inverse$l(p) {

    var rh1, con, ts;
    var lat, lon;
    var x = (p.x - this.x0) / this.k0;
    var y = (this.rh - (p.y - this.y0) / this.k0);
    if (this.ns > 0) {
      rh1 = Math.sqrt(x * x + y * y);
      con = 1;
    }
    else {
      rh1 = -Math.sqrt(x * x + y * y);
      con = -1;
    }
    var theta = 0;
    if (rh1 !== 0) {
      theta = Math.atan2((con * x), (con * y));
    }
    if ((rh1 !== 0) || (this.ns > 0)) {
      con = 1 / this.ns;
      ts = Math.pow((rh1 / (this.a * this.f0)), con);
      lat = phi2z(this.e, ts);
      if (lat === -9999) {
        return null;
      }
    }
    else {
      lat = -HALF_PI;
    }
    lon = adjust_lon(theta / this.ns + this.long0);

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$l = [
    "Lambert Tangential Conformal Conic Projection",
    "Lambert_Conformal_Conic",
    "Lambert_Conformal_Conic_1SP",
    "Lambert_Conformal_Conic_2SP",
    "lcc",
    "Lambert Conic Conformal (1SP)",
    "Lambert Conic Conformal (2SP)"
  ];

  var lcc = {
    init: init$l,
    forward: forward$l,
    inverse: inverse$l,
    names: names$l
  };

  function init$k() {
    this.a = 6377397.155;
    this.es = 0.006674372230614;
    this.e = Math.sqrt(this.es);
    if (!this.lat0) {
      this.lat0 = 0.863937979737193;
    }
    if (!this.long0) {
      this.long0 = 0.7417649320975901 - 0.308341501185665;
    }
    /* if scale not set default to 0.9999 */
    if (!this.k0) {
      this.k0 = 0.9999;
    }
    this.s45 = 0.785398163397448; /* 45 */
    this.s90 = 2 * this.s45;
    this.fi0 = this.lat0;
    this.e2 = this.es;
    this.e = Math.sqrt(this.e2);
    this.alfa = Math.sqrt(1 + (this.e2 * Math.pow(Math.cos(this.fi0), 4)) / (1 - this.e2));
    this.uq = 1.04216856380474;
    this.u0 = Math.asin(Math.sin(this.fi0) / this.alfa);
    this.g = Math.pow((1 + this.e * Math.sin(this.fi0)) / (1 - this.e * Math.sin(this.fi0)), this.alfa * this.e / 2);
    this.k = Math.tan(this.u0 / 2 + this.s45) / Math.pow(Math.tan(this.fi0 / 2 + this.s45), this.alfa) * this.g;
    this.k1 = this.k0;
    this.n0 = this.a * Math.sqrt(1 - this.e2) / (1 - this.e2 * Math.pow(Math.sin(this.fi0), 2));
    this.s0 = 1.37008346281555;
    this.n = Math.sin(this.s0);
    this.ro0 = this.k1 * this.n0 / Math.tan(this.s0);
    this.ad = this.s90 - this.uq;
  }

  /* ellipsoid */
  /* calculate xy from lat/lon */
  /* Constants, identical to inverse transform function */
  function forward$k(p) {
    var gfi, u, deltav, s, d, eps, ro;
    var lon = p.x;
    var lat = p.y;
    var delta_lon = adjust_lon(lon - this.long0);
    /* Transformation */
    gfi = Math.pow(((1 + this.e * Math.sin(lat)) / (1 - this.e * Math.sin(lat))), (this.alfa * this.e / 2));
    u = 2 * (Math.atan(this.k * Math.pow(Math.tan(lat / 2 + this.s45), this.alfa) / gfi) - this.s45);
    deltav = -delta_lon * this.alfa;
    s = Math.asin(Math.cos(this.ad) * Math.sin(u) + Math.sin(this.ad) * Math.cos(u) * Math.cos(deltav));
    d = Math.asin(Math.cos(u) * Math.sin(deltav) / Math.cos(s));
    eps = this.n * d;
    ro = this.ro0 * Math.pow(Math.tan(this.s0 / 2 + this.s45), this.n) / Math.pow(Math.tan(s / 2 + this.s45), this.n);
    p.y = ro * Math.cos(eps) / 1;
    p.x = ro * Math.sin(eps) / 1;

    if (!this.czech) {
      p.y *= -1;
      p.x *= -1;
    }
    return (p);
  }

  /* calculate lat/lon from xy */
  function inverse$k(p) {
    var u, deltav, s, d, eps, ro, fi1;
    var ok;

    /* Transformation */
    /* revert y, x*/
    var tmp = p.x;
    p.x = p.y;
    p.y = tmp;
    if (!this.czech) {
      p.y *= -1;
      p.x *= -1;
    }
    ro = Math.sqrt(p.x * p.x + p.y * p.y);
    eps = Math.atan2(p.y, p.x);
    d = eps / Math.sin(this.s0);
    s = 2 * (Math.atan(Math.pow(this.ro0 / ro, 1 / this.n) * Math.tan(this.s0 / 2 + this.s45)) - this.s45);
    u = Math.asin(Math.cos(this.ad) * Math.sin(s) - Math.sin(this.ad) * Math.cos(s) * Math.cos(d));
    deltav = Math.asin(Math.cos(s) * Math.sin(d) / Math.cos(u));
    p.x = this.long0 - deltav / this.alfa;
    fi1 = u;
    ok = 0;
    var iter = 0;
    do {
      p.y = 2 * (Math.atan(Math.pow(this.k, - 1 / this.alfa) * Math.pow(Math.tan(u / 2 + this.s45), 1 / this.alfa) * Math.pow((1 + this.e * Math.sin(fi1)) / (1 - this.e * Math.sin(fi1)), this.e / 2)) - this.s45);
      if (Math.abs(fi1 - p.y) < 0.0000000001) {
        ok = 1;
      }
      fi1 = p.y;
      iter += 1;
    } while (ok === 0 && iter < 15);
    if (iter >= 15) {
      return null;
    }

    return (p);
  }

  var names$k = ["Krovak", "krovak"];
  var krovak = {
    init: init$k,
    forward: forward$k,
    inverse: inverse$k,
    names: names$k
  };

  function mlfn(e0, e1, e2, e3, phi) {
    return (e0 * phi - e1 * Math.sin(2 * phi) + e2 * Math.sin(4 * phi) - e3 * Math.sin(6 * phi));
  }

  function e0fn(x) {
    return (1 - 0.25 * x * (1 + x / 16 * (3 + 1.25 * x)));
  }

  function e1fn(x) {
    return (0.375 * x * (1 + 0.25 * x * (1 + 0.46875 * x)));
  }

  function e2fn(x) {
    return (0.05859375 * x * x * (1 + 0.75 * x));
  }

  function e3fn(x) {
    return (x * x * x * (35 / 3072));
  }

  function gN(a, e, sinphi) {
    var temp = e * sinphi;
    return a / Math.sqrt(1 - temp * temp);
  }

  function adjust_lat(x) {
    return (Math.abs(x) < HALF_PI) ? x : (x - (sign(x) * Math.PI));
  }

  function imlfn(ml, e0, e1, e2, e3) {
    var phi;
    var dphi;

    phi = ml / e0;
    for (var i = 0; i < 15; i++) {
      dphi = (ml - (e0 * phi - e1 * Math.sin(2 * phi) + e2 * Math.sin(4 * phi) - e3 * Math.sin(6 * phi))) / (e0 - 2 * e1 * Math.cos(2 * phi) + 4 * e2 * Math.cos(4 * phi) - 6 * e3 * Math.cos(6 * phi));
      phi += dphi;
      if (Math.abs(dphi) <= 0.0000000001) {
        return phi;
      }
    }

    //..reportError("IMLFN-CONV:Latitude failed to converge after 15 iterations");
    return NaN;
  }

  function init$j() {
    if (!this.sphere) {
      this.e0 = e0fn(this.es);
      this.e1 = e1fn(this.es);
      this.e2 = e2fn(this.es);
      this.e3 = e3fn(this.es);
      this.ml0 = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, this.lat0);
    }
  }

  /* Cassini forward equations--mapping lat,long to x,y
    -----------------------------------------------------------------------*/
  function forward$j(p) {

    /* Forward equations
        -----------------*/
    var x, y;
    var lam = p.x;
    var phi = p.y;
    lam = adjust_lon(lam - this.long0);

    if (this.sphere) {
      x = this.a * Math.asin(Math.cos(phi) * Math.sin(lam));
      y = this.a * (Math.atan2(Math.tan(phi), Math.cos(lam)) - this.lat0);
    }
    else {
      //ellipsoid
      var sinphi = Math.sin(phi);
      var cosphi = Math.cos(phi);
      var nl = gN(this.a, this.e, sinphi);
      var tl = Math.tan(phi) * Math.tan(phi);
      var al = lam * Math.cos(phi);
      var asq = al * al;
      var cl = this.es * cosphi * cosphi / (1 - this.es);
      var ml = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, phi);

      x = nl * al * (1 - asq * tl * (1 / 6 - (8 - tl + 8 * cl) * asq / 120));
      y = ml - this.ml0 + nl * sinphi / cosphi * asq * (0.5 + (5 - tl + 6 * cl) * asq / 24);


    }

    p.x = x + this.x0;
    p.y = y + this.y0;
    return p;
  }

  /* Inverse equations
    -----------------*/
  function inverse$j(p) {
    p.x -= this.x0;
    p.y -= this.y0;
    var x = p.x / this.a;
    var y = p.y / this.a;
    var phi, lam;

    if (this.sphere) {
      var dd = y + this.lat0;
      phi = Math.asin(Math.sin(dd) * Math.cos(x));
      lam = Math.atan2(Math.tan(x), Math.cos(dd));
    }
    else {
      /* ellipsoid */
      var ml1 = this.ml0 / this.a + y;
      var phi1 = imlfn(ml1, this.e0, this.e1, this.e2, this.e3);
      if (Math.abs(Math.abs(phi1) - HALF_PI) <= EPSLN) {
        p.x = this.long0;
        p.y = HALF_PI;
        if (y < 0) {
          p.y *= -1;
        }
        return p;
      }
      var nl1 = gN(this.a, this.e, Math.sin(phi1));

      var rl1 = nl1 * nl1 * nl1 / this.a / this.a * (1 - this.es);
      var tl1 = Math.pow(Math.tan(phi1), 2);
      var dl = x * this.a / nl1;
      var dsq = dl * dl;
      phi = phi1 - nl1 * Math.tan(phi1) / rl1 * dl * dl * (0.5 - (1 + 3 * tl1) * dl * dl / 24);
      lam = dl * (1 - dsq * (tl1 / 3 + (1 + 3 * tl1) * tl1 * dsq / 15)) / Math.cos(phi1);

    }

    p.x = adjust_lon(lam + this.long0);
    p.y = adjust_lat(phi);
    return p;

  }

  var names$j = ["Cassini", "Cassini_Soldner", "cass"];
  var cass = {
    init: init$j,
    forward: forward$j,
    inverse: inverse$j,
    names: names$j
  };

  function qsfnz(eccent, sinphi) {
    var con;
    if (eccent > 1.0e-7) {
      con = eccent * sinphi;
      return ((1 - eccent * eccent) * (sinphi / (1 - con * con) - (0.5 / eccent) * Math.log((1 - con) / (1 + con))));
    }
    else {
      return (2 * sinphi);
    }
  }

  /*
    reference
      "New Equal-Area Map Projections for Noncircular Regions", John P. Snyder,
      The American Cartographer, Vol 15, No. 4, October 1988, pp. 341-355.
    */

  var S_POLE = 1;

  var N_POLE = 2;
  var EQUIT = 3;
  var OBLIQ = 4;

  /* Initialize the Lambert Azimuthal Equal Area projection
    ------------------------------------------------------*/
  function init$i() {
    var t = Math.abs(this.lat0);
    if (Math.abs(t - HALF_PI) < EPSLN) {
      this.mode = this.lat0 < 0 ? this.S_POLE : this.N_POLE;
    }
    else if (Math.abs(t) < EPSLN) {
      this.mode = this.EQUIT;
    }
    else {
      this.mode = this.OBLIQ;
    }
    if (this.es > 0) {
      var sinphi;

      this.qp = qsfnz(this.e, 1);
      this.mmf = 0.5 / (1 - this.es);
      this.apa = authset(this.es);
      switch (this.mode) {
      case this.N_POLE:
        this.dd = 1;
        break;
      case this.S_POLE:
        this.dd = 1;
        break;
      case this.EQUIT:
        this.rq = Math.sqrt(0.5 * this.qp);
        this.dd = 1 / this.rq;
        this.xmf = 1;
        this.ymf = 0.5 * this.qp;
        break;
      case this.OBLIQ:
        this.rq = Math.sqrt(0.5 * this.qp);
        sinphi = Math.sin(this.lat0);
        this.sinb1 = qsfnz(this.e, sinphi) / this.qp;
        this.cosb1 = Math.sqrt(1 - this.sinb1 * this.sinb1);
        this.dd = Math.cos(this.lat0) / (Math.sqrt(1 - this.es * sinphi * sinphi) * this.rq * this.cosb1);
        this.ymf = (this.xmf = this.rq) / this.dd;
        this.xmf *= this.dd;
        break;
      }
    }
    else {
      if (this.mode === this.OBLIQ) {
        this.sinph0 = Math.sin(this.lat0);
        this.cosph0 = Math.cos(this.lat0);
      }
    }
  }

  /* Lambert Azimuthal Equal Area forward equations--mapping lat,long to x,y
    -----------------------------------------------------------------------*/
  function forward$i(p) {

    /* Forward equations
        -----------------*/
    var x, y, coslam, sinlam, sinphi, q, sinb, cosb, b, cosphi;
    var lam = p.x;
    var phi = p.y;

    lam = adjust_lon(lam - this.long0);
    if (this.sphere) {
      sinphi = Math.sin(phi);
      cosphi = Math.cos(phi);
      coslam = Math.cos(lam);
      if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
        y = (this.mode === this.EQUIT) ? 1 + cosphi * coslam : 1 + this.sinph0 * sinphi + this.cosph0 * cosphi * coslam;
        if (y <= EPSLN) {
          return null;
        }
        y = Math.sqrt(2 / y);
        x = y * cosphi * Math.sin(lam);
        y *= (this.mode === this.EQUIT) ? sinphi : this.cosph0 * sinphi - this.sinph0 * cosphi * coslam;
      }
      else if (this.mode === this.N_POLE || this.mode === this.S_POLE) {
        if (this.mode === this.N_POLE) {
          coslam = -coslam;
        }
        if (Math.abs(phi + this.lat0) < EPSLN) {
          return null;
        }
        y = FORTPI - phi * 0.5;
        y = 2 * ((this.mode === this.S_POLE) ? Math.cos(y) : Math.sin(y));
        x = y * Math.sin(lam);
        y *= coslam;
      }
    }
    else {
      sinb = 0;
      cosb = 0;
      b = 0;
      coslam = Math.cos(lam);
      sinlam = Math.sin(lam);
      sinphi = Math.sin(phi);
      q = qsfnz(this.e, sinphi);
      if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
        sinb = q / this.qp;
        cosb = Math.sqrt(1 - sinb * sinb);
      }
      switch (this.mode) {
      case this.OBLIQ:
        b = 1 + this.sinb1 * sinb + this.cosb1 * cosb * coslam;
        break;
      case this.EQUIT:
        b = 1 + cosb * coslam;
        break;
      case this.N_POLE:
        b = HALF_PI + phi;
        q = this.qp - q;
        break;
      case this.S_POLE:
        b = phi - HALF_PI;
        q = this.qp + q;
        break;
      }
      if (Math.abs(b) < EPSLN) {
        return null;
      }
      switch (this.mode) {
      case this.OBLIQ:
      case this.EQUIT:
        b = Math.sqrt(2 / b);
        if (this.mode === this.OBLIQ) {
          y = this.ymf * b * (this.cosb1 * sinb - this.sinb1 * cosb * coslam);
        }
        else {
          y = (b = Math.sqrt(2 / (1 + cosb * coslam))) * sinb * this.ymf;
        }
        x = this.xmf * b * cosb * sinlam;
        break;
      case this.N_POLE:
      case this.S_POLE:
        if (q >= 0) {
          x = (b = Math.sqrt(q)) * sinlam;
          y = coslam * ((this.mode === this.S_POLE) ? b : -b);
        }
        else {
          x = y = 0;
        }
        break;
      }
    }

    p.x = this.a * x + this.x0;
    p.y = this.a * y + this.y0;
    return p;
  }

  /* Inverse equations
    -----------------*/
  function inverse$i(p) {
    p.x -= this.x0;
    p.y -= this.y0;
    var x = p.x / this.a;
    var y = p.y / this.a;
    var lam, phi, cCe, sCe, q, rho, ab;
    if (this.sphere) {
      var cosz = 0,
        rh, sinz = 0;

      rh = Math.sqrt(x * x + y * y);
      phi = rh * 0.5;
      if (phi > 1) {
        return null;
      }
      phi = 2 * Math.asin(phi);
      if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
        sinz = Math.sin(phi);
        cosz = Math.cos(phi);
      }
      switch (this.mode) {
      case this.EQUIT:
        phi = (Math.abs(rh) <= EPSLN) ? 0 : Math.asin(y * sinz / rh);
        x *= sinz;
        y = cosz * rh;
        break;
      case this.OBLIQ:
        phi = (Math.abs(rh) <= EPSLN) ? this.lat0 : Math.asin(cosz * this.sinph0 + y * sinz * this.cosph0 / rh);
        x *= sinz * this.cosph0;
        y = (cosz - Math.sin(phi) * this.sinph0) * rh;
        break;
      case this.N_POLE:
        y = -y;
        phi = HALF_PI - phi;
        break;
      case this.S_POLE:
        phi -= HALF_PI;
        break;
      }
      lam = (y === 0 && (this.mode === this.EQUIT || this.mode === this.OBLIQ)) ? 0 : Math.atan2(x, y);
    }
    else {
      ab = 0;
      if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
        x /= this.dd;
        y *= this.dd;
        rho = Math.sqrt(x * x + y * y);
        if (rho < EPSLN) {
          p.x = this.long0;
          p.y = this.lat0;
          return p;
        }
        sCe = 2 * Math.asin(0.5 * rho / this.rq);
        cCe = Math.cos(sCe);
        x *= (sCe = Math.sin(sCe));
        if (this.mode === this.OBLIQ) {
          ab = cCe * this.sinb1 + y * sCe * this.cosb1 / rho;
          q = this.qp * ab;
          y = rho * this.cosb1 * cCe - y * this.sinb1 * sCe;
        }
        else {
          ab = y * sCe / rho;
          q = this.qp * ab;
          y = rho * cCe;
        }
      }
      else if (this.mode === this.N_POLE || this.mode === this.S_POLE) {
        if (this.mode === this.N_POLE) {
          y = -y;
        }
        q = (x * x + y * y);
        if (!q) {
          p.x = this.long0;
          p.y = this.lat0;
          return p;
        }
        ab = 1 - q / this.qp;
        if (this.mode === this.S_POLE) {
          ab = -ab;
        }
      }
      lam = Math.atan2(x, y);
      phi = authlat(Math.asin(ab), this.apa);
    }

    p.x = adjust_lon(this.long0 + lam);
    p.y = phi;
    return p;
  }

  /* determine latitude from authalic latitude */
  var P00 = 0.33333333333333333333;

  var P01 = 0.17222222222222222222;
  var P02 = 0.10257936507936507936;
  var P10 = 0.06388888888888888888;
  var P11 = 0.06640211640211640211;
  var P20 = 0.01641501294219154443;

  function authset(es) {
    var t;
    var APA = [];
    APA[0] = es * P00;
    t = es * es;
    APA[0] += t * P01;
    APA[1] = t * P10;
    t *= es;
    APA[0] += t * P02;
    APA[1] += t * P11;
    APA[2] = t * P20;
    return APA;
  }

  function authlat(beta, APA) {
    var t = beta + beta;
    return (beta + APA[0] * Math.sin(t) + APA[1] * Math.sin(t + t) + APA[2] * Math.sin(t + t + t));
  }

  var names$i = ["Lambert Azimuthal Equal Area", "Lambert_Azimuthal_Equal_Area", "laea"];
  var laea = {
    init: init$i,
    forward: forward$i,
    inverse: inverse$i,
    names: names$i,
    S_POLE: S_POLE,
    N_POLE: N_POLE,
    EQUIT: EQUIT,
    OBLIQ: OBLIQ
  };

  function asinz(x) {
    if (Math.abs(x) > 1) {
      x = (x > 1) ? 1 : -1;
    }
    return Math.asin(x);
  }

  function init$h() {

    if (Math.abs(this.lat1 + this.lat2) < EPSLN) {
      return;
    }
    this.temp = this.b / this.a;
    this.es = 1 - Math.pow(this.temp, 2);
    this.e3 = Math.sqrt(this.es);

    this.sin_po = Math.sin(this.lat1);
    this.cos_po = Math.cos(this.lat1);
    this.t1 = this.sin_po;
    this.con = this.sin_po;
    this.ms1 = msfnz(this.e3, this.sin_po, this.cos_po);
    this.qs1 = qsfnz(this.e3, this.sin_po);

    this.sin_po = Math.sin(this.lat2);
    this.cos_po = Math.cos(this.lat2);
    this.t2 = this.sin_po;
    this.ms2 = msfnz(this.e3, this.sin_po, this.cos_po);
    this.qs2 = qsfnz(this.e3, this.sin_po);

    this.sin_po = Math.sin(this.lat0);
    this.cos_po = Math.cos(this.lat0);
    this.t3 = this.sin_po;
    this.qs0 = qsfnz(this.e3, this.sin_po);

    if (Math.abs(this.lat1 - this.lat2) > EPSLN) {
      this.ns0 = (this.ms1 * this.ms1 - this.ms2 * this.ms2) / (this.qs2 - this.qs1);
    }
    else {
      this.ns0 = this.con;
    }
    this.c = this.ms1 * this.ms1 + this.ns0 * this.qs1;
    this.rh = this.a * Math.sqrt(this.c - this.ns0 * this.qs0) / this.ns0;
  }

  /* Albers Conical Equal Area forward equations--mapping lat,long to x,y
    -------------------------------------------------------------------*/
  function forward$h(p) {

    var lon = p.x;
    var lat = p.y;

    this.sin_phi = Math.sin(lat);
    this.cos_phi = Math.cos(lat);

    var qs = qsfnz(this.e3, this.sin_phi);
    var rh1 = this.a * Math.sqrt(this.c - this.ns0 * qs) / this.ns0;
    var theta = this.ns0 * adjust_lon(lon - this.long0);
    var x = rh1 * Math.sin(theta) + this.x0;
    var y = this.rh - rh1 * Math.cos(theta) + this.y0;

    p.x = x;
    p.y = y;
    return p;
  }

  function inverse$h(p) {
    var rh1, qs, con, theta, lon, lat;

    p.x -= this.x0;
    p.y = this.rh - p.y + this.y0;
    if (this.ns0 >= 0) {
      rh1 = Math.sqrt(p.x * p.x + p.y * p.y);
      con = 1;
    }
    else {
      rh1 = -Math.sqrt(p.x * p.x + p.y * p.y);
      con = -1;
    }
    theta = 0;
    if (rh1 !== 0) {
      theta = Math.atan2(con * p.x, con * p.y);
    }
    con = rh1 * this.ns0 / this.a;
    if (this.sphere) {
      lat = Math.asin((this.c - con * con) / (2 * this.ns0));
    }
    else {
      qs = (this.c - con * con) / this.ns0;
      lat = this.phi1z(this.e3, qs);
    }

    lon = adjust_lon(theta / this.ns0 + this.long0);
    p.x = lon;
    p.y = lat;
    return p;
  }

  /* Function to compute phi1, the latitude for the inverse of the
     Albers Conical Equal-Area projection.
  -------------------------------------------*/
  function phi1z(eccent, qs) {
    var sinphi, cosphi, con, com, dphi;
    var phi = asinz(0.5 * qs);
    if (eccent < EPSLN) {
      return phi;
    }

    var eccnts = eccent * eccent;
    for (var i = 1; i <= 25; i++) {
      sinphi = Math.sin(phi);
      cosphi = Math.cos(phi);
      con = eccent * sinphi;
      com = 1 - con * con;
      dphi = 0.5 * com * com / cosphi * (qs / (1 - eccnts) - sinphi / com + 0.5 / eccent * Math.log((1 - con) / (1 + con)));
      phi = phi + dphi;
      if (Math.abs(dphi) <= 1e-7) {
        return phi;
      }
    }
    return null;
  }

  var names$h = ["Albers_Conic_Equal_Area", "Albers", "aea"];
  var aea = {
    init: init$h,
    forward: forward$h,
    inverse: inverse$h,
    names: names$h,
    phi1z: phi1z
  };

  /*
    reference:
      Wolfram Mathworld "Gnomonic Projection"
      http://mathworld.wolfram.com/GnomonicProjection.html
      Accessed: 12th November 2009
    */
  function init$g() {

    /* Place parameters in static storage for common use
        -------------------------------------------------*/
    this.sin_p14 = Math.sin(this.lat0);
    this.cos_p14 = Math.cos(this.lat0);
    // Approximation for projecting points to the horizon (infinity)
    this.infinity_dist = 1000 * this.a;
    this.rc = 1;
  }

  /* Gnomonic forward equations--mapping lat,long to x,y
      ---------------------------------------------------*/
  function forward$g(p) {
    var sinphi, cosphi; /* sin and cos value        */
    var dlon; /* delta longitude value      */
    var coslon; /* cos of longitude        */
    var ksp; /* scale factor          */
    var g;
    var x, y;
    var lon = p.x;
    var lat = p.y;
    /* Forward equations
        -----------------*/
    dlon = adjust_lon(lon - this.long0);

    sinphi = Math.sin(lat);
    cosphi = Math.cos(lat);

    coslon = Math.cos(dlon);
    g = this.sin_p14 * sinphi + this.cos_p14 * cosphi * coslon;
    ksp = 1;
    if ((g > 0) || (Math.abs(g) <= EPSLN)) {
      x = this.x0 + this.a * ksp * cosphi * Math.sin(dlon) / g;
      y = this.y0 + this.a * ksp * (this.cos_p14 * sinphi - this.sin_p14 * cosphi * coslon) / g;
    }
    else {

      // Point is in the opposing hemisphere and is unprojectable
      // We still need to return a reasonable point, so we project
      // to infinity, on a bearing
      // equivalent to the northern hemisphere equivalent
      // This is a reasonable approximation for short shapes and lines that
      // straddle the horizon.

      x = this.x0 + this.infinity_dist * cosphi * Math.sin(dlon);
      y = this.y0 + this.infinity_dist * (this.cos_p14 * sinphi - this.sin_p14 * cosphi * coslon);

    }
    p.x = x;
    p.y = y;
    return p;
  }

  function inverse$g(p) {
    var rh; /* Rho */
    var sinc, cosc;
    var c;
    var lon, lat;

    /* Inverse equations
        -----------------*/
    p.x = (p.x - this.x0) / this.a;
    p.y = (p.y - this.y0) / this.a;

    p.x /= this.k0;
    p.y /= this.k0;

    if ((rh = Math.sqrt(p.x * p.x + p.y * p.y))) {
      c = Math.atan2(rh, this.rc);
      sinc = Math.sin(c);
      cosc = Math.cos(c);

      lat = asinz(cosc * this.sin_p14 + (p.y * sinc * this.cos_p14) / rh);
      lon = Math.atan2(p.x * sinc, rh * this.cos_p14 * cosc - p.y * this.sin_p14 * sinc);
      lon = adjust_lon(this.long0 + lon);
    }
    else {
      lat = this.phic0;
      lon = 0;
    }

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$g = ["gnom"];
  var gnom = {
    init: init$g,
    forward: forward$g,
    inverse: inverse$g,
    names: names$g
  };

  function iqsfnz(eccent, q) {
    var temp = 1 - (1 - eccent * eccent) / (2 * eccent) * Math.log((1 - eccent) / (1 + eccent));
    if (Math.abs(Math.abs(q) - temp) < 1.0E-6) {
      if (q < 0) {
        return (-1 * HALF_PI);
      }
      else {
        return HALF_PI;
      }
    }
    //var phi = 0.5* q/(1-eccent*eccent);
    var phi = Math.asin(0.5 * q);
    var dphi;
    var sin_phi;
    var cos_phi;
    var con;
    for (var i = 0; i < 30; i++) {
      sin_phi = Math.sin(phi);
      cos_phi = Math.cos(phi);
      con = eccent * sin_phi;
      dphi = Math.pow(1 - con * con, 2) / (2 * cos_phi) * (q / (1 - eccent * eccent) - sin_phi / (1 - con * con) + 0.5 / eccent * Math.log((1 - con) / (1 + con)));
      phi += dphi;
      if (Math.abs(dphi) <= 0.0000000001) {
        return phi;
      }
    }

    //console.log("IQSFN-CONV:Latitude failed to converge after 30 iterations");
    return NaN;
  }

  /*
    reference:
      "Cartographic Projection Procedures for the UNIX Environment-
      A User's Manual" by Gerald I. Evenden,
      USGS Open File Report 90-284and Release 4 Interim Reports (2003)
  */
  function init$f() {
    //no-op
    if (!this.sphere) {
      this.k0 = msfnz(this.e, Math.sin(this.lat_ts), Math.cos(this.lat_ts));
    }
  }

  /* Cylindrical Equal Area forward equations--mapping lat,long to x,y
      ------------------------------------------------------------*/
  function forward$f(p) {
    var lon = p.x;
    var lat = p.y;
    var x, y;
    /* Forward equations
        -----------------*/
    var dlon = adjust_lon(lon - this.long0);
    if (this.sphere) {
      x = this.x0 + this.a * dlon * Math.cos(this.lat_ts);
      y = this.y0 + this.a * Math.sin(lat) / Math.cos(this.lat_ts);
    }
    else {
      var qs = qsfnz(this.e, Math.sin(lat));
      x = this.x0 + this.a * this.k0 * dlon;
      y = this.y0 + this.a * qs * 0.5 / this.k0;
    }

    p.x = x;
    p.y = y;
    return p;
  }

  /* Cylindrical Equal Area inverse equations--mapping x,y to lat/long
      ------------------------------------------------------------*/
  function inverse$f(p) {
    p.x -= this.x0;
    p.y -= this.y0;
    var lon, lat;

    if (this.sphere) {
      lon = adjust_lon(this.long0 + (p.x / this.a) / Math.cos(this.lat_ts));
      lat = Math.asin((p.y / this.a) * Math.cos(this.lat_ts));
    }
    else {
      lat = iqsfnz(this.e, 2 * p.y * this.k0 / this.a);
      lon = adjust_lon(this.long0 + p.x / (this.a * this.k0));
    }

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$f = ["cea"];
  var cea = {
    init: init$f,
    forward: forward$f,
    inverse: inverse$f,
    names: names$f
  };

  function init$e() {

    this.x0 = this.x0 || 0;
    this.y0 = this.y0 || 0;
    this.lat0 = this.lat0 || 0;
    this.long0 = this.long0 || 0;
    this.lat_ts = this.lat_ts || 0;
    this.title = this.title || "Equidistant Cylindrical (Plate Carre)";

    this.rc = Math.cos(this.lat_ts);
  }

  // forward equations--mapping lat,long to x,y
  // -----------------------------------------------------------------
  function forward$e(p) {

    var lon = p.x;
    var lat = p.y;

    var dlon = adjust_lon(lon - this.long0);
    var dlat = adjust_lat(lat - this.lat0);
    p.x = this.x0 + (this.a * dlon * this.rc);
    p.y = this.y0 + (this.a * dlat);
    return p;
  }

  // inverse equations--mapping x,y to lat/long
  // -----------------------------------------------------------------
  function inverse$e(p) {

    var x = p.x;
    var y = p.y;

    p.x = adjust_lon(this.long0 + ((x - this.x0) / (this.a * this.rc)));
    p.y = adjust_lat(this.lat0 + ((y - this.y0) / (this.a)));
    return p;
  }

  var names$e = ["Equirectangular", "Equidistant_Cylindrical", "eqc"];
  var eqc = {
    init: init$e,
    forward: forward$e,
    inverse: inverse$e,
    names: names$e
  };

  var MAX_ITER$1 = 20;

  function init$d() {
    /* Place parameters in static storage for common use
        -------------------------------------------------*/
    this.temp = this.b / this.a;
    this.es = 1 - Math.pow(this.temp, 2); // devait etre dans tmerc.js mais n y est pas donc je commente sinon retour de valeurs nulles
    this.e = Math.sqrt(this.es);
    this.e0 = e0fn(this.es);
    this.e1 = e1fn(this.es);
    this.e2 = e2fn(this.es);
    this.e3 = e3fn(this.es);
    this.ml0 = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, this.lat0); //si que des zeros le calcul ne se fait pas
  }

  /* Polyconic forward equations--mapping lat,long to x,y
      ---------------------------------------------------*/
  function forward$d(p) {
    var lon = p.x;
    var lat = p.y;
    var x, y, el;
    var dlon = adjust_lon(lon - this.long0);
    el = dlon * Math.sin(lat);
    if (this.sphere) {
      if (Math.abs(lat) <= EPSLN) {
        x = this.a * dlon;
        y = -1 * this.a * this.lat0;
      }
      else {
        x = this.a * Math.sin(el) / Math.tan(lat);
        y = this.a * (adjust_lat(lat - this.lat0) + (1 - Math.cos(el)) / Math.tan(lat));
      }
    }
    else {
      if (Math.abs(lat) <= EPSLN) {
        x = this.a * dlon;
        y = -1 * this.ml0;
      }
      else {
        var nl = gN(this.a, this.e, Math.sin(lat)) / Math.tan(lat);
        x = nl * Math.sin(el);
        y = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, lat) - this.ml0 + nl * (1 - Math.cos(el));
      }

    }
    p.x = x + this.x0;
    p.y = y + this.y0;
    return p;
  }

  /* Inverse equations
    -----------------*/
  function inverse$d(p) {
    var lon, lat, x, y, i;
    var al, bl;
    var phi, dphi;
    x = p.x - this.x0;
    y = p.y - this.y0;

    if (this.sphere) {
      if (Math.abs(y + this.a * this.lat0) <= EPSLN) {
        lon = adjust_lon(x / this.a + this.long0);
        lat = 0;
      }
      else {
        al = this.lat0 + y / this.a;
        bl = x * x / this.a / this.a + al * al;
        phi = al;
        var tanphi;
        for (i = MAX_ITER$1; i; --i) {
          tanphi = Math.tan(phi);
          dphi = -1 * (al * (phi * tanphi + 1) - phi - 0.5 * (phi * phi + bl) * tanphi) / ((phi - al) / tanphi - 1);
          phi += dphi;
          if (Math.abs(dphi) <= EPSLN) {
            lat = phi;
            break;
          }
        }
        lon = adjust_lon(this.long0 + (Math.asin(x * Math.tan(phi) / this.a)) / Math.sin(lat));
      }
    }
    else {
      if (Math.abs(y + this.ml0) <= EPSLN) {
        lat = 0;
        lon = adjust_lon(this.long0 + x / this.a);
      }
      else {

        al = (this.ml0 + y) / this.a;
        bl = x * x / this.a / this.a + al * al;
        phi = al;
        var cl, mln, mlnp, ma;
        var con;
        for (i = MAX_ITER$1; i; --i) {
          con = this.e * Math.sin(phi);
          cl = Math.sqrt(1 - con * con) * Math.tan(phi);
          mln = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, phi);
          mlnp = this.e0 - 2 * this.e1 * Math.cos(2 * phi) + 4 * this.e2 * Math.cos(4 * phi) - 6 * this.e3 * Math.cos(6 * phi);
          ma = mln / this.a;
          dphi = (al * (cl * ma + 1) - ma - 0.5 * cl * (ma * ma + bl)) / (this.es * Math.sin(2 * phi) * (ma * ma + bl - 2 * al * ma) / (4 * cl) + (al - ma) * (cl * mlnp - 2 / Math.sin(2 * phi)) - mlnp);
          phi -= dphi;
          if (Math.abs(dphi) <= EPSLN) {
            lat = phi;
            break;
          }
        }

        //lat=phi4z(this.e,this.e0,this.e1,this.e2,this.e3,al,bl,0,0);
        cl = Math.sqrt(1 - this.es * Math.pow(Math.sin(lat), 2)) * Math.tan(lat);
        lon = adjust_lon(this.long0 + Math.asin(x * cl / this.a) / Math.sin(lat));
      }
    }

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$d = ["Polyconic", "poly"];
  var poly = {
    init: init$d,
    forward: forward$d,
    inverse: inverse$d,
    names: names$d
  };

  function init$c() {
    this.A = [];
    this.A[1] = 0.6399175073;
    this.A[2] = -0.1358797613;
    this.A[3] = 0.063294409;
    this.A[4] = -0.02526853;
    this.A[5] = 0.0117879;
    this.A[6] = -0.0055161;
    this.A[7] = 0.0026906;
    this.A[8] = -0.001333;
    this.A[9] = 0.00067;
    this.A[10] = -0.00034;

    this.B_re = [];
    this.B_im = [];
    this.B_re[1] = 0.7557853228;
    this.B_im[1] = 0;
    this.B_re[2] = 0.249204646;
    this.B_im[2] = 0.003371507;
    this.B_re[3] = -0.001541739;
    this.B_im[3] = 0.041058560;
    this.B_re[4] = -0.10162907;
    this.B_im[4] = 0.01727609;
    this.B_re[5] = -0.26623489;
    this.B_im[5] = -0.36249218;
    this.B_re[6] = -0.6870983;
    this.B_im[6] = -1.1651967;

    this.C_re = [];
    this.C_im = [];
    this.C_re[1] = 1.3231270439;
    this.C_im[1] = 0;
    this.C_re[2] = -0.577245789;
    this.C_im[2] = -0.007809598;
    this.C_re[3] = 0.508307513;
    this.C_im[3] = -0.112208952;
    this.C_re[4] = -0.15094762;
    this.C_im[4] = 0.18200602;
    this.C_re[5] = 1.01418179;
    this.C_im[5] = 1.64497696;
    this.C_re[6] = 1.9660549;
    this.C_im[6] = 2.5127645;

    this.D = [];
    this.D[1] = 1.5627014243;
    this.D[2] = 0.5185406398;
    this.D[3] = -0.03333098;
    this.D[4] = -0.1052906;
    this.D[5] = -0.0368594;
    this.D[6] = 0.007317;
    this.D[7] = 0.01220;
    this.D[8] = 0.00394;
    this.D[9] = -0.0013;
  }

  /**
      New Zealand Map Grid Forward  - long/lat to x/y
      long/lat in radians
    */
  function forward$c(p) {
    var n;
    var lon = p.x;
    var lat = p.y;

    var delta_lat = lat - this.lat0;
    var delta_lon = lon - this.long0;

    // 1. Calculate d_phi and d_psi    ...                          // and d_lambda
    // For this algorithm, delta_latitude is in seconds of arc x 10-5, so we need to scale to those units. Longitude is radians.
    var d_phi = delta_lat / SEC_TO_RAD * 1E-5;
    var d_lambda = delta_lon;
    var d_phi_n = 1; // d_phi^0

    var d_psi = 0;
    for (n = 1; n <= 10; n++) {
      d_phi_n = d_phi_n * d_phi;
      d_psi = d_psi + this.A[n] * d_phi_n;
    }

    // 2. Calculate theta
    var th_re = d_psi;
    var th_im = d_lambda;

    // 3. Calculate z
    var th_n_re = 1;
    var th_n_im = 0; // theta^0
    var th_n_re1;
    var th_n_im1;

    var z_re = 0;
    var z_im = 0;
    for (n = 1; n <= 6; n++) {
      th_n_re1 = th_n_re * th_re - th_n_im * th_im;
      th_n_im1 = th_n_im * th_re + th_n_re * th_im;
      th_n_re = th_n_re1;
      th_n_im = th_n_im1;
      z_re = z_re + this.B_re[n] * th_n_re - this.B_im[n] * th_n_im;
      z_im = z_im + this.B_im[n] * th_n_re + this.B_re[n] * th_n_im;
    }

    // 4. Calculate easting and northing
    p.x = (z_im * this.a) + this.x0;
    p.y = (z_re * this.a) + this.y0;

    return p;
  }

  /**
      New Zealand Map Grid Inverse  -  x/y to long/lat
    */
  function inverse$c(p) {
    var n;
    var x = p.x;
    var y = p.y;

    var delta_x = x - this.x0;
    var delta_y = y - this.y0;

    // 1. Calculate z
    var z_re = delta_y / this.a;
    var z_im = delta_x / this.a;

    // 2a. Calculate theta - first approximation gives km accuracy
    var z_n_re = 1;
    var z_n_im = 0; // z^0
    var z_n_re1;
    var z_n_im1;

    var th_re = 0;
    var th_im = 0;
    for (n = 1; n <= 6; n++) {
      z_n_re1 = z_n_re * z_re - z_n_im * z_im;
      z_n_im1 = z_n_im * z_re + z_n_re * z_im;
      z_n_re = z_n_re1;
      z_n_im = z_n_im1;
      th_re = th_re + this.C_re[n] * z_n_re - this.C_im[n] * z_n_im;
      th_im = th_im + this.C_im[n] * z_n_re + this.C_re[n] * z_n_im;
    }

    // 2b. Iterate to refine the accuracy of the calculation
    //        0 iterations gives km accuracy
    //        1 iteration gives m accuracy -- good enough for most mapping applications
    //        2 iterations bives mm accuracy
    for (var i = 0; i < this.iterations; i++) {
      var th_n_re = th_re;
      var th_n_im = th_im;
      var th_n_re1;
      var th_n_im1;

      var num_re = z_re;
      var num_im = z_im;
      for (n = 2; n <= 6; n++) {
        th_n_re1 = th_n_re * th_re - th_n_im * th_im;
        th_n_im1 = th_n_im * th_re + th_n_re * th_im;
        th_n_re = th_n_re1;
        th_n_im = th_n_im1;
        num_re = num_re + (n - 1) * (this.B_re[n] * th_n_re - this.B_im[n] * th_n_im);
        num_im = num_im + (n - 1) * (this.B_im[n] * th_n_re + this.B_re[n] * th_n_im);
      }

      th_n_re = 1;
      th_n_im = 0;
      var den_re = this.B_re[1];
      var den_im = this.B_im[1];
      for (n = 2; n <= 6; n++) {
        th_n_re1 = th_n_re * th_re - th_n_im * th_im;
        th_n_im1 = th_n_im * th_re + th_n_re * th_im;
        th_n_re = th_n_re1;
        th_n_im = th_n_im1;
        den_re = den_re + n * (this.B_re[n] * th_n_re - this.B_im[n] * th_n_im);
        den_im = den_im + n * (this.B_im[n] * th_n_re + this.B_re[n] * th_n_im);
      }

      // Complex division
      var den2 = den_re * den_re + den_im * den_im;
      th_re = (num_re * den_re + num_im * den_im) / den2;
      th_im = (num_im * den_re - num_re * den_im) / den2;
    }

    // 3. Calculate d_phi              ...                                    // and d_lambda
    var d_psi = th_re;
    var d_lambda = th_im;
    var d_psi_n = 1; // d_psi^0

    var d_phi = 0;
    for (n = 1; n <= 9; n++) {
      d_psi_n = d_psi_n * d_psi;
      d_phi = d_phi + this.D[n] * d_psi_n;
    }

    // 4. Calculate latitude and longitude
    // d_phi is calcuated in second of arc * 10^-5, so we need to scale back to radians. d_lambda is in radians.
    var lat = this.lat0 + (d_phi * SEC_TO_RAD * 1E5);
    var lon = this.long0 + d_lambda;

    p.x = lon;
    p.y = lat;

    return p;
  }

  var names$c = ["New_Zealand_Map_Grid", "nzmg"];
  var nzmg = {
    init: init$c,
    forward: forward$c,
    inverse: inverse$c,
    names: names$c
  };

  /*
    reference
      "New Equal-Area Map Projections for Noncircular Regions", John P. Snyder,
      The American Cartographer, Vol 15, No. 4, October 1988, pp. 341-355.
    */


  /* Initialize the Miller Cylindrical projection
    -------------------------------------------*/
  function init$b() {
    //no-op
  }

  /* Miller Cylindrical forward equations--mapping lat,long to x,y
      ------------------------------------------------------------*/
  function forward$b(p) {
    var lon = p.x;
    var lat = p.y;
    /* Forward equations
        -----------------*/
    var dlon = adjust_lon(lon - this.long0);
    var x = this.x0 + this.a * dlon;
    var y = this.y0 + this.a * Math.log(Math.tan((Math.PI / 4) + (lat / 2.5))) * 1.25;

    p.x = x;
    p.y = y;
    return p;
  }

  /* Miller Cylindrical inverse equations--mapping x,y to lat/long
      ------------------------------------------------------------*/
  function inverse$b(p) {
    p.x -= this.x0;
    p.y -= this.y0;

    var lon = adjust_lon(this.long0 + p.x / this.a);
    var lat = 2.5 * (Math.atan(Math.exp(0.8 * p.y / this.a)) - Math.PI / 4);

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$b = ["Miller_Cylindrical", "mill"];
  var mill = {
    init: init$b,
    forward: forward$b,
    inverse: inverse$b,
    names: names$b
  };

  var MAX_ITER = 20;


  function init$a() {
    /* Place parameters in static storage for common use
      -------------------------------------------------*/


    if (!this.sphere) {
      this.en = pj_enfn(this.es);
    }
    else {
      this.n = 1;
      this.m = 0;
      this.es = 0;
      this.C_y = Math.sqrt((this.m + 1) / this.n);
      this.C_x = this.C_y / (this.m + 1);
    }

  }

  /* Sinusoidal forward equations--mapping lat,long to x,y
    -----------------------------------------------------*/
  function forward$a(p) {
    var x, y;
    var lon = p.x;
    var lat = p.y;
    /* Forward equations
      -----------------*/
    lon = adjust_lon(lon - this.long0);

    if (this.sphere) {
      if (!this.m) {
        lat = this.n !== 1 ? Math.asin(this.n * Math.sin(lat)) : lat;
      }
      else {
        var k = this.n * Math.sin(lat);
        for (var i = MAX_ITER; i; --i) {
          var V = (this.m * lat + Math.sin(lat) - k) / (this.m + Math.cos(lat));
          lat -= V;
          if (Math.abs(V) < EPSLN) {
            break;
          }
        }
      }
      x = this.a * this.C_x * lon * (this.m + Math.cos(lat));
      y = this.a * this.C_y * lat;

    }
    else {

      var s = Math.sin(lat);
      var c = Math.cos(lat);
      y = this.a * pj_mlfn(lat, s, c, this.en);
      x = this.a * lon * c / Math.sqrt(1 - this.es * s * s);
    }

    p.x = x;
    p.y = y;
    return p;
  }

  function inverse$a(p) {
    var lat, temp, lon, s;

    p.x -= this.x0;
    lon = p.x / this.a;
    p.y -= this.y0;
    lat = p.y / this.a;

    if (this.sphere) {
      lat /= this.C_y;
      lon = lon / (this.C_x * (this.m + Math.cos(lat)));
      if (this.m) {
        lat = asinz((this.m * lat + Math.sin(lat)) / this.n);
      }
      else if (this.n !== 1) {
        lat = asinz(Math.sin(lat) / this.n);
      }
      lon = adjust_lon(lon + this.long0);
      lat = adjust_lat(lat);
    }
    else {
      lat = pj_inv_mlfn(p.y / this.a, this.es, this.en);
      s = Math.abs(lat);
      if (s < HALF_PI) {
        s = Math.sin(lat);
        temp = this.long0 + p.x * Math.sqrt(1 - this.es * s * s) / (this.a * Math.cos(lat));
        //temp = this.long0 + p.x / (this.a * Math.cos(lat));
        lon = adjust_lon(temp);
      }
      else if ((s - EPSLN) < HALF_PI) {
        lon = this.long0;
      }
    }
    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$a = ["Sinusoidal", "sinu"];
  var sinu = {
    init: init$a,
    forward: forward$a,
    inverse: inverse$a,
    names: names$a
  };

  function init$9() {}
  /* Mollweide forward equations--mapping lat,long to x,y
      ----------------------------------------------------*/
  function forward$9(p) {

    /* Forward equations
        -----------------*/
    var lon = p.x;
    var lat = p.y;

    var delta_lon = adjust_lon(lon - this.long0);
    var theta = lat;
    var con = Math.PI * Math.sin(lat);

    /* Iterate using the Newton-Raphson method to find theta
        -----------------------------------------------------*/
    while (true) {
      var delta_theta = -(theta + Math.sin(theta) - con) / (1 + Math.cos(theta));
      theta += delta_theta;
      if (Math.abs(delta_theta) < EPSLN) {
        break;
      }
    }
    theta /= 2;

    /* If the latitude is 90 deg, force the x coordinate to be "0 + false easting"
         this is done here because of precision problems with "cos(theta)"
         --------------------------------------------------------------------------*/
    if (Math.PI / 2 - Math.abs(lat) < EPSLN) {
      delta_lon = 0;
    }
    var x = 0.900316316158 * this.a * delta_lon * Math.cos(theta) + this.x0;
    var y = 1.4142135623731 * this.a * Math.sin(theta) + this.y0;

    p.x = x;
    p.y = y;
    return p;
  }

  function inverse$9(p) {
    var theta;
    var arg;

    /* Inverse equations
        -----------------*/
    p.x -= this.x0;
    p.y -= this.y0;
    arg = p.y / (1.4142135623731 * this.a);

    /* Because of division by zero problems, 'arg' can not be 1.  Therefore
         a number very close to one is used instead.
         -------------------------------------------------------------------*/
    if (Math.abs(arg) > 0.999999999999) {
      arg = 0.999999999999;
    }
    theta = Math.asin(arg);
    var lon = adjust_lon(this.long0 + (p.x / (0.900316316158 * this.a * Math.cos(theta))));
    if (lon < (-Math.PI)) {
      lon = -Math.PI;
    }
    if (lon > Math.PI) {
      lon = Math.PI;
    }
    arg = (2 * theta + Math.sin(2 * theta)) / Math.PI;
    if (Math.abs(arg) > 1) {
      arg = 1;
    }
    var lat = Math.asin(arg);

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$9 = ["Mollweide", "moll"];
  var moll = {
    init: init$9,
    forward: forward$9,
    inverse: inverse$9,
    names: names$9
  };

  function init$8() {

    /* Place parameters in static storage for common use
        -------------------------------------------------*/
    // Standard Parallels cannot be equal and on opposite sides of the equator
    if (Math.abs(this.lat1 + this.lat2) < EPSLN) {
      return;
    }
    this.lat2 = this.lat2 || this.lat1;
    this.temp = this.b / this.a;
    this.es = 1 - Math.pow(this.temp, 2);
    this.e = Math.sqrt(this.es);
    this.e0 = e0fn(this.es);
    this.e1 = e1fn(this.es);
    this.e2 = e2fn(this.es);
    this.e3 = e3fn(this.es);

    this.sinphi = Math.sin(this.lat1);
    this.cosphi = Math.cos(this.lat1);

    this.ms1 = msfnz(this.e, this.sinphi, this.cosphi);
    this.ml1 = mlfn(this.e0, this.e1, this.e2, this.e3, this.lat1);

    if (Math.abs(this.lat1 - this.lat2) < EPSLN) {
      this.ns = this.sinphi;
    }
    else {
      this.sinphi = Math.sin(this.lat2);
      this.cosphi = Math.cos(this.lat2);
      this.ms2 = msfnz(this.e, this.sinphi, this.cosphi);
      this.ml2 = mlfn(this.e0, this.e1, this.e2, this.e3, this.lat2);
      this.ns = (this.ms1 - this.ms2) / (this.ml2 - this.ml1);
    }
    this.g = this.ml1 + this.ms1 / this.ns;
    this.ml0 = mlfn(this.e0, this.e1, this.e2, this.e3, this.lat0);
    this.rh = this.a * (this.g - this.ml0);
  }

  /* Equidistant Conic forward equations--mapping lat,long to x,y
    -----------------------------------------------------------*/
  function forward$8(p) {
    var lon = p.x;
    var lat = p.y;
    var rh1;

    /* Forward equations
        -----------------*/
    if (this.sphere) {
      rh1 = this.a * (this.g - lat);
    }
    else {
      var ml = mlfn(this.e0, this.e1, this.e2, this.e3, lat);
      rh1 = this.a * (this.g - ml);
    }
    var theta = this.ns * adjust_lon(lon - this.long0);
    var x = this.x0 + rh1 * Math.sin(theta);
    var y = this.y0 + this.rh - rh1 * Math.cos(theta);
    p.x = x;
    p.y = y;
    return p;
  }

  /* Inverse equations
    -----------------*/
  function inverse$8(p) {
    p.x -= this.x0;
    p.y = this.rh - p.y + this.y0;
    var con, rh1, lat, lon;
    if (this.ns >= 0) {
      rh1 = Math.sqrt(p.x * p.x + p.y * p.y);
      con = 1;
    }
    else {
      rh1 = -Math.sqrt(p.x * p.x + p.y * p.y);
      con = -1;
    }
    var theta = 0;
    if (rh1 !== 0) {
      theta = Math.atan2(con * p.x, con * p.y);
    }

    if (this.sphere) {
      lon = adjust_lon(this.long0 + theta / this.ns);
      lat = adjust_lat(this.g - rh1 / this.a);
      p.x = lon;
      p.y = lat;
      return p;
    }
    else {
      var ml = this.g - rh1 / this.a;
      lat = imlfn(ml, this.e0, this.e1, this.e2, this.e3);
      lon = adjust_lon(this.long0 + theta / this.ns);
      p.x = lon;
      p.y = lat;
      return p;
    }

  }

  var names$8 = ["Equidistant_Conic", "eqdc"];
  var eqdc = {
    init: init$8,
    forward: forward$8,
    inverse: inverse$8,
    names: names$8
  };

  /* Initialize the Van Der Grinten projection
    ----------------------------------------*/
  function init$7() {
    //this.R = 6370997; //Radius of earth
    this.R = this.a;
  }

  function forward$7(p) {

    var lon = p.x;
    var lat = p.y;

    /* Forward equations
      -----------------*/
    var dlon = adjust_lon(lon - this.long0);
    var x, y;

    if (Math.abs(lat) <= EPSLN) {
      x = this.x0 + this.R * dlon;
      y = this.y0;
    }
    var theta = asinz(2 * Math.abs(lat / Math.PI));
    if ((Math.abs(dlon) <= EPSLN) || (Math.abs(Math.abs(lat) - HALF_PI) <= EPSLN)) {
      x = this.x0;
      if (lat >= 0) {
        y = this.y0 + Math.PI * this.R * Math.tan(0.5 * theta);
      }
      else {
        y = this.y0 + Math.PI * this.R * -Math.tan(0.5 * theta);
      }
      //  return(OK);
    }
    var al = 0.5 * Math.abs((Math.PI / dlon) - (dlon / Math.PI));
    var asq = al * al;
    var sinth = Math.sin(theta);
    var costh = Math.cos(theta);

    var g = costh / (sinth + costh - 1);
    var gsq = g * g;
    var m = g * (2 / sinth - 1);
    var msq = m * m;
    var con = Math.PI * this.R * (al * (g - msq) + Math.sqrt(asq * (g - msq) * (g - msq) - (msq + asq) * (gsq - msq))) / (msq + asq);
    if (dlon < 0) {
      con = -con;
    }
    x = this.x0 + con;
    //con = Math.abs(con / (Math.PI * this.R));
    var q = asq + g;
    con = Math.PI * this.R * (m * q - al * Math.sqrt((msq + asq) * (asq + 1) - q * q)) / (msq + asq);
    if (lat >= 0) {
      //y = this.y0 + Math.PI * this.R * Math.sqrt(1 - con * con - 2 * al * con);
      y = this.y0 + con;
    }
    else {
      //y = this.y0 - Math.PI * this.R * Math.sqrt(1 - con * con - 2 * al * con);
      y = this.y0 - con;
    }
    p.x = x;
    p.y = y;
    return p;
  }

  /* Van Der Grinten inverse equations--mapping x,y to lat/long
    ---------------------------------------------------------*/
  function inverse$7(p) {
    var lon, lat;
    var xx, yy, xys, c1, c2, c3;
    var a1;
    var m1;
    var con;
    var th1;
    var d;

    /* inverse equations
      -----------------*/
    p.x -= this.x0;
    p.y -= this.y0;
    con = Math.PI * this.R;
    xx = p.x / con;
    yy = p.y / con;
    xys = xx * xx + yy * yy;
    c1 = -Math.abs(yy) * (1 + xys);
    c2 = c1 - 2 * yy * yy + xx * xx;
    c3 = -2 * c1 + 1 + 2 * yy * yy + xys * xys;
    d = yy * yy / c3 + (2 * c2 * c2 * c2 / c3 / c3 / c3 - 9 * c1 * c2 / c3 / c3) / 27;
    a1 = (c1 - c2 * c2 / 3 / c3) / c3;
    m1 = 2 * Math.sqrt(-a1 / 3);
    con = ((3 * d) / a1) / m1;
    if (Math.abs(con) > 1) {
      if (con >= 0) {
        con = 1;
      }
      else {
        con = -1;
      }
    }
    th1 = Math.acos(con) / 3;
    if (p.y >= 0) {
      lat = (-m1 * Math.cos(th1 + Math.PI / 3) - c2 / 3 / c3) * Math.PI;
    }
    else {
      lat = -(-m1 * Math.cos(th1 + Math.PI / 3) - c2 / 3 / c3) * Math.PI;
    }

    if (Math.abs(xx) < EPSLN) {
      lon = this.long0;
    }
    else {
      lon = adjust_lon(this.long0 + Math.PI * (xys - 1 + Math.sqrt(1 + 2 * (xx * xx - yy * yy) + xys * xys)) / 2 / xx);
    }

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$7 = ["Van_der_Grinten_I", "VanDerGrinten", "vandg"];
  var vandg = {
    init: init$7,
    forward: forward$7,
    inverse: inverse$7,
    names: names$7
  };

  function init$6() {
    this.sin_p12 = Math.sin(this.lat0);
    this.cos_p12 = Math.cos(this.lat0);
  }

  function forward$6(p) {
    var lon = p.x;
    var lat = p.y;
    var sinphi = Math.sin(p.y);
    var cosphi = Math.cos(p.y);
    var dlon = adjust_lon(lon - this.long0);
    var e0, e1, e2, e3, Mlp, Ml, tanphi, Nl1, Nl, psi, Az, G, H, GH, Hs, c, kp, cos_c, s, s2, s3, s4, s5;
    if (this.sphere) {
      if (Math.abs(this.sin_p12 - 1) <= EPSLN) {
        //North Pole case
        p.x = this.x0 + this.a * (HALF_PI - lat) * Math.sin(dlon);
        p.y = this.y0 - this.a * (HALF_PI - lat) * Math.cos(dlon);
        return p;
      }
      else if (Math.abs(this.sin_p12 + 1) <= EPSLN) {
        //South Pole case
        p.x = this.x0 + this.a * (HALF_PI + lat) * Math.sin(dlon);
        p.y = this.y0 + this.a * (HALF_PI + lat) * Math.cos(dlon);
        return p;
      }
      else {
        //default case
        cos_c = this.sin_p12 * sinphi + this.cos_p12 * cosphi * Math.cos(dlon);
        c = Math.acos(cos_c);
        kp = c ? c / Math.sin(c) : 1;
        p.x = this.x0 + this.a * kp * cosphi * Math.sin(dlon);
        p.y = this.y0 + this.a * kp * (this.cos_p12 * sinphi - this.sin_p12 * cosphi * Math.cos(dlon));
        return p;
      }
    }
    else {
      e0 = e0fn(this.es);
      e1 = e1fn(this.es);
      e2 = e2fn(this.es);
      e3 = e3fn(this.es);
      if (Math.abs(this.sin_p12 - 1) <= EPSLN) {
        //North Pole case
        Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
        Ml = this.a * mlfn(e0, e1, e2, e3, lat);
        p.x = this.x0 + (Mlp - Ml) * Math.sin(dlon);
        p.y = this.y0 - (Mlp - Ml) * Math.cos(dlon);
        return p;
      }
      else if (Math.abs(this.sin_p12 + 1) <= EPSLN) {
        //South Pole case
        Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
        Ml = this.a * mlfn(e0, e1, e2, e3, lat);
        p.x = this.x0 + (Mlp + Ml) * Math.sin(dlon);
        p.y = this.y0 + (Mlp + Ml) * Math.cos(dlon);
        return p;
      }
      else {
        //Default case
        tanphi = sinphi / cosphi;
        Nl1 = gN(this.a, this.e, this.sin_p12);
        Nl = gN(this.a, this.e, sinphi);
        psi = Math.atan((1 - this.es) * tanphi + this.es * Nl1 * this.sin_p12 / (Nl * cosphi));
        Az = Math.atan2(Math.sin(dlon), this.cos_p12 * Math.tan(psi) - this.sin_p12 * Math.cos(dlon));
        if (Az === 0) {
          s = Math.asin(this.cos_p12 * Math.sin(psi) - this.sin_p12 * Math.cos(psi));
        }
        else if (Math.abs(Math.abs(Az) - Math.PI) <= EPSLN) {
          s = -Math.asin(this.cos_p12 * Math.sin(psi) - this.sin_p12 * Math.cos(psi));
        }
        else {
          s = Math.asin(Math.sin(dlon) * Math.cos(psi) / Math.sin(Az));
        }
        G = this.e * this.sin_p12 / Math.sqrt(1 - this.es);
        H = this.e * this.cos_p12 * Math.cos(Az) / Math.sqrt(1 - this.es);
        GH = G * H;
        Hs = H * H;
        s2 = s * s;
        s3 = s2 * s;
        s4 = s3 * s;
        s5 = s4 * s;
        c = Nl1 * s * (1 - s2 * Hs * (1 - Hs) / 6 + s3 / 8 * GH * (1 - 2 * Hs) + s4 / 120 * (Hs * (4 - 7 * Hs) - 3 * G * G * (1 - 7 * Hs)) - s5 / 48 * GH);
        p.x = this.x0 + c * Math.sin(Az);
        p.y = this.y0 + c * Math.cos(Az);
        return p;
      }
    }


  }

  function inverse$6(p) {
    p.x -= this.x0;
    p.y -= this.y0;
    var rh, z, sinz, cosz, lon, lat, con, e0, e1, e2, e3, Mlp, M, N1, psi, Az, cosAz, tmp, A, B, D, Ee, F, sinpsi;
    if (this.sphere) {
      rh = Math.sqrt(p.x * p.x + p.y * p.y);
      if (rh > (2 * HALF_PI * this.a)) {
        return;
      }
      z = rh / this.a;

      sinz = Math.sin(z);
      cosz = Math.cos(z);

      lon = this.long0;
      if (Math.abs(rh) <= EPSLN) {
        lat = this.lat0;
      }
      else {
        lat = asinz(cosz * this.sin_p12 + (p.y * sinz * this.cos_p12) / rh);
        con = Math.abs(this.lat0) - HALF_PI;
        if (Math.abs(con) <= EPSLN) {
          if (this.lat0 >= 0) {
            lon = adjust_lon(this.long0 + Math.atan2(p.x, - p.y));
          }
          else {
            lon = adjust_lon(this.long0 - Math.atan2(-p.x, p.y));
          }
        }
        else {
          /*con = cosz - this.sin_p12 * Math.sin(lat);
          if ((Math.abs(con) < EPSLN) && (Math.abs(p.x) < EPSLN)) {
            //no-op, just keep the lon value as is
          } else {
            var temp = Math.atan2((p.x * sinz * this.cos_p12), (con * rh));
            lon = adjust_lon(this.long0 + Math.atan2((p.x * sinz * this.cos_p12), (con * rh)));
          }*/
          lon = adjust_lon(this.long0 + Math.atan2(p.x * sinz, rh * this.cos_p12 * cosz - p.y * this.sin_p12 * sinz));
        }
      }

      p.x = lon;
      p.y = lat;
      return p;
    }
    else {
      e0 = e0fn(this.es);
      e1 = e1fn(this.es);
      e2 = e2fn(this.es);
      e3 = e3fn(this.es);
      if (Math.abs(this.sin_p12 - 1) <= EPSLN) {
        //North pole case
        Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
        rh = Math.sqrt(p.x * p.x + p.y * p.y);
        M = Mlp - rh;
        lat = imlfn(M / this.a, e0, e1, e2, e3);
        lon = adjust_lon(this.long0 + Math.atan2(p.x, - 1 * p.y));
        p.x = lon;
        p.y = lat;
        return p;
      }
      else if (Math.abs(this.sin_p12 + 1) <= EPSLN) {
        //South pole case
        Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
        rh = Math.sqrt(p.x * p.x + p.y * p.y);
        M = rh - Mlp;

        lat = imlfn(M / this.a, e0, e1, e2, e3);
        lon = adjust_lon(this.long0 + Math.atan2(p.x, p.y));
        p.x = lon;
        p.y = lat;
        return p;
      }
      else {
        //default case
        rh = Math.sqrt(p.x * p.x + p.y * p.y);
        Az = Math.atan2(p.x, p.y);
        N1 = gN(this.a, this.e, this.sin_p12);
        cosAz = Math.cos(Az);
        tmp = this.e * this.cos_p12 * cosAz;
        A = -tmp * tmp / (1 - this.es);
        B = 3 * this.es * (1 - A) * this.sin_p12 * this.cos_p12 * cosAz / (1 - this.es);
        D = rh / N1;
        Ee = D - A * (1 + A) * Math.pow(D, 3) / 6 - B * (1 + 3 * A) * Math.pow(D, 4) / 24;
        F = 1 - A * Ee * Ee / 2 - D * Ee * Ee * Ee / 6;
        psi = Math.asin(this.sin_p12 * Math.cos(Ee) + this.cos_p12 * Math.sin(Ee) * cosAz);
        lon = adjust_lon(this.long0 + Math.asin(Math.sin(Az) * Math.sin(Ee) / Math.cos(psi)));
        sinpsi = Math.sin(psi);
        lat = Math.atan2((sinpsi - this.es * F * this.sin_p12) * Math.tan(psi), sinpsi * (1 - this.es));
        p.x = lon;
        p.y = lat;
        return p;
      }
    }

  }

  var names$6 = ["Azimuthal_Equidistant", "aeqd"];
  var aeqd = {
    init: init$6,
    forward: forward$6,
    inverse: inverse$6,
    names: names$6
  };

  function init$5() {
    //double temp;      /* temporary variable    */

    /* Place parameters in static storage for common use
        -------------------------------------------------*/
    this.sin_p14 = Math.sin(this.lat0);
    this.cos_p14 = Math.cos(this.lat0);
  }

  /* Orthographic forward equations--mapping lat,long to x,y
      ---------------------------------------------------*/
  function forward$5(p) {
    var sinphi, cosphi; /* sin and cos value        */
    var dlon; /* delta longitude value      */
    var coslon; /* cos of longitude        */
    var ksp; /* scale factor          */
    var g, x, y;
    var lon = p.x;
    var lat = p.y;
    /* Forward equations
        -----------------*/
    dlon = adjust_lon(lon - this.long0);

    sinphi = Math.sin(lat);
    cosphi = Math.cos(lat);

    coslon = Math.cos(dlon);
    g = this.sin_p14 * sinphi + this.cos_p14 * cosphi * coslon;
    ksp = 1;
    if ((g > 0) || (Math.abs(g) <= EPSLN)) {
      x = this.a * ksp * cosphi * Math.sin(dlon);
      y = this.y0 + this.a * ksp * (this.cos_p14 * sinphi - this.sin_p14 * cosphi * coslon);
    }
    p.x = x;
    p.y = y;
    return p;
  }

  function inverse$5(p) {
    var rh; /* height above ellipsoid      */
    var z; /* angle          */
    var sinz, cosz; /* sin of z and cos of z      */
    var con;
    var lon, lat;
    /* Inverse equations
        -----------------*/
    p.x -= this.x0;
    p.y -= this.y0;
    rh = Math.sqrt(p.x * p.x + p.y * p.y);
    z = asinz(rh / this.a);

    sinz = Math.sin(z);
    cosz = Math.cos(z);

    lon = this.long0;
    if (Math.abs(rh) <= EPSLN) {
      lat = this.lat0;
      p.x = lon;
      p.y = lat;
      return p;
    }
    lat = asinz(cosz * this.sin_p14 + (p.y * sinz * this.cos_p14) / rh);
    con = Math.abs(this.lat0) - HALF_PI;
    if (Math.abs(con) <= EPSLN) {
      if (this.lat0 >= 0) {
        lon = adjust_lon(this.long0 + Math.atan2(p.x, - p.y));
      }
      else {
        lon = adjust_lon(this.long0 - Math.atan2(-p.x, p.y));
      }
      p.x = lon;
      p.y = lat;
      return p;
    }
    lon = adjust_lon(this.long0 + Math.atan2((p.x * sinz), rh * this.cos_p14 * cosz - p.y * this.sin_p14 * sinz));
    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$5 = ["ortho"];
  var ortho = {
    init: init$5,
    forward: forward$5,
    inverse: inverse$5,
    names: names$5
  };

  // QSC projection rewritten from the original PROJ4
  // https://github.com/OSGeo/proj.4/blob/master/src/PJ_qsc.c


  /* constants */
  var FACE_ENUM = {
      FRONT: 1,
      RIGHT: 2,
      BACK: 3,
      LEFT: 4,
      TOP: 5,
      BOTTOM: 6
  };

  var AREA_ENUM = {
      AREA_0: 1,
      AREA_1: 2,
      AREA_2: 3,
      AREA_3: 4
  };

  function init$4() {

    this.x0 = this.x0 || 0;
    this.y0 = this.y0 || 0;
    this.lat0 = this.lat0 || 0;
    this.long0 = this.long0 || 0;
    this.lat_ts = this.lat_ts || 0;
    this.title = this.title || "Quadrilateralized Spherical Cube";

    /* Determine the cube face from the center of projection. */
    if (this.lat0 >= HALF_PI - FORTPI / 2.0) {
      this.face = FACE_ENUM.TOP;
    } else if (this.lat0 <= -(HALF_PI - FORTPI / 2.0)) {
      this.face = FACE_ENUM.BOTTOM;
    } else if (Math.abs(this.long0) <= FORTPI) {
      this.face = FACE_ENUM.FRONT;
    } else if (Math.abs(this.long0) <= HALF_PI + FORTPI) {
      this.face = this.long0 > 0.0 ? FACE_ENUM.RIGHT : FACE_ENUM.LEFT;
    } else {
      this.face = FACE_ENUM.BACK;
    }

    /* Fill in useful values for the ellipsoid <-> sphere shift
     * described in [LK12]. */
    if (this.es !== 0) {
      this.one_minus_f = 1 - (this.a - this.b) / this.a;
      this.one_minus_f_squared = this.one_minus_f * this.one_minus_f;
    }
  }

  // QSC forward equations--mapping lat,long to x,y
  // -----------------------------------------------------------------
  function forward$4(p) {
    var xy = {x: 0, y: 0};
    var lat, lon;
    var theta, phi;
    var t, mu;
    /* nu; */
    var area = {value: 0};

    // move lon according to projection's lon
    p.x -= this.long0;

    /* Convert the geodetic latitude to a geocentric latitude.
     * This corresponds to the shift from the ellipsoid to the sphere
     * described in [LK12]. */
    if (this.es !== 0) {//if (P->es != 0) {
      lat = Math.atan(this.one_minus_f_squared * Math.tan(p.y));
    } else {
      lat = p.y;
    }

    /* Convert the input lat, lon into theta, phi as used by QSC.
     * This depends on the cube face and the area on it.
     * For the top and bottom face, we can compute theta and phi
     * directly from phi, lam. For the other faces, we must use
     * unit sphere cartesian coordinates as an intermediate step. */
    lon = p.x; //lon = lp.lam;
    if (this.face === FACE_ENUM.TOP) {
      phi = HALF_PI - lat;
      if (lon >= FORTPI && lon <= HALF_PI + FORTPI) {
        area.value = AREA_ENUM.AREA_0;
        theta = lon - HALF_PI;
      } else if (lon > HALF_PI + FORTPI || lon <= -(HALF_PI + FORTPI)) {
        area.value = AREA_ENUM.AREA_1;
        theta = (lon > 0.0 ? lon - SPI : lon + SPI);
      } else if (lon > -(HALF_PI + FORTPI) && lon <= -FORTPI) {
        area.value = AREA_ENUM.AREA_2;
        theta = lon + HALF_PI;
      } else {
        area.value = AREA_ENUM.AREA_3;
        theta = lon;
      }
    } else if (this.face === FACE_ENUM.BOTTOM) {
      phi = HALF_PI + lat;
      if (lon >= FORTPI && lon <= HALF_PI + FORTPI) {
        area.value = AREA_ENUM.AREA_0;
        theta = -lon + HALF_PI;
      } else if (lon < FORTPI && lon >= -FORTPI) {
        area.value = AREA_ENUM.AREA_1;
        theta = -lon;
      } else if (lon < -FORTPI && lon >= -(HALF_PI + FORTPI)) {
        area.value = AREA_ENUM.AREA_2;
        theta = -lon - HALF_PI;
      } else {
        area.value = AREA_ENUM.AREA_3;
        theta = (lon > 0.0 ? -lon + SPI : -lon - SPI);
      }
    } else {
      var q, r, s;
      var sinlat, coslat;
      var sinlon, coslon;

      if (this.face === FACE_ENUM.RIGHT) {
        lon = qsc_shift_lon_origin(lon, +HALF_PI);
      } else if (this.face === FACE_ENUM.BACK) {
        lon = qsc_shift_lon_origin(lon, +SPI);
      } else if (this.face === FACE_ENUM.LEFT) {
        lon = qsc_shift_lon_origin(lon, -HALF_PI);
      }
      sinlat = Math.sin(lat);
      coslat = Math.cos(lat);
      sinlon = Math.sin(lon);
      coslon = Math.cos(lon);
      q = coslat * coslon;
      r = coslat * sinlon;
      s = sinlat;

      if (this.face === FACE_ENUM.FRONT) {
        phi = Math.acos(q);
        theta = qsc_fwd_equat_face_theta(phi, s, r, area);
      } else if (this.face === FACE_ENUM.RIGHT) {
        phi = Math.acos(r);
        theta = qsc_fwd_equat_face_theta(phi, s, -q, area);
      } else if (this.face === FACE_ENUM.BACK) {
        phi = Math.acos(-q);
        theta = qsc_fwd_equat_face_theta(phi, s, -r, area);
      } else if (this.face === FACE_ENUM.LEFT) {
        phi = Math.acos(-r);
        theta = qsc_fwd_equat_face_theta(phi, s, q, area);
      } else {
        /* Impossible */
        phi = theta = 0;
        area.value = AREA_ENUM.AREA_0;
      }
    }

    /* Compute mu and nu for the area of definition.
     * For mu, see Eq. (3-21) in [OL76], but note the typos:
     * compare with Eq. (3-14). For nu, see Eq. (3-38). */
    mu = Math.atan((12 / SPI) * (theta + Math.acos(Math.sin(theta) * Math.cos(FORTPI)) - HALF_PI));
    t = Math.sqrt((1 - Math.cos(phi)) / (Math.cos(mu) * Math.cos(mu)) / (1 - Math.cos(Math.atan(1 / Math.cos(theta)))));

    /* Apply the result to the real area. */
    if (area.value === AREA_ENUM.AREA_1) {
      mu += HALF_PI;
    } else if (area.value === AREA_ENUM.AREA_2) {
      mu += SPI;
    } else if (area.value === AREA_ENUM.AREA_3) {
      mu += 1.5 * SPI;
    }

    /* Now compute x, y from mu and nu */
    xy.x = t * Math.cos(mu);
    xy.y = t * Math.sin(mu);
    xy.x = xy.x * this.a + this.x0;
    xy.y = xy.y * this.a + this.y0;

    p.x = xy.x;
    p.y = xy.y;
    return p;
  }

  // QSC inverse equations--mapping x,y to lat/long
  // -----------------------------------------------------------------
  function inverse$4(p) {
    var lp = {lam: 0, phi: 0};
    var mu, nu, cosmu, tannu;
    var tantheta, theta, cosphi, phi;
    var t;
    var area = {value: 0};

    /* de-offset */
    p.x = (p.x - this.x0) / this.a;
    p.y = (p.y - this.y0) / this.a;

    /* Convert the input x, y to the mu and nu angles as used by QSC.
     * This depends on the area of the cube face. */
    nu = Math.atan(Math.sqrt(p.x * p.x + p.y * p.y));
    mu = Math.atan2(p.y, p.x);
    if (p.x >= 0.0 && p.x >= Math.abs(p.y)) {
      area.value = AREA_ENUM.AREA_0;
    } else if (p.y >= 0.0 && p.y >= Math.abs(p.x)) {
      area.value = AREA_ENUM.AREA_1;
      mu -= HALF_PI;
    } else if (p.x < 0.0 && -p.x >= Math.abs(p.y)) {
      area.value = AREA_ENUM.AREA_2;
      mu = (mu < 0.0 ? mu + SPI : mu - SPI);
    } else {
      area.value = AREA_ENUM.AREA_3;
      mu += HALF_PI;
    }

    /* Compute phi and theta for the area of definition.
     * The inverse projection is not described in the original paper, but some
     * good hints can be found here (as of 2011-12-14):
     * http://fits.gsfc.nasa.gov/fitsbits/saf.93/saf.9302
     * (search for "Message-Id: <9302181759.AA25477 at fits.cv.nrao.edu>") */
    t = (SPI / 12) * Math.tan(mu);
    tantheta = Math.sin(t) / (Math.cos(t) - (1 / Math.sqrt(2)));
    theta = Math.atan(tantheta);
    cosmu = Math.cos(mu);
    tannu = Math.tan(nu);
    cosphi = 1 - cosmu * cosmu * tannu * tannu * (1 - Math.cos(Math.atan(1 / Math.cos(theta))));
    if (cosphi < -1) {
      cosphi = -1;
    } else if (cosphi > +1) {
      cosphi = +1;
    }

    /* Apply the result to the real area on the cube face.
     * For the top and bottom face, we can compute phi and lam directly.
     * For the other faces, we must use unit sphere cartesian coordinates
     * as an intermediate step. */
    if (this.face === FACE_ENUM.TOP) {
      phi = Math.acos(cosphi);
      lp.phi = HALF_PI - phi;
      if (area.value === AREA_ENUM.AREA_0) {
        lp.lam = theta + HALF_PI;
      } else if (area.value === AREA_ENUM.AREA_1) {
        lp.lam = (theta < 0.0 ? theta + SPI : theta - SPI);
      } else if (area.value === AREA_ENUM.AREA_2) {
        lp.lam = theta - HALF_PI;
      } else /* area.value == AREA_ENUM.AREA_3 */ {
        lp.lam = theta;
      }
    } else if (this.face === FACE_ENUM.BOTTOM) {
      phi = Math.acos(cosphi);
      lp.phi = phi - HALF_PI;
      if (area.value === AREA_ENUM.AREA_0) {
        lp.lam = -theta + HALF_PI;
      } else if (area.value === AREA_ENUM.AREA_1) {
        lp.lam = -theta;
      } else if (area.value === AREA_ENUM.AREA_2) {
        lp.lam = -theta - HALF_PI;
      } else /* area.value == AREA_ENUM.AREA_3 */ {
        lp.lam = (theta < 0.0 ? -theta - SPI : -theta + SPI);
      }
    } else {
      /* Compute phi and lam via cartesian unit sphere coordinates. */
      var q, r, s;
      q = cosphi;
      t = q * q;
      if (t >= 1) {
        s = 0;
      } else {
        s = Math.sqrt(1 - t) * Math.sin(theta);
      }
      t += s * s;
      if (t >= 1) {
        r = 0;
      } else {
        r = Math.sqrt(1 - t);
      }
      /* Rotate q,r,s into the correct area. */
      if (area.value === AREA_ENUM.AREA_1) {
        t = r;
        r = -s;
        s = t;
      } else if (area.value === AREA_ENUM.AREA_2) {
        r = -r;
        s = -s;
      } else if (area.value === AREA_ENUM.AREA_3) {
        t = r;
        r = s;
        s = -t;
      }
      /* Rotate q,r,s into the correct cube face. */
      if (this.face === FACE_ENUM.RIGHT) {
        t = q;
        q = -r;
        r = t;
      } else if (this.face === FACE_ENUM.BACK) {
        q = -q;
        r = -r;
      } else if (this.face === FACE_ENUM.LEFT) {
        t = q;
        q = r;
        r = -t;
      }
      /* Now compute phi and lam from the unit sphere coordinates. */
      lp.phi = Math.acos(-s) - HALF_PI;
      lp.lam = Math.atan2(r, q);
      if (this.face === FACE_ENUM.RIGHT) {
        lp.lam = qsc_shift_lon_origin(lp.lam, -HALF_PI);
      } else if (this.face === FACE_ENUM.BACK) {
        lp.lam = qsc_shift_lon_origin(lp.lam, -SPI);
      } else if (this.face === FACE_ENUM.LEFT) {
        lp.lam = qsc_shift_lon_origin(lp.lam, +HALF_PI);
      }
    }

    /* Apply the shift from the sphere to the ellipsoid as described
     * in [LK12]. */
    if (this.es !== 0) {
      var invert_sign;
      var tanphi, xa;
      invert_sign = (lp.phi < 0 ? 1 : 0);
      tanphi = Math.tan(lp.phi);
      xa = this.b / Math.sqrt(tanphi * tanphi + this.one_minus_f_squared);
      lp.phi = Math.atan(Math.sqrt(this.a * this.a - xa * xa) / (this.one_minus_f * xa));
      if (invert_sign) {
        lp.phi = -lp.phi;
      }
    }

    lp.lam += this.long0;
    p.x = lp.lam;
    p.y = lp.phi;
    return p;
  }

  /* Helper function for forward projection: compute the theta angle
   * and determine the area number. */
  function qsc_fwd_equat_face_theta(phi, y, x, area) {
    var theta;
    if (phi < EPSLN) {
      area.value = AREA_ENUM.AREA_0;
      theta = 0.0;
    } else {
      theta = Math.atan2(y, x);
      if (Math.abs(theta) <= FORTPI) {
        area.value = AREA_ENUM.AREA_0;
      } else if (theta > FORTPI && theta <= HALF_PI + FORTPI) {
        area.value = AREA_ENUM.AREA_1;
        theta -= HALF_PI;
      } else if (theta > HALF_PI + FORTPI || theta <= -(HALF_PI + FORTPI)) {
        area.value = AREA_ENUM.AREA_2;
        theta = (theta >= 0.0 ? theta - SPI : theta + SPI);
      } else {
        area.value = AREA_ENUM.AREA_3;
        theta += HALF_PI;
      }
    }
    return theta;
  }

  /* Helper function: shift the longitude. */
  function qsc_shift_lon_origin(lon, offset) {
    var slon = lon + offset;
    if (slon < -SPI) {
      slon += TWO_PI;
    } else if (slon > +SPI) {
      slon -= TWO_PI;
    }
    return slon;
  }

  var names$4 = ["Quadrilateralized Spherical Cube", "Quadrilateralized_Spherical_Cube", "qsc"];
  var qsc = {
    init: init$4,
    forward: forward$4,
    inverse: inverse$4,
    names: names$4
  };

  // Robinson projection
  // Based on https://github.com/OSGeo/proj.4/blob/master/src/PJ_robin.c
  // Polynomial coeficients from http://article.gmane.org/gmane.comp.gis.proj-4.devel/6039


  var COEFS_X = [
      [1.0000, 2.2199e-17, -7.15515e-05, 3.1103e-06],
      [0.9986, -0.000482243, -2.4897e-05, -1.3309e-06],
      [0.9954, -0.00083103, -4.48605e-05, -9.86701e-07],
      [0.9900, -0.00135364, -5.9661e-05, 3.6777e-06],
      [0.9822, -0.00167442, -4.49547e-06, -5.72411e-06],
      [0.9730, -0.00214868, -9.03571e-05, 1.8736e-08],
      [0.9600, -0.00305085, -9.00761e-05, 1.64917e-06],
      [0.9427, -0.00382792, -6.53386e-05, -2.6154e-06],
      [0.9216, -0.00467746, -0.00010457, 4.81243e-06],
      [0.8962, -0.00536223, -3.23831e-05, -5.43432e-06],
      [0.8679, -0.00609363, -0.000113898, 3.32484e-06],
      [0.8350, -0.00698325, -6.40253e-05, 9.34959e-07],
      [0.7986, -0.00755338, -5.00009e-05, 9.35324e-07],
      [0.7597, -0.00798324, -3.5971e-05, -2.27626e-06],
      [0.7186, -0.00851367, -7.01149e-05, -8.6303e-06],
      [0.6732, -0.00986209, -0.000199569, 1.91974e-05],
      [0.6213, -0.010418, 8.83923e-05, 6.24051e-06],
      [0.5722, -0.00906601, 0.000182, 6.24051e-06],
      [0.5322, -0.00677797, 0.000275608, 6.24051e-06]
  ];

  var COEFS_Y = [
      [-5.20417e-18, 0.0124, 1.21431e-18, -8.45284e-11],
      [0.0620, 0.0124, -1.26793e-09, 4.22642e-10],
      [0.1240, 0.0124, 5.07171e-09, -1.60604e-09],
      [0.1860, 0.0123999, -1.90189e-08, 6.00152e-09],
      [0.2480, 0.0124002, 7.10039e-08, -2.24e-08],
      [0.3100, 0.0123992, -2.64997e-07, 8.35986e-08],
      [0.3720, 0.0124029, 9.88983e-07, -3.11994e-07],
      [0.4340, 0.0123893, -3.69093e-06, -4.35621e-07],
      [0.4958, 0.0123198, -1.02252e-05, -3.45523e-07],
      [0.5571, 0.0121916, -1.54081e-05, -5.82288e-07],
      [0.6176, 0.0119938, -2.41424e-05, -5.25327e-07],
      [0.6769, 0.011713, -3.20223e-05, -5.16405e-07],
      [0.7346, 0.0113541, -3.97684e-05, -6.09052e-07],
      [0.7903, 0.0109107, -4.89042e-05, -1.04739e-06],
      [0.8435, 0.0103431, -6.4615e-05, -1.40374e-09],
      [0.8936, 0.00969686, -6.4636e-05, -8.547e-06],
      [0.9394, 0.00840947, -0.000192841, -4.2106e-06],
      [0.9761, 0.00616527, -0.000256, -4.2106e-06],
      [1.0000, 0.00328947, -0.000319159, -4.2106e-06]
  ];

  var FXC = 0.8487;
  var FYC = 1.3523;
  var C1 = R2D/5; // rad to 5-degree interval
  var RC1 = 1/C1;
  var NODES = 18;

  var poly3_val = function(coefs, x) {
      return coefs[0] + x * (coefs[1] + x * (coefs[2] + x * coefs[3]));
  };

  var poly3_der = function(coefs, x) {
      return coefs[1] + x * (2 * coefs[2] + x * 3 * coefs[3]);
  };

  function newton_rapshon(f_df, start, max_err, iters) {
      var x = start;
      for (; iters; --iters) {
          var upd = f_df(x);
          x -= upd;
          if (Math.abs(upd) < max_err) {
              break;
          }
      }
      return x;
  }

  function init$3() {
      this.x0 = this.x0 || 0;
      this.y0 = this.y0 || 0;
      this.long0 = this.long0 || 0;
      this.es = 0;
      this.title = this.title || "Robinson";
  }

  function forward$3(ll) {
      var lon = adjust_lon(ll.x - this.long0);

      var dphi = Math.abs(ll.y);
      var i = Math.floor(dphi * C1);
      if (i < 0) {
          i = 0;
      } else if (i >= NODES) {
          i = NODES - 1;
      }
      dphi = R2D * (dphi - RC1 * i);
      var xy = {
          x: poly3_val(COEFS_X[i], dphi) * lon,
          y: poly3_val(COEFS_Y[i], dphi)
      };
      if (ll.y < 0) {
          xy.y = -xy.y;
      }

      xy.x = xy.x * this.a * FXC + this.x0;
      xy.y = xy.y * this.a * FYC + this.y0;
      return xy;
  }

  function inverse$3(xy) {
      var ll = {
          x: (xy.x - this.x0) / (this.a * FXC),
          y: Math.abs(xy.y - this.y0) / (this.a * FYC)
      };

      if (ll.y >= 1) { // pathologic case
          ll.x /= COEFS_X[NODES][0];
          ll.y = xy.y < 0 ? -HALF_PI : HALF_PI;
      } else {
          // find table interval
          var i = Math.floor(ll.y * NODES);
          if (i < 0) {
              i = 0;
          } else if (i >= NODES) {
              i = NODES - 1;
          }
          for (;;) {
              if (COEFS_Y[i][0] > ll.y) {
                  --i;
              } else if (COEFS_Y[i+1][0] <= ll.y) {
                  ++i;
              } else {
                  break;
              }
          }
          // linear interpolation in 5 degree interval
          var coefs = COEFS_Y[i];
          var t = 5 * (ll.y - coefs[0]) / (COEFS_Y[i+1][0] - coefs[0]);
          // find t so that poly3_val(coefs, t) = ll.y
          t = newton_rapshon(function(x) {
              return (poly3_val(coefs, x) - ll.y) / poly3_der(coefs, x);
          }, t, EPSLN, 100);

          ll.x /= poly3_val(COEFS_X[i], t);
          ll.y = (5 * i + t) * D2R$1;
          if (xy.y < 0) {
              ll.y = -ll.y;
          }
      }

      ll.x = adjust_lon(ll.x + this.long0);
      return ll;
  }

  var names$3 = ["Robinson", "robin"];
  var robin = {
    init: init$3,
    forward: forward$3,
    inverse: inverse$3,
    names: names$3
  };

  function init$2() {
      this.name = 'geocent';

  }

  function forward$2(p) {
      var point = geodeticToGeocentric(p, this.es, this.a);
      return point;
  }

  function inverse$2(p) {
      var point = geocentricToGeodetic(p, this.es, this.a, this.b);
      return point;
  }

  var names$2 = ["Geocentric", 'geocentric', "geocent", "Geocent"];
  var geocent = {
      init: init$2,
      forward: forward$2,
      inverse: inverse$2,
      names: names$2
  };

  var mode = {
    N_POLE: 0,
    S_POLE: 1,
    EQUIT: 2,
    OBLIQ: 3
  };

  var params = {
    h:     { def: 100000, num: true },           // default is Karman line, no default in PROJ.7
    azi:   { def: 0, num: true, degrees: true }, // default is North
    tilt:  { def: 0, num: true, degrees: true }, // default is Nadir
    long0: { def: 0, num: true },                // default is Greenwich, conversion to rad is automatic
    lat0:  { def: 0, num: true }                 // default is Equator, conversion to rad is automatic
  };

  function init$1() {
    Object.keys(params).forEach(function (p) {
      if (typeof this[p] === "undefined") {
        this[p] = params[p].def;
      } else if (params[p].num && isNaN(this[p])) {
        throw new Error("Invalid parameter value, must be numeric " + p + " = " + this[p]);
      } else if (params[p].num) {
        this[p] = parseFloat(this[p]);
      }
      if (params[p].degrees) {
        this[p] = this[p] * D2R$1;
      }
    }.bind(this));

    if (Math.abs((Math.abs(this.lat0) - HALF_PI)) < EPSLN) {
      this.mode = this.lat0 < 0 ? mode.S_POLE : mode.N_POLE;
    } else if (Math.abs(this.lat0) < EPSLN) {
      this.mode = mode.EQUIT;
    } else {
      this.mode = mode.OBLIQ;
      this.sinph0 = Math.sin(this.lat0);
      this.cosph0 = Math.cos(this.lat0);
    }

    this.pn1 = this.h / this.a;  // Normalize relative to the Earth's radius

    if (this.pn1 <= 0 || this.pn1 > 1e10) {
      throw new Error("Invalid height");
    }
    
    this.p = 1 + this.pn1;
    this.rp = 1 / this.p;
    this.h1 = 1 / this.pn1;
    this.pfact = (this.p + 1) * this.h1;
    this.es = 0;

    var omega = this.tilt;
    var gamma = this.azi;
    this.cg = Math.cos(gamma);
    this.sg = Math.sin(gamma);
    this.cw = Math.cos(omega);
    this.sw = Math.sin(omega);
  }

  function forward$1(p) {
    p.x -= this.long0;
    var sinphi = Math.sin(p.y);
    var cosphi = Math.cos(p.y);
    var coslam = Math.cos(p.x);
    var x, y;
    switch (this.mode) {
      case mode.OBLIQ:
        y = this.sinph0 * sinphi + this.cosph0 * cosphi * coslam;
        break;
      case mode.EQUIT:
        y = cosphi * coslam;
        break;
      case mode.S_POLE:
        y = -sinphi;
        break;
      case mode.N_POLE:
        y = sinphi;
        break;
    }
    y = this.pn1 / (this.p - y);
    x = y * cosphi * Math.sin(p.x);

    switch (this.mode) {
      case mode.OBLIQ:
        y *= this.cosph0 * sinphi - this.sinph0 * cosphi * coslam;
        break;
      case mode.EQUIT:
        y *= sinphi;
        break;
      case mode.N_POLE:
        y *= -(cosphi * coslam);
        break;
      case mode.S_POLE:
        y *= cosphi * coslam;
        break;
    }

    // Tilt 
    var yt, ba;
    yt = y * this.cg + x * this.sg;
    ba = 1 / (yt * this.sw * this.h1 + this.cw);
    x = (x * this.cg - y * this.sg) * this.cw * ba;
    y = yt * ba;

    p.x = x * this.a;
    p.y = y * this.a;
    return p;
  }

  function inverse$1(p) {
    p.x /= this.a;
    p.y /= this.a;
    var r = { x: p.x, y: p.y };

    // Un-Tilt
    var bm, bq, yt;
    yt = 1 / (this.pn1 - p.y * this.sw);
    bm = this.pn1 * p.x * yt;
    bq = this.pn1 * p.y * this.cw * yt;
    p.x = bm * this.cg + bq * this.sg;
    p.y = bq * this.cg - bm * this.sg;

    var rh = hypot(p.x, p.y);
    if (Math.abs(rh) < EPSLN) {
      r.x = 0;
      r.y = p.y;
    } else {
      var cosz, sinz;
      sinz = 1 - rh * rh * this.pfact;
      sinz = (this.p - Math.sqrt(sinz)) / (this.pn1 / rh + rh / this.pn1);
      cosz = Math.sqrt(1 - sinz * sinz);
      switch (this.mode) {
        case mode.OBLIQ:
          r.y = Math.asin(cosz * this.sinph0 + p.y * sinz * this.cosph0 / rh);
          p.y = (cosz - this.sinph0 * Math.sin(r.y)) * rh;
          p.x *= sinz * this.cosph0;
          break;
        case mode.EQUIT:
          r.y = Math.asin(p.y * sinz / rh);
          p.y = cosz * rh;
          p.x *= sinz;
          break;
        case mode.N_POLE:
          r.y = Math.asin(cosz);
          p.y = -p.y;
          break;
        case mode.S_POLE:
          r.y = -Math.asin(cosz);
          break;
      }
      r.x = Math.atan2(p.x, p.y);
    }

    p.x = r.x + this.long0;
    p.y = r.y;
    return p;
  }

  var names$1 = ["Tilted_Perspective", "tpers"];
  var tpers = {
    init: init$1,
    forward: forward$1,
    inverse: inverse$1,
    names: names$1
  };

  function init() {
      this.flip_axis = (this.sweep === 'x' ? 1 : 0);
      this.h = Number(this.h);
      this.radius_g_1 = this.h / this.a;

      if (this.radius_g_1 <= 0 || this.radius_g_1 > 1e10) {
          throw new Error();
      }

      this.radius_g = 1.0 + this.radius_g_1;
      this.C = this.radius_g * this.radius_g - 1.0;

      if (this.es !== 0.0) {
          var one_es = 1.0 - this.es;
          var rone_es = 1 / one_es;

          this.radius_p = Math.sqrt(one_es);
          this.radius_p2 = one_es;
          this.radius_p_inv2 = rone_es;

          this.shape = 'ellipse'; // Use as a condition in the forward and inverse functions.
      } else {
          this.radius_p = 1.0;
          this.radius_p2 = 1.0;
          this.radius_p_inv2 = 1.0;

          this.shape = 'sphere';  // Use as a condition in the forward and inverse functions.
      }

      if (!this.title) {
          this.title = "Geostationary Satellite View";
      }
  }

  function forward(p) {
      var lon = p.x;
      var lat = p.y;
      var tmp, v_x, v_y, v_z;
      lon = lon - this.long0;

      if (this.shape === 'ellipse') {
          lat = Math.atan(this.radius_p2 * Math.tan(lat));
          var r = this.radius_p / hypot(this.radius_p * Math.cos(lat), Math.sin(lat));

          v_x = r * Math.cos(lon) * Math.cos(lat);
          v_y = r * Math.sin(lon) * Math.cos(lat);
          v_z = r * Math.sin(lat);

          if (((this.radius_g - v_x) * v_x - v_y * v_y - v_z * v_z * this.radius_p_inv2) < 0.0) {
              p.x = Number.NaN;
              p.y = Number.NaN;
              return p;
          }

          tmp = this.radius_g - v_x;
          if (this.flip_axis) {
              p.x = this.radius_g_1 * Math.atan(v_y / hypot(v_z, tmp));
              p.y = this.radius_g_1 * Math.atan(v_z / tmp);
          } else {
              p.x = this.radius_g_1 * Math.atan(v_y / tmp);
              p.y = this.radius_g_1 * Math.atan(v_z / hypot(v_y, tmp));
          }
      } else if (this.shape === 'sphere') {
          tmp = Math.cos(lat);
          v_x = Math.cos(lon) * tmp;
          v_y = Math.sin(lon) * tmp;
          v_z = Math.sin(lat);
          tmp = this.radius_g - v_x;

          if (this.flip_axis) {
              p.x = this.radius_g_1 * Math.atan(v_y / hypot(v_z, tmp));
              p.y = this.radius_g_1 * Math.atan(v_z / tmp);
          } else {
              p.x = this.radius_g_1 * Math.atan(v_y / tmp);
              p.y = this.radius_g_1 * Math.atan(v_z / hypot(v_y, tmp));
          }
      }
      p.x = p.x * this.a;
      p.y = p.y * this.a;
      return p;
  }

  function inverse(p) {
      var v_x = -1.0;
      var v_y = 0.0;
      var v_z = 0.0;
      var a, b, det, k;

      p.x = p.x / this.a;
      p.y = p.y / this.a;

      if (this.shape === 'ellipse') {
          if (this.flip_axis) {
              v_z = Math.tan(p.y / this.radius_g_1);
              v_y = Math.tan(p.x / this.radius_g_1) * hypot(1.0, v_z);
          } else {
              v_y = Math.tan(p.x / this.radius_g_1);
              v_z = Math.tan(p.y / this.radius_g_1) * hypot(1.0, v_y);
          }

          var v_zp = v_z / this.radius_p;
          a = v_y * v_y + v_zp * v_zp + v_x * v_x;
          b = 2 * this.radius_g * v_x;
          det = (b * b) - 4 * a * this.C;

          if (det < 0.0) {
              p.x = Number.NaN;
              p.y = Number.NaN;
              return p;
          }

          k = (-b - Math.sqrt(det)) / (2.0 * a);
          v_x = this.radius_g + k * v_x;
          v_y *= k;
          v_z *= k;

          p.x = Math.atan2(v_y, v_x);
          p.y = Math.atan(v_z * Math.cos(p.x) / v_x);
          p.y = Math.atan(this.radius_p_inv2 * Math.tan(p.y));
      } else if (this.shape === 'sphere') {
          if (this.flip_axis) {
              v_z = Math.tan(p.y / this.radius_g_1);
              v_y = Math.tan(p.x / this.radius_g_1) * Math.sqrt(1.0 + v_z * v_z);
          } else {
              v_y = Math.tan(p.x / this.radius_g_1);
              v_z = Math.tan(p.y / this.radius_g_1) * Math.sqrt(1.0 + v_y * v_y);
          }

          a = v_y * v_y + v_z * v_z + v_x * v_x;
          b = 2 * this.radius_g * v_x;
          det = (b * b) - 4 * a * this.C;
          if (det < 0.0) {
              p.x = Number.NaN;
              p.y = Number.NaN;
              return p;
          }

          k = (-b - Math.sqrt(det)) / (2.0 * a);
          v_x = this.radius_g + k * v_x;
          v_y *= k;
          v_z *= k;

          p.x = Math.atan2(v_y, v_x);
          p.y = Math.atan(v_z * Math.cos(p.x) / v_x);
      }
      p.x = p.x + this.long0;
      return p;
  }

  var names = ["Geostationary Satellite View", "Geostationary_Satellite", "geos"];
  var geos = {
      init: init,
      forward: forward,
      inverse: inverse,
      names: names,
  };

  function includedProjections(proj4){
    proj4.Proj.projections.add(tmerc);
    proj4.Proj.projections.add(etmerc);
    proj4.Proj.projections.add(utm);
    proj4.Proj.projections.add(sterea);
    proj4.Proj.projections.add(stere);
    proj4.Proj.projections.add(somerc);
    proj4.Proj.projections.add(omerc);
    proj4.Proj.projections.add(lcc);
    proj4.Proj.projections.add(krovak);
    proj4.Proj.projections.add(cass);
    proj4.Proj.projections.add(laea);
    proj4.Proj.projections.add(aea);
    proj4.Proj.projections.add(gnom);
    proj4.Proj.projections.add(cea);
    proj4.Proj.projections.add(eqc);
    proj4.Proj.projections.add(poly);
    proj4.Proj.projections.add(nzmg);
    proj4.Proj.projections.add(mill);
    proj4.Proj.projections.add(sinu);
    proj4.Proj.projections.add(moll);
    proj4.Proj.projections.add(eqdc);
    proj4.Proj.projections.add(vandg);
    proj4.Proj.projections.add(aeqd);
    proj4.Proj.projections.add(ortho);
    proj4.Proj.projections.add(qsc);
    proj4.Proj.projections.add(robin);
    proj4.Proj.projections.add(geocent);
    proj4.Proj.projections.add(tpers);
    proj4.Proj.projections.add(geos);
  }

  proj4.defaultDatum = 'WGS84'; //default datum
  proj4.Proj = Projection;
  proj4.WGS84 = new proj4.Proj('WGS84');
  proj4.Point = Point;
  proj4.toPoint = common;
  proj4.defs = defs;
  proj4.nadgrid = nadgrid;
  proj4.transform = transform;
  proj4.mgrs = mgrs;
  proj4.version = '__VERSION__';
  includedProjections(proj4);

  var f,m="deflate-raw",x=self.DecompressionStream;try{new x(m),f=async t=>{let n=new x(m),e=n.writable.getWriter(),i=n.readable.getReader();e.write(t),e.close();let c,o=[],s=0,a=0,l;for(;!(l=await i.read()).done;)c=l.value,o.push(c),s+=c.length;return o.length-1?(c=new Uint8Array(s),o.map(r=>{c.set(r,a),a+=r.length;}),c):o[0]};}catch{}var _=new TextDecoder,h=t=>{throw new Error("but-unzip~"+t)},E=t=>_.decode(t),A=t=>{let n=t.length-20,e=Math.max(n-65516,2);for(;(n=t.lastIndexOf(80,n-1))!==-1&&!(t[n+1]===75&&t[n+2]===5&&t[n+3]===6)&&n>e;);return n};function*C(t,n=f){let e=A(t);e===-1&&h(2);let i=(r,d)=>t.subarray(e+=r,e+=d),c=new DataView(t.buffer,t.byteOffset),o=r=>c.getUint16(r+e,!0),s=r=>c.getUint32(r+e,!0),a=o(10);for(a!==o(8)&&h(3),e=s(16);a--;){let r=o(10),d=o(28),g=o(30),y=o(32),b=s(20),w=s(42),p=E(i(46,d)),D=E(i(g,y)),L=e,u;e=w,u=i(30+o(26)+o(28),b),yield {filename:p,comment:D,read:()=>r&8?n(u):r?h(1):u},e=L;}}

  const regex$1 = /.+\.(shp|dbf|json|prj|cpg)$/i;
  var unzip = async (buffer) => {
    const files = {};
    const proms = [];
    for (const entry of C(buffer)) {
      if (!regex$1.test(entry.filename)) {
        continue;
      }
      proms.push(Promise.resolve(entry.read()).then(bytes => files[entry.filename] = bytes));
    }
    await Promise.all(proms);
    const out = {};
    const decoder = new TextDecoder();
    for (const [key, value] of Object.entries(files)) {
      if (key.slice(-3).toLowerCase() === 'shp' || key.slice(-3).toLowerCase() === 'dbf') {
        out[key] = new DataView(value.buffer, value.byteOffset, value.byteLength);
      } else {
        out[key] = decoder.decode(value);
      }
    }
    return out;
  };

  const URL$1 = globalThis.URL;

  var combine$1 = (base, type) => {
    if (!type) {
      return base;
    }
    const url = new URL$1(base);
    url.pathname = `${url.pathname}.${type}`;
    return url.href;
  };

  async function binaryAjax(_url, type) {

    const url = combine$1(_url, type);
    const isOptionalTxt = type === 'prj' || type === 'cpg';
    try {
      const resp = await fetch(url);
      if (resp.status > 399) {
        throw new Error(resp.statusText);
      }
      if (isOptionalTxt) {
        return resp.text();
      }
      const parsed = await resp.arrayBuffer();
      return new DataView(parsed)
    } catch (e) {
      if (isOptionalTxt || type === 'dbf') {
        return false;
      }
      throw e;
    }
  }

  function isClockWise(array) {
    let sum = 0;
    let i = 1;
    const len = array.length;
    let prev, cur;
    const bbox = [array[0][0], array[0][1], array[0][0], array[0][1]];
    while (i < len) {
      prev = cur || array[0];
      cur = array[i];
      sum += ((cur[0] - prev[0]) * (cur[1] + prev[1]));
      i++;
      if (cur[0] < bbox[0]) {
        bbox[0] = cur[0];
      }
      if (cur[1] < bbox[1]) {
        bbox[1] = cur[1];
      }
      if (cur[0] > bbox[2]) {
        bbox[2] = cur[0];
      }
      if (cur[1] > bbox[3]) {
        bbox[3] = cur[1];
      }
    }
    return {
      ring: array,
      clockWise: sum > 0,
      bbox,
      children: []
    }

  }

  function contains(outer, inner) {
    if (outer.bbox[0] > inner.bbox[0]) {
      return false;
    }
    if (outer.bbox[1] > inner.bbox[1]) {
      return false;
    }
    if (outer.bbox[2] < inner.bbox[2]) {
      return false;
    }
    if (outer.bbox[3] < inner.bbox[3]) {
      return false;
    }
    return true;
  }

  function handleRings(rings) {
    const outers = [];
    const inners = [];
    for (const ring of rings) {
      const proccessed = isClockWise(ring);
      if (proccessed.clockWise) {
        outers.push(proccessed);
      } else {
        inners.push(proccessed);
      }
    }
    // this is an optimization, 
    // but it would also put in weird bad rings that would otherwise get left out
    // if (outers.length === 1) {
    //   const out = [outers[0].ring]
    //   for (const inner of inners) {
    //     out.push(inner.ring);

    //   }
    //   return [out];
    // }
    for (const inner of inners) {
      for (const outer of outers) {
        if (contains(outer, inner)) {
          outer.children.push(inner.ring);
          break;
        }
      }
    }
    const out = [];
    for (const outer of outers) {
      out.push([outer.ring].concat(outer.children));
    }
    return out;
  }
  ParseShp.prototype.parsePoint = function (data) {
    return {
      type: 'Point',
      coordinates: this.parseCoord(data, 0)
    };
  };
  ParseShp.prototype.parseZPoint = function (data) {
    const pointXY = this.parsePoint(data);
    pointXY.coordinates.push(data.getFloat64(16, true));
    return pointXY;
  };
  ParseShp.prototype.parsePointArray = function (data, offset, num) {
    const out = [];
    let done = 0;
    while (done < num) {
      out.push(this.parseCoord(data, offset));
      offset += 16;
      done++;
    }
    return out;
  };
  ParseShp.prototype.parseZPointArray = function (data, zOffset, num, coordinates) {
    let i = 0;
    while (i < num) {
      coordinates[i].push(data.getFloat64(zOffset, true));
      i++;
      zOffset += 8;
    }
    return coordinates;
  };
  ParseShp.prototype.parseArrayGroup = function (data, offset, partOffset, num, tot) {
    const out = [];
    let done = 0;
    let curNum; let nextNum = 0;
    let pointNumber;
    while (done < num) {
      done++;
      partOffset += 4;
      curNum = nextNum;
      if (done === num) {
        nextNum = tot;
      } else {
        nextNum = data.getInt32(partOffset, true);
      }
      pointNumber = nextNum - curNum;
      if (!pointNumber) {
        continue;
      }
      out.push(this.parsePointArray(data, offset, pointNumber));
      offset += (pointNumber << 4);
    }
    return out;
  };
  ParseShp.prototype.parseZArrayGroup = function (data, zOffset, num, coordinates) {
    let i = 0;
    while (i < num) {
      coordinates[i] = this.parseZPointArray(data, zOffset, coordinates[i].length, coordinates[i]);
      zOffset += (coordinates[i].length << 3);
      i++;
    }
    return coordinates;
  };
  ParseShp.prototype.parseMultiPoint = function (data) {
    const out = {};
    const num = data.getInt32(32, true);
    if (!num) {
      return null;
    }
    const mins = this.parseCoord(data, 0);
    const maxs = this.parseCoord(data, 16);
    out.bbox = [
      mins[0],
      mins[1],
      maxs[0],
      maxs[1]
    ];
    const offset = 36;
    if (num === 1) {
      out.type = 'Point';
      out.coordinates = this.parseCoord(data, offset);
    } else {
      out.type = 'MultiPoint';
      out.coordinates = this.parsePointArray(data, offset, num);
    }
    return out;
  };
  ParseShp.prototype.parseZMultiPoint = function (data) {
    const geoJson = this.parseMultiPoint(data);
    if (!geoJson) {
      return null;
    }
    let num;
    if (geoJson.type === 'Point') {
      geoJson.coordinates.push(data.getFloat64(72, true));
      return geoJson;
    } else {
      num = geoJson.coordinates.length;
    }
    const zOffset = 52 + (num << 4);
    geoJson.coordinates = this.parseZPointArray(data, zOffset, num, geoJson.coordinates);
    return geoJson;
  };
  ParseShp.prototype.parsePolyline = function (data) {
    const out = {};
    const numParts = data.getInt32(32, true);
    if (!numParts) {
      return null;
    }
    const mins = this.parseCoord(data, 0);
    const maxs = this.parseCoord(data, 16);
    out.bbox = [
      mins[0],
      mins[1],
      maxs[0],
      maxs[1]
    ];
    const num = data.getInt32(36, true);
    let offset, partOffset;
    if (numParts === 1) {
      out.type = 'LineString';
      offset = 44;
      out.coordinates = this.parsePointArray(data, offset, num);
    } else {
      out.type = 'MultiLineString';
      offset = 40 + (numParts << 2);
      partOffset = 40;
      out.coordinates = this.parseArrayGroup(data, offset, partOffset, numParts, num);
    }
    return out;
  };
  ParseShp.prototype.parseZPolyline = function (data) {
    const geoJson = this.parsePolyline(data);
    if (!geoJson) {
      return null;
    }
    const num = geoJson.coordinates.length;
    let zOffset;
    if (geoJson.type === 'LineString') {
      zOffset = 60 + (num << 4);
      geoJson.coordinates = this.parseZPointArray(data, zOffset, num, geoJson.coordinates);
      return geoJson;
    } else {
      const totalPoints = geoJson.coordinates.reduce(function (a, v) {
        return a + v.length;
      }, 0);
      zOffset = 56 + (totalPoints << 4) + (num << 2);
      geoJson.coordinates = this.parseZArrayGroup(data, zOffset, num, geoJson.coordinates);
      return geoJson;
    }
  };
  ParseShp.prototype.polyFuncs = function (out) {
    if (!out) {
      return out;
    }
    if (out.type === 'LineString') {
      out.type = 'Polygon';
      out.coordinates = [out.coordinates];
      return out;
    } else {
      out.coordinates = handleRings(out.coordinates);
      if (out.coordinates.length === 1) {
        out.type = 'Polygon';
        out.coordinates = out.coordinates[0];
        return out;
      } else {
        out.type = 'MultiPolygon';
        return out;
      }
    }
  };
  ParseShp.prototype.parsePolygon = function (data) {
    return this.polyFuncs(this.parsePolyline(data));
  };
  ParseShp.prototype.parseZPolygon = function (data) {
    return this.polyFuncs(this.parseZPolyline(data));
  };
  const shpFuncObj = {
    1: 'parsePoint',
    3: 'parsePolyline',
    5: 'parsePolygon',
    8: 'parseMultiPoint',
    11: 'parseZPoint',
    13: 'parseZPolyline',
    15: 'parseZPolygon',
    18: 'parseZMultiPoint'
  };

  function makeParseCoord(trans) {
    if (trans) {
      return function (data, offset) {
        const args = [data.getFloat64(offset, true), data.getFloat64(offset + 8, true)];
        return trans.inverse(args);
      };
    } else {
      return function (data, offset) {
        return [data.getFloat64(offset, true), data.getFloat64(offset + 8, true)];
      };
    }
  }

  function ParseShp(buffer, trans) {
    if (!(this instanceof ParseShp)) {
      return new ParseShp(buffer, trans);
    }
    this.buffer = buffer;
    this.headers = this.parseHeader();
    this.shpFuncs(trans);
    this.rows = this.getRows();
  }
  ParseShp.prototype.shpFuncs = function (tran) {
    let num = this.headers.shpCode;
    if (num > 20) {
      num -= 20;
    }
    if (!(num in shpFuncObj)) {
      throw new Error(`I don't know shp type "${num}"`);
    }
    this.parseFunc = this[shpFuncObj[num]];
    this.parseCoord = makeParseCoord(tran);
  };
  ParseShp.prototype.getShpCode = function () {
    return this.parseHeader().shpCode;
  };
  ParseShp.prototype.parseHeader = function () {
    const view = this.buffer;
    return {
      length: view.getInt32(6 << 2) << 1,
      version: view.getInt32(7 << 2, true),
      shpCode: view.getInt32(8 << 2, true),
      bbox: [
        view.getFloat64(9 << 2, true),
        view.getFloat64(11 << 2, true),
        view.getFloat64(13 << 2, true),
        view.getFloat64(15 << 2, true)
      ]
    };
  };
  ParseShp.prototype.getRows = function () {
    let offset = 100;
    const len = this.buffer.byteLength - 8;
    const out = [];
    let current;
    while (offset <= len) {
      current = this.getRow(offset);
      if (!current) {
        break;
      }
      offset += 8;
      offset += current.len;
      if (current.type) {
        out.push(this.parseFunc(current.data));
      } else {
        out.push(null);
      }
    }
    return out;
  };
  ParseShp.prototype.getRow = function (offset) {
    const id = this.buffer.getInt32(offset);
    const len = this.buffer.getInt32(offset + 4) << 1;
    if (len === 0) {
      return {
        id: id,
        len: len,
        type: 0
      };
    }

    if (offset + len + 8 > this.buffer.byteLength) {
      return;
    }
    return {
      id: id,
      len: len,
      data: new DataView(this.buffer.buffer, this.buffer.byteOffset + offset + 12, len - 4),
      type: this.buffer.getInt32(offset + 8, true)
    };
  };
  function parseShp (buffer, trans) {
    return new ParseShp(buffer, trans).rows;
  }

  var regex = /^(?:ANSI\s)?(\d+)$/m;
  function createDecoder(encoding, second) {
    if (!encoding) {
      return browserDecoder;
    }
    try {
      new TextDecoder(encoding.trim());
    } catch (e) {
      var match = regex.exec(encoding);
      if (match && !second) {
        return createDecoder('windows-' + match[1], true);
      } else {
        encoding = undefined;
        return browserDecoder;
      }
    }
    return browserDecoder;
    function browserDecoder(buffer) {
      var decoder = new TextDecoder(encoding ? encoding : undefined);
      var out = decoder.decode(buffer, {
        stream: true
      }) + decoder.decode();
      return out.replace(/\0/g, '').trim();
    }
  }

  function dbfHeader(data) {
    var out = {};
    out.lastUpdated = new Date(data.getUint8(1) + 1900, data.getUint8(2), data.getUint8(3));
    out.records = data.getUint32(4, true);
    out.headerLen = data.getUint16(8, true);
    out.recLen = data.getUint16(10, true);
    return out;
  }

  function dbfRowHeader(data, headerLen, decoder) {
    var out = [];
    var offset = 32;
    while (offset < headerLen) {
      out.push({
        name: decoder(new Uint8Array(data.buffer.slice(data.byteOffset + offset, data.byteOffset + offset + 11))),
        dataType: String.fromCharCode(data.getUint8(offset + 11)),
        len: data.getUint8(offset + 16),
        decimal: data.getUint8(offset + 17)
      });
      if (data.getUint8(offset + 32) === 13) {
        break;
      } else {
        offset += 32;
      }
    }
    return out;
  }

  function rowFuncs(buffer, offset, len, type, decoder) {
    const data = new Uint8Array(buffer.buffer.slice(buffer.byteOffset + offset, buffer.byteOffset + offset + len));

    var textData = decoder(data);
    switch (type) {
      case 'N':
      case 'F':
      case 'O':
        return parseFloat(textData, 10);
      case 'D':
        return new Date(textData.slice(0, 4), parseInt(textData.slice(4, 6), 10) - 1, textData.slice(6, 8));
      case 'L':
        return textData.toLowerCase() === 'y' || textData.toLowerCase() === 't';
      default:
        return textData;
    }
  }

  function parseRow(buffer, offset, rowHeaders, decoder) {
    var out = {};
    var i = 0;
    var len = rowHeaders.length;
    var field;
    var header;
    while (i < len) {
      header = rowHeaders[i];
      field = rowFuncs(buffer, offset, header.len, header.dataType, decoder);
      offset += header.len;
      if (typeof field !== 'undefined') {
        out[header.name] = field;
      }
      i++;
    }
    return out;
  }

  function parseDbf (buffer, encoding) {
    var decoder = createDecoder(encoding);
    var header = dbfHeader(buffer);
    var rowHeaders = dbfRowHeader(buffer, header.headerLen - 1, decoder);

    var offset = ((rowHeaders.length + 1) << 5) + 2;
    var recLen = header.recLen;
    var records = header.records;
    var out = [];
    while (records) {
      out.push(parseRow(buffer, offset, rowHeaders, decoder));
      offset += recLen;
      records--;
    }
    return out;
  }

  const URL = globalThis.URL;
  const toUitn8Arr = b => {
    if (!b) {
      throw new Error('forgot to pass buffer');
    }
    if (isArrayBuffer(b)) {
      return new Uint8Array(b);
    }
    if (isArrayBuffer(b.buffer)) {
      if (b.BYTES_PER_ELEMENT === 1) {
        return b;
      }
      return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    }
    throw new Error('invalid buffer like object')
  };
  const txtDecoder = new TextDecoder();
  const toString$1 = (possibleString) => {
    if (!possibleString) {
      return;
    }
    if (typeof possibleString === 'string') {
      return possibleString;
    }
    if (isArrayBuffer(possibleString) || ArrayBuffer.isView(possibleString) || isDataView(possibleString)) {
      return txtDecoder.decode(possibleString);
    }
  };
  const toDataView = b => {
    if (!b) {
      throw new Error('forgot to pass buffer');
    }
    if (isDataView(b)) {
      return b;
    }
    if (isArrayBuffer(b)) {
      return new DataView(b);
    }
    if (isArrayBuffer(b.buffer)) {
      return new DataView(b.buffer, b.byteOffset, b.byteLength);
    }
    throw new Error('invalid buffer like object')
  };

  function isArrayBuffer(subject) {
    return subject instanceof globalThis.ArrayBuffer || Object.prototype.toString.call(subject) === '[object ArrayBuffer]';
  }
  function isDataView(subject) {
    return subject instanceof globalThis.DataView || Object.prototype.toString.call(subject) === '[object DataView]'
  }

  const combine = function ([shp, dbf]) {
    const out = {};
    out.type = 'FeatureCollection';
    out.features = [];
    let i = 0;
    const len = shp.length;
    if (!dbf) {
      dbf = [];
    }
    while (i < len) {
      out.features.push({
        type: 'Feature',
        geometry: shp[i],
        properties: dbf[i] || {}
      });
      i++;
    }
    return out;
  };
  const parseZip = async function (buffer, whiteList) {
    let key;
    buffer = toUitn8Arr(buffer);
    const zip = await unzip(buffer);
    const names = [];
    whiteList = whiteList || [];
    for (key in zip) {
      if (key.indexOf('__MACOSX') !== -1) {
        continue;
      }
      if (key.slice(-4).toLowerCase() === '.shp') {
        names.push(key.slice(0, -4));
        zip[key.slice(0, -3) + key.slice(-3).toLowerCase()] = zip[key];
      } else if (key.slice(-4).toLowerCase() === '.prj') {
        zip[key.slice(0, -3) + key.slice(-3).toLowerCase()] = proj4(zip[key]);
      } else if (key.slice(-5).toLowerCase() === '.json' || whiteList.indexOf(key.split('.').pop()) > -1) {
        names.push(key.slice(0, -3) + key.slice(-3).toLowerCase());
      } else if (key.slice(-4).toLowerCase() === '.dbf' || key.slice(-4).toLowerCase() === '.cpg') {
        zip[key.slice(0, -3) + key.slice(-3).toLowerCase()] = zip[key];
      }
    }
    if (!names.length) {
      throw new Error('no layers founds');
    }
    const geojson = names.map(function (name) {
      let parsed, dbf;
      const lastDotIdx = name.lastIndexOf('.');
      if (lastDotIdx > -1 && name.slice(lastDotIdx).indexOf('json') > -1) {
        parsed = JSON.parse(zip[name]);
        parsed.fileName = name.slice(0, lastDotIdx);
      } else if (whiteList.indexOf(name.slice(lastDotIdx + 1)) > -1) {
        parsed = zip[name];
        parsed.fileName = name;
      } else {
        if (zip[name + '.dbf']) {
          dbf = parseDbf(zip[name + '.dbf'], zip[name + '.cpg']);
        }
        parsed = combine([parseShp(zip[name + '.shp'], zip[name + '.prj']), dbf]);
        parsed.fileName = name;
      }
      return parsed;
    });
    if (geojson.length === 1) {
      return geojson[0];
    } else {
      return geojson;
    }
  };
  async function getZip(base, whiteList) {
    const a = await binaryAjax(base);
    return parseZip(a, whiteList);
  }
  const handleShp = async (base) => {
    const args = await Promise.all([
      binaryAjax(base, 'shp'),
      binaryAjax(base, 'prj')
    ]);
    let prj = false;
    try {
      if (args[1]) {
        prj = proj4(args[1]);
      }
    } catch (e) {
      prj = false;
    }
    return parseShp(args[0], prj);
  };
  const handleDbf = async (base) => {
    const [dbf, cpg] = await Promise.all([
      binaryAjax(base, 'dbf'),
      binaryAjax(base, 'cpg')
    ]);
    if (!dbf) {
      return;
    }
    return parseDbf(dbf, cpg);
  };
  const checkSuffix = (base, suffix) => {
    const url = new URL(base, globalThis?.document?.location);
    return url.pathname.slice(-4).toLowerCase() === suffix;
  };
  const fromObject = ({ shp, dbf, cpg, prj }) => {
    const things = [
      _parseShp(shp, prj)
    ];
    if (dbf) {
      things.push(_parseDbf(dbf, cpg));
    }
    return combine(things);
  };
  const getShapefile = async function (base, whiteList) {
    if (typeof base !== 'string') {
      if (isArrayBuffer(base) || ArrayBuffer.isView(base) || isDataView(base)) {
        return parseZip(base);
      }
      if (base.shp) {
        return fromObject(base);
      }
      throw new TypeError('must be a string, some sort of Buffer, or an object with at least a .shp property')
    }
    if (checkSuffix(base, '.zip')) {
      return getZip(base, whiteList);
    }
    if (checkSuffix(base, '.shp')) {
      base = base.slice(0, -4);
    }
    const results = await Promise.all([
      handleShp(base),
      handleDbf(base)
    ]);
    return combine(results);
  };
  const _parseShp = function (shp, prj) {
    shp = toDataView(shp);
    prj = toString$1(prj);
    if (typeof prj === 'string') {
      try {
        prj = proj4(prj);
      } catch (e) {
        prj = false;
      }
    }
    return parseShp(shp, prj);
  };
  const _parseDbf = function (dbf, cpg) {
    dbf = toDataView(dbf);
    cpg = toString$1(cpg);
    return parseDbf(dbf, cpg);
  };

  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // (disabled):util
  var require_util = __commonJS({
    "(disabled):util"() {
    }
  });

  // lib/chai/utils/index.js
  var utils_exports = {};
  __export(utils_exports, {
    addChainableMethod: () => addChainableMethod,
    addLengthGuard: () => addLengthGuard,
    addMethod: () => addMethod,
    addProperty: () => addProperty,
    checkError: () => check_error_exports,
    compareByInspect: () => compareByInspect,
    eql: () => deep_eql_default,
    expectTypes: () => expectTypes,
    flag: () => flag,
    getActual: () => getActual,
    getMessage: () => getMessage2,
    getName: () => getName,
    getOperator: () => getOperator,
    getOwnEnumerableProperties: () => getOwnEnumerableProperties,
    getOwnEnumerablePropertySymbols: () => getOwnEnumerablePropertySymbols,
    getPathInfo: () => getPathInfo,
    hasProperty: () => hasProperty,
    inspect: () => inspect2,
    isNaN: () => isNaN2,
    isProxyEnabled: () => isProxyEnabled,
    objDisplay: () => objDisplay,
    overwriteChainableMethod: () => overwriteChainableMethod,
    overwriteMethod: () => overwriteMethod,
    overwriteProperty: () => overwriteProperty,
    proxify: () => proxify,
    test: () => test,
    transferFlags: () => transferFlags,
    type: () => type
  });

  // node_modules/check-error/index.js
  var check_error_exports = {};
  __export(check_error_exports, {
    compatibleConstructor: () => compatibleConstructor,
    compatibleInstance: () => compatibleInstance,
    compatibleMessage: () => compatibleMessage,
    getConstructorName: () => getConstructorName,
    getMessage: () => getMessage
  });
  function compatibleInstance(thrown, errorLike) {
    return errorLike instanceof Error && thrown === errorLike;
  }
  __name(compatibleInstance, "compatibleInstance");
  function compatibleConstructor(thrown, errorLike) {
    if (errorLike instanceof Error) {
      return thrown.constructor === errorLike.constructor || thrown instanceof errorLike.constructor;
    } else if (errorLike.prototype instanceof Error || errorLike === Error) {
      return thrown.constructor === errorLike || thrown instanceof errorLike;
    }
    return false;
  }
  __name(compatibleConstructor, "compatibleConstructor");
  function compatibleMessage(thrown, errMatcher) {
    const comparisonString = typeof thrown === "string" ? thrown : thrown.message;
    if (errMatcher instanceof RegExp) {
      return errMatcher.test(comparisonString);
    } else if (typeof errMatcher === "string") {
      return comparisonString.indexOf(errMatcher) !== -1;
    }
    return false;
  }
  __name(compatibleMessage, "compatibleMessage");
  function getConstructorName(errorLike) {
    let constructorName = errorLike;
    if (errorLike instanceof Error) {
      constructorName = errorLike.constructor.name;
    } else if (typeof errorLike === "function") {
      constructorName = errorLike.name;
      if (constructorName === "") {
        const newConstructorName = new errorLike().name;
        constructorName = newConstructorName || constructorName;
      }
    }
    return constructorName;
  }
  __name(getConstructorName, "getConstructorName");
  function getMessage(errorLike) {
    let msg = "";
    if (errorLike && errorLike.message) {
      msg = errorLike.message;
    } else if (typeof errorLike === "string") {
      msg = errorLike;
    }
    return msg;
  }
  __name(getMessage, "getMessage");

  // lib/chai/utils/flag.js
  function flag(obj, key, value) {
    var flags = obj.__flags || (obj.__flags = /* @__PURE__ */ Object.create(null));
    if (arguments.length === 3) {
      flags[key] = value;
    } else {
      return flags[key];
    }
  }
  __name(flag, "flag");

  // lib/chai/utils/test.js
  function test(obj, args) {
    var negate = flag(obj, "negate"), expr = args[0];
    return negate ? !expr : expr;
  }
  __name(test, "test");

  // lib/chai/utils/type-detect.js
  function type(obj) {
    if (typeof obj === "undefined") {
      return "undefined";
    }
    if (obj === null) {
      return "null";
    }
    const stringTag = obj[Symbol.toStringTag];
    if (typeof stringTag === "string") {
      return stringTag;
    }
    const type3 = Object.prototype.toString.call(obj).slice(8, -1);
    return type3;
  }
  __name(type, "type");

  // node_modules/assertion-error/index.js
  var canElideFrames = "captureStackTrace" in Error;
  var AssertionError = class _AssertionError extends Error {
    static {
      __name(this, "AssertionError");
    }
    message;
    get name() {
      return "AssertionError";
    }
    get ok() {
      return false;
    }
    constructor(message = "Unspecified AssertionError", props, ssf) {
      super(message);
      this.message = message;
      if (canElideFrames) {
        Error.captureStackTrace(this, ssf || _AssertionError);
      }
      for (const key in props) {
        if (!(key in this)) {
          this[key] = props[key];
        }
      }
    }
    toJSON(stack) {
      return {
        ...this,
        name: this.name,
        message: this.message,
        ok: false,
        stack: stack !== false ? this.stack : void 0
      };
    }
  };

  // lib/chai/utils/expectTypes.js
  function expectTypes(obj, types) {
    var flagMsg = flag(obj, "message");
    var ssfi = flag(obj, "ssfi");
    flagMsg = flagMsg ? flagMsg + ": " : "";
    obj = flag(obj, "object");
    types = types.map(function(t) {
      return t.toLowerCase();
    });
    types.sort();
    var str = types.map(function(t, index) {
      var art = ~["a", "e", "i", "o", "u"].indexOf(t.charAt(0)) ? "an" : "a";
      var or = types.length > 1 && index === types.length - 1 ? "or " : "";
      return or + art + " " + t;
    }).join(", ");
    var objType = type(obj).toLowerCase();
    if (!types.some(function(expected) {
      return objType === expected;
    })) {
      throw new AssertionError(
        flagMsg + "object tested must be " + str + ", but " + objType + " given",
        void 0,
        ssfi
      );
    }
  }
  __name(expectTypes, "expectTypes");

  // lib/chai/utils/getActual.js
  function getActual(obj, args) {
    return args.length > 4 ? args[4] : obj._obj;
  }
  __name(getActual, "getActual");

  // node_modules/loupe/lib/helpers.js
  var ansiColors = {
    bold: ["1", "22"],
    dim: ["2", "22"],
    italic: ["3", "23"],
    underline: ["4", "24"],
    // 5 & 6 are blinking
    inverse: ["7", "27"],
    hidden: ["8", "28"],
    strike: ["9", "29"],
    // 10-20 are fonts
    // 21-29 are resets for 1-9
    black: ["30", "39"],
    red: ["31", "39"],
    green: ["32", "39"],
    yellow: ["33", "39"],
    blue: ["34", "39"],
    magenta: ["35", "39"],
    cyan: ["36", "39"],
    white: ["37", "39"],
    brightblack: ["30;1", "39"],
    brightred: ["31;1", "39"],
    brightgreen: ["32;1", "39"],
    brightyellow: ["33;1", "39"],
    brightblue: ["34;1", "39"],
    brightmagenta: ["35;1", "39"],
    brightcyan: ["36;1", "39"],
    brightwhite: ["37;1", "39"],
    grey: ["90", "39"]
  };
  var styles = {
    special: "cyan",
    number: "yellow",
    bigint: "yellow",
    boolean: "yellow",
    undefined: "grey",
    null: "bold",
    string: "green",
    symbol: "green",
    date: "magenta",
    regexp: "red"
  };
  var truncator = "\u2026";
  function colorise(value, styleType) {
    const color = ansiColors[styles[styleType]] || ansiColors[styleType] || "";
    if (!color) {
      return String(value);
    }
    return `\x1B[${color[0]}m${String(value)}\x1B[${color[1]}m`;
  }
  __name(colorise, "colorise");
  function normaliseOptions({
    showHidden = false,
    depth = 2,
    colors = false,
    customInspect = true,
    showProxy = false,
    maxArrayLength = Infinity,
    breakLength = Infinity,
    seen = [],
    // eslint-disable-next-line no-shadow
    truncate: truncate2 = Infinity,
    stylize = String
  } = {}, inspect3) {
    const options = {
      showHidden: Boolean(showHidden),
      depth: Number(depth),
      colors: Boolean(colors),
      customInspect: Boolean(customInspect),
      showProxy: Boolean(showProxy),
      maxArrayLength: Number(maxArrayLength),
      breakLength: Number(breakLength),
      truncate: Number(truncate2),
      seen,
      inspect: inspect3,
      stylize
    };
    if (options.colors) {
      options.stylize = colorise;
    }
    return options;
  }
  __name(normaliseOptions, "normaliseOptions");
  function truncate(string, length, tail = truncator) {
    string = String(string);
    const tailLength = tail.length;
    const stringLength = string.length;
    if (tailLength > length && stringLength > tailLength) {
      return tail;
    }
    if (stringLength > length && stringLength > tailLength) {
      return `${string.slice(0, length - tailLength)}${tail}`;
    }
    return string;
  }
  __name(truncate, "truncate");
  function inspectList(list, options, inspectItem, separator = ", ") {
    inspectItem = inspectItem || options.inspect;
    const size = list.length;
    if (size === 0)
      return "";
    const originalLength = options.truncate;
    let output = "";
    let peek = "";
    let truncated = "";
    for (let i = 0; i < size; i += 1) {
      const last = i + 1 === list.length;
      const secondToLast = i + 2 === list.length;
      truncated = `${truncator}(${list.length - i})`;
      const value = list[i];
      options.truncate = originalLength - output.length - (last ? 0 : separator.length);
      const string = peek || inspectItem(value, options) + (last ? "" : separator);
      const nextLength = output.length + string.length;
      const truncatedLength = nextLength + truncated.length;
      if (last && nextLength > originalLength && output.length + truncated.length <= originalLength) {
        break;
      }
      if (!last && !secondToLast && truncatedLength > originalLength) {
        break;
      }
      peek = last ? "" : inspectItem(list[i + 1], options) + (secondToLast ? "" : separator);
      if (!last && secondToLast && truncatedLength > originalLength && nextLength + peek.length > originalLength) {
        break;
      }
      output += string;
      if (!last && !secondToLast && nextLength + peek.length >= originalLength) {
        truncated = `${truncator}(${list.length - i - 1})`;
        break;
      }
      truncated = "";
    }
    return `${output}${truncated}`;
  }
  __name(inspectList, "inspectList");
  function quoteComplexKey(key) {
    if (key.match(/^[a-zA-Z_][a-zA-Z_0-9]*$/)) {
      return key;
    }
    return JSON.stringify(key).replace(/'/g, "\\'").replace(/\\"/g, '"').replace(/(^"|"$)/g, "'");
  }
  __name(quoteComplexKey, "quoteComplexKey");
  function inspectProperty([key, value], options) {
    options.truncate -= 2;
    if (typeof key === "string") {
      key = quoteComplexKey(key);
    } else if (typeof key !== "number") {
      key = `[${options.inspect(key, options)}]`;
    }
    options.truncate -= key.length;
    value = options.inspect(value, options);
    return `${key}: ${value}`;
  }
  __name(inspectProperty, "inspectProperty");

  // node_modules/loupe/lib/array.js
  function inspectArray(array, options) {
    const nonIndexProperties = Object.keys(array).slice(array.length);
    if (!array.length && !nonIndexProperties.length)
      return "[]";
    options.truncate -= 4;
    const listContents = inspectList(array, options);
    options.truncate -= listContents.length;
    let propertyContents = "";
    if (nonIndexProperties.length) {
      propertyContents = inspectList(nonIndexProperties.map((key) => [key, array[key]]), options, inspectProperty);
    }
    return `[ ${listContents}${propertyContents ? `, ${propertyContents}` : ""} ]`;
  }
  __name(inspectArray, "inspectArray");

  // node_modules/loupe/lib/typedarray.js
  var getArrayName = /* @__PURE__ */ __name((array) => {
    if (typeof Buffer === "function" && array instanceof Buffer) {
      return "Buffer";
    }
    if (array[Symbol.toStringTag]) {
      return array[Symbol.toStringTag];
    }
    return array.constructor.name;
  }, "getArrayName");
  function inspectTypedArray(array, options) {
    const name = getArrayName(array);
    options.truncate -= name.length + 4;
    const nonIndexProperties = Object.keys(array).slice(array.length);
    if (!array.length && !nonIndexProperties.length)
      return `${name}[]`;
    let output = "";
    for (let i = 0; i < array.length; i++) {
      const string = `${options.stylize(truncate(array[i], options.truncate), "number")}${i === array.length - 1 ? "" : ", "}`;
      options.truncate -= string.length;
      if (array[i] !== array.length && options.truncate <= 3) {
        output += `${truncator}(${array.length - array[i] + 1})`;
        break;
      }
      output += string;
    }
    let propertyContents = "";
    if (nonIndexProperties.length) {
      propertyContents = inspectList(nonIndexProperties.map((key) => [key, array[key]]), options, inspectProperty);
    }
    return `${name}[ ${output}${propertyContents ? `, ${propertyContents}` : ""} ]`;
  }
  __name(inspectTypedArray, "inspectTypedArray");

  // node_modules/loupe/lib/date.js
  function inspectDate(dateObject, options) {
    const stringRepresentation = dateObject.toJSON();
    if (stringRepresentation === null) {
      return "Invalid Date";
    }
    const split = stringRepresentation.split("T");
    const date = split[0];
    return options.stylize(`${date}T${truncate(split[1], options.truncate - date.length - 1)}`, "date");
  }
  __name(inspectDate, "inspectDate");

  // node_modules/loupe/lib/function.js
  function inspectFunction(func, options) {
    const functionType = func[Symbol.toStringTag] || "Function";
    const name = func.name;
    if (!name) {
      return options.stylize(`[${functionType}]`, "special");
    }
    return options.stylize(`[${functionType} ${truncate(name, options.truncate - 11)}]`, "special");
  }
  __name(inspectFunction, "inspectFunction");

  // node_modules/loupe/lib/map.js
  function inspectMapEntry([key, value], options) {
    options.truncate -= 4;
    key = options.inspect(key, options);
    options.truncate -= key.length;
    value = options.inspect(value, options);
    return `${key} => ${value}`;
  }
  __name(inspectMapEntry, "inspectMapEntry");
  function mapToEntries(map) {
    const entries = [];
    map.forEach((value, key) => {
      entries.push([key, value]);
    });
    return entries;
  }
  __name(mapToEntries, "mapToEntries");
  function inspectMap(map, options) {
    const size = map.size - 1;
    if (size <= 0) {
      return "Map{}";
    }
    options.truncate -= 7;
    return `Map{ ${inspectList(mapToEntries(map), options, inspectMapEntry)} }`;
  }
  __name(inspectMap, "inspectMap");

  // node_modules/loupe/lib/number.js
  var isNaN$1 = Number.isNaN || ((i) => i !== i);
  function inspectNumber(number, options) {
    if (isNaN$1(number)) {
      return options.stylize("NaN", "number");
    }
    if (number === Infinity) {
      return options.stylize("Infinity", "number");
    }
    if (number === -Infinity) {
      return options.stylize("-Infinity", "number");
    }
    if (number === 0) {
      return options.stylize(1 / number === Infinity ? "+0" : "-0", "number");
    }
    return options.stylize(truncate(String(number), options.truncate), "number");
  }
  __name(inspectNumber, "inspectNumber");

  // node_modules/loupe/lib/bigint.js
  function inspectBigInt(number, options) {
    let nums = truncate(number.toString(), options.truncate - 1);
    if (nums !== truncator)
      nums += "n";
    return options.stylize(nums, "bigint");
  }
  __name(inspectBigInt, "inspectBigInt");

  // node_modules/loupe/lib/regexp.js
  function inspectRegExp(value, options) {
    const flags = value.toString().split("/")[2];
    const sourceLength = options.truncate - (2 + flags.length);
    const source = value.source;
    return options.stylize(`/${truncate(source, sourceLength)}/${flags}`, "regexp");
  }
  __name(inspectRegExp, "inspectRegExp");

  // node_modules/loupe/lib/set.js
  function arrayFromSet(set2) {
    const values = [];
    set2.forEach((value) => {
      values.push(value);
    });
    return values;
  }
  __name(arrayFromSet, "arrayFromSet");
  function inspectSet(set2, options) {
    if (set2.size === 0)
      return "Set{}";
    options.truncate -= 7;
    return `Set{ ${inspectList(arrayFromSet(set2), options)} }`;
  }
  __name(inspectSet, "inspectSet");

  // node_modules/loupe/lib/string.js
  var stringEscapeChars = new RegExp("['\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u0600-\\u0604\\u070f\\u17b4\\u17b5\\u200c-\\u200f\\u2028-\\u202f\\u2060-\\u206f\\ufeff\\ufff0-\\uffff]", "g");
  var escapeCharacters = {
    "\b": "\\b",
    "	": "\\t",
    "\n": "\\n",
    "\f": "\\f",
    "\r": "\\r",
    "'": "\\'",
    "\\": "\\\\"
  };
  var hex = 16;
  var unicodeLength = 4;
  function escape(char) {
    return escapeCharacters[char] || `\\u${`0000${char.charCodeAt(0).toString(hex)}`.slice(-unicodeLength)}`;
  }
  __name(escape, "escape");
  function inspectString(string, options) {
    if (stringEscapeChars.test(string)) {
      string = string.replace(stringEscapeChars, escape);
    }
    return options.stylize(`'${truncate(string, options.truncate - 2)}'`, "string");
  }
  __name(inspectString, "inspectString");

  // node_modules/loupe/lib/symbol.js
  function inspectSymbol(value) {
    if ("description" in Symbol.prototype) {
      return value.description ? `Symbol(${value.description})` : "Symbol()";
    }
    return value.toString();
  }
  __name(inspectSymbol, "inspectSymbol");

  // node_modules/loupe/lib/promise.js
  var getPromiseValue = /* @__PURE__ */ __name(() => "Promise{\u2026}", "getPromiseValue");
  try {
    const { getPromiseDetails, kPending, kRejected } = process.binding("util");
    if (Array.isArray(getPromiseDetails(Promise.resolve()))) {
      getPromiseValue = /* @__PURE__ */ __name((value, options) => {
        const [state, innerValue] = getPromiseDetails(value);
        if (state === kPending) {
          return "Promise{<pending>}";
        }
        return `Promise${state === kRejected ? "!" : ""}{${options.inspect(innerValue, options)}}`;
      }, "getPromiseValue");
    }
  } catch (notNode) {
  }
  var promise_default = getPromiseValue;

  // node_modules/loupe/lib/object.js
  function inspectObject(object, options) {
    const properties = Object.getOwnPropertyNames(object);
    const symbols = Object.getOwnPropertySymbols ? Object.getOwnPropertySymbols(object) : [];
    if (properties.length === 0 && symbols.length === 0) {
      return "{}";
    }
    options.truncate -= 4;
    options.seen = options.seen || [];
    if (options.seen.indexOf(object) >= 0) {
      return "[Circular]";
    }
    options.seen.push(object);
    const propertyContents = inspectList(properties.map((key) => [key, object[key]]), options, inspectProperty);
    const symbolContents = inspectList(symbols.map((key) => [key, object[key]]), options, inspectProperty);
    options.seen.pop();
    let sep = "";
    if (propertyContents && symbolContents) {
      sep = ", ";
    }
    return `{ ${propertyContents}${sep}${symbolContents} }`;
  }
  __name(inspectObject, "inspectObject");

  // node_modules/loupe/lib/class.js
  var toStringTag = typeof Symbol !== "undefined" && Symbol.toStringTag ? Symbol.toStringTag : false;
  function inspectClass(value, options) {
    let name = "";
    if (toStringTag && toStringTag in value) {
      name = value[toStringTag];
    }
    name = name || value.constructor.name;
    if (!name || name === "_class") {
      name = "<Anonymous Class>";
    }
    options.truncate -= name.length;
    return `${name}${inspectObject(value, options)}`;
  }
  __name(inspectClass, "inspectClass");

  // node_modules/loupe/lib/arguments.js
  function inspectArguments(args, options) {
    if (args.length === 0)
      return "Arguments[]";
    options.truncate -= 13;
    return `Arguments[ ${inspectList(args, options)} ]`;
  }
  __name(inspectArguments, "inspectArguments");

  // node_modules/loupe/lib/error.js
  var errorKeys = [
    "stack",
    "line",
    "column",
    "name",
    "message",
    "fileName",
    "lineNumber",
    "columnNumber",
    "number",
    "description"
  ];
  function inspectObject2(error, options) {
    const properties = Object.getOwnPropertyNames(error).filter((key) => errorKeys.indexOf(key) === -1);
    const name = error.name;
    options.truncate -= name.length;
    let message = "";
    if (typeof error.message === "string") {
      message = truncate(error.message, options.truncate);
    } else {
      properties.unshift("message");
    }
    message = message ? `: ${message}` : "";
    options.truncate -= message.length + 5;
    const propertyContents = inspectList(properties.map((key) => [key, error[key]]), options, inspectProperty);
    return `${name}${message}${propertyContents ? ` { ${propertyContents} }` : ""}`;
  }
  __name(inspectObject2, "inspectObject");

  // node_modules/loupe/lib/html.js
  function inspectAttribute([key, value], options) {
    options.truncate -= 3;
    if (!value) {
      return `${options.stylize(String(key), "yellow")}`;
    }
    return `${options.stylize(String(key), "yellow")}=${options.stylize(`"${value}"`, "string")}`;
  }
  __name(inspectAttribute, "inspectAttribute");
  function inspectHTMLCollection(collection, options) {
    return inspectList(collection, options, inspectHTML, "\n");
  }
  __name(inspectHTMLCollection, "inspectHTMLCollection");
  function inspectHTML(element, options) {
    const properties = element.getAttributeNames();
    const name = element.tagName.toLowerCase();
    const head = options.stylize(`<${name}`, "special");
    const headClose = options.stylize(`>`, "special");
    const tail = options.stylize(`</${name}>`, "special");
    options.truncate -= name.length * 2 + 5;
    let propertyContents = "";
    if (properties.length > 0) {
      propertyContents += " ";
      propertyContents += inspectList(properties.map((key) => [key, element.getAttribute(key)]), options, inspectAttribute, " ");
    }
    options.truncate -= propertyContents.length;
    const truncate2 = options.truncate;
    let children = inspectHTMLCollection(element.children, options);
    if (children && children.length > truncate2) {
      children = `${truncator}(${element.children.length})`;
    }
    return `${head}${propertyContents}${headClose}${children}${tail}`;
  }
  __name(inspectHTML, "inspectHTML");

  // node_modules/loupe/lib/index.js
  var symbolsSupported = typeof Symbol === "function" && typeof Symbol.for === "function";
  var chaiInspect = symbolsSupported ? Symbol.for("chai/inspect") : "@@chai/inspect";
  var nodeInspect = false;
  try {
    const nodeUtil = require_util();
    nodeInspect = nodeUtil.inspect ? nodeUtil.inspect.custom : false;
  } catch (noNodeInspect) {
    nodeInspect = false;
  }
  var constructorMap = /* @__PURE__ */ new WeakMap();
  var stringTagMap = {};
  var baseTypesMap = {
    undefined: (value, options) => options.stylize("undefined", "undefined"),
    null: (value, options) => options.stylize("null", "null"),
    boolean: (value, options) => options.stylize(String(value), "boolean"),
    Boolean: (value, options) => options.stylize(String(value), "boolean"),
    number: inspectNumber,
    Number: inspectNumber,
    bigint: inspectBigInt,
    BigInt: inspectBigInt,
    string: inspectString,
    String: inspectString,
    function: inspectFunction,
    Function: inspectFunction,
    symbol: inspectSymbol,
    // A Symbol polyfill will return `Symbol` not `symbol` from typedetect
    Symbol: inspectSymbol,
    Array: inspectArray,
    Date: inspectDate,
    Map: inspectMap,
    Set: inspectSet,
    RegExp: inspectRegExp,
    Promise: promise_default,
    // WeakSet, WeakMap are totally opaque to us
    WeakSet: (value, options) => options.stylize("WeakSet{\u2026}", "special"),
    WeakMap: (value, options) => options.stylize("WeakMap{\u2026}", "special"),
    Arguments: inspectArguments,
    Int8Array: inspectTypedArray,
    Uint8Array: inspectTypedArray,
    Uint8ClampedArray: inspectTypedArray,
    Int16Array: inspectTypedArray,
    Uint16Array: inspectTypedArray,
    Int32Array: inspectTypedArray,
    Uint32Array: inspectTypedArray,
    Float32Array: inspectTypedArray,
    Float64Array: inspectTypedArray,
    Generator: () => "",
    DataView: () => "",
    ArrayBuffer: () => "",
    Error: inspectObject2,
    HTMLCollection: inspectHTMLCollection,
    NodeList: inspectHTMLCollection
  };
  var inspectCustom = /* @__PURE__ */ __name((value, options, type3) => {
    if (chaiInspect in value && typeof value[chaiInspect] === "function") {
      return value[chaiInspect](options);
    }
    if (nodeInspect && nodeInspect in value && typeof value[nodeInspect] === "function") {
      return value[nodeInspect](options.depth, options);
    }
    if ("inspect" in value && typeof value.inspect === "function") {
      return value.inspect(options.depth, options);
    }
    if ("constructor" in value && constructorMap.has(value.constructor)) {
      return constructorMap.get(value.constructor)(value, options);
    }
    if (stringTagMap[type3]) {
      return stringTagMap[type3](value, options);
    }
    return "";
  }, "inspectCustom");
  var toString = Object.prototype.toString;
  function inspect(value, opts = {}) {
    const options = normaliseOptions(opts, inspect);
    const { customInspect } = options;
    let type3 = value === null ? "null" : typeof value;
    if (type3 === "object") {
      type3 = toString.call(value).slice(8, -1);
    }
    if (type3 in baseTypesMap) {
      return baseTypesMap[type3](value, options);
    }
    if (customInspect && value) {
      const output = inspectCustom(value, options, type3);
      if (output) {
        if (typeof output === "string")
          return output;
        return inspect(output, options);
      }
    }
    const proto = value ? Object.getPrototypeOf(value) : false;
    if (proto === Object.prototype || proto === null) {
      return inspectObject(value, options);
    }
    if (value && typeof HTMLElement === "function" && value instanceof HTMLElement) {
      return inspectHTML(value, options);
    }
    if ("constructor" in value) {
      if (value.constructor !== Object) {
        return inspectClass(value, options);
      }
      return inspectObject(value, options);
    }
    if (value === Object(value)) {
      return inspectObject(value, options);
    }
    return options.stylize(String(value), type3);
  }
  __name(inspect, "inspect");

  // lib/chai/config.js
  var config = {
    /**
     * ### config.includeStack
     *
     * User configurable property, influences whether stack trace
     * is included in Assertion error message. Default of false
     * suppresses stack trace in the error message.
     *
     *     chai.config.includeStack = true;  // enable stack on error
     *
     * @param {Boolean}
     * @api public
     */
    includeStack: false,
    /**
     * ### config.showDiff
     *
     * User configurable property, influences whether or not
     * the `showDiff` flag should be included in the thrown
     * AssertionErrors. `false` will always be `false`; `true`
     * will be true when the assertion has requested a diff
     * be shown.
     *
     * @param {Boolean}
     * @api public
     */
    showDiff: true,
    /**
     * ### config.truncateThreshold
     *
     * User configurable property, sets length threshold for actual and
     * expected values in assertion errors. If this threshold is exceeded, for
     * example for large data structures, the value is replaced with something
     * like `[ Array(3) ]` or `{ Object (prop1, prop2) }`.
     *
     * Set it to zero if you want to disable truncating altogether.
     *
     * This is especially userful when doing assertions on arrays: having this
     * set to a reasonable large value makes the failure messages readily
     * inspectable.
     *
     *     chai.config.truncateThreshold = 0;  // disable truncating
     *
     * @param {Number}
     * @api public
     */
    truncateThreshold: 40,
    /**
     * ### config.useProxy
     *
     * User configurable property, defines if chai will use a Proxy to throw
     * an error when a non-existent property is read, which protects users
     * from typos when using property-based assertions.
     *
     * Set it to false if you want to disable this feature.
     *
     *     chai.config.useProxy = false;  // disable use of Proxy
     *
     * This feature is automatically disabled regardless of this config value
     * in environments that don't support proxies.
     *
     * @param {Boolean}
     * @api public
     */
    useProxy: true,
    /**
     * ### config.proxyExcludedKeys
     *
     * User configurable property, defines which properties should be ignored
     * instead of throwing an error if they do not exist on the assertion.
     * This is only applied if the environment Chai is running in supports proxies and
     * if the `useProxy` configuration setting is enabled.
     * By default, `then` and `inspect` will not throw an error if they do not exist on the
     * assertion object because the `.inspect` property is read by `util.inspect` (for example, when
     * using `console.log` on the assertion object) and `.then` is necessary for promise type-checking.
     *
     *     // By default these keys will not throw an error if they do not exist on the assertion object
     *     chai.config.proxyExcludedKeys = ['then', 'inspect'];
     *
     * @param {Array}
     * @api public
     */
    proxyExcludedKeys: ["then", "catch", "inspect", "toJSON"],
    /**
     * ### config.deepEqual
     *
     * User configurable property, defines which a custom function to use for deepEqual
     * comparisons.
     * By default, the function used is the one from the `deep-eql` package without custom comparator.
     *
     *     // use a custom comparator
     *     chai.config.deepEqual = (expected, actual) => {
     *        return chai.util.eql(expected, actual, {
     *           comparator: (expected, actual) => {
     *              // for non number comparison, use the default behavior
     *              if(typeof expected !== 'number') return null;
     *              // allow a difference of 10 between compared numbers
     *              return typeof actual === 'number' && Math.abs(actual - expected) < 10
     *           }
     *        })
     *     };
     *
     * @param {Function}
     * @api public
     */
    deepEqual: null
  };

  // lib/chai/utils/inspect.js
  function inspect2(obj, showHidden, depth, colors) {
    var options = {
      colors,
      depth: typeof depth === "undefined" ? 2 : depth,
      showHidden,
      truncate: config.truncateThreshold ? config.truncateThreshold : Infinity
    };
    return inspect(obj, options);
  }
  __name(inspect2, "inspect");

  // lib/chai/utils/objDisplay.js
  function objDisplay(obj) {
    var str = inspect2(obj), type3 = Object.prototype.toString.call(obj);
    if (config.truncateThreshold && str.length >= config.truncateThreshold) {
      if (type3 === "[object Function]") {
        return !obj.name || obj.name === "" ? "[Function]" : "[Function: " + obj.name + "]";
      } else if (type3 === "[object Array]") {
        return "[ Array(" + obj.length + ") ]";
      } else if (type3 === "[object Object]") {
        var keys = Object.keys(obj), kstr = keys.length > 2 ? keys.splice(0, 2).join(", ") + ", ..." : keys.join(", ");
        return "{ Object (" + kstr + ") }";
      } else {
        return str;
      }
    } else {
      return str;
    }
  }
  __name(objDisplay, "objDisplay");

  // lib/chai/utils/getMessage.js
  function getMessage2(obj, args) {
    var negate = flag(obj, "negate"), val = flag(obj, "object"), expected = args[3], actual = getActual(obj, args), msg = negate ? args[2] : args[1], flagMsg = flag(obj, "message");
    if (typeof msg === "function")
      msg = msg();
    msg = msg || "";
    msg = msg.replace(/#\{this\}/g, function() {
      return objDisplay(val);
    }).replace(/#\{act\}/g, function() {
      return objDisplay(actual);
    }).replace(/#\{exp\}/g, function() {
      return objDisplay(expected);
    });
    return flagMsg ? flagMsg + ": " + msg : msg;
  }
  __name(getMessage2, "getMessage");

  // lib/chai/utils/transferFlags.js
  function transferFlags(assertion, object, includeAll) {
    var flags = assertion.__flags || (assertion.__flags = /* @__PURE__ */ Object.create(null));
    if (!object.__flags) {
      object.__flags = /* @__PURE__ */ Object.create(null);
    }
    includeAll = arguments.length === 3 ? includeAll : true;
    for (var flag3 in flags) {
      if (includeAll || flag3 !== "object" && flag3 !== "ssfi" && flag3 !== "lockSsfi" && flag3 != "message") {
        object.__flags[flag3] = flags[flag3];
      }
    }
  }
  __name(transferFlags, "transferFlags");

  // node_modules/deep-eql/index.js
  function type2(obj) {
    if (typeof obj === "undefined") {
      return "undefined";
    }
    if (obj === null) {
      return "null";
    }
    const stringTag = obj[Symbol.toStringTag];
    if (typeof stringTag === "string") {
      return stringTag;
    }
    const sliceStart = 8;
    const sliceEnd = -1;
    return Object.prototype.toString.call(obj).slice(sliceStart, sliceEnd);
  }
  __name(type2, "type");
  function FakeMap() {
    this._key = "chai/deep-eql__" + Math.random() + Date.now();
  }
  __name(FakeMap, "FakeMap");
  FakeMap.prototype = {
    get: /* @__PURE__ */ __name(function get(key) {
      return key[this._key];
    }, "get"),
    set: /* @__PURE__ */ __name(function set(key, value) {
      if (Object.isExtensible(key)) {
        Object.defineProperty(key, this._key, {
          value,
          configurable: true
        });
      }
    }, "set")
  };
  var MemoizeMap = typeof WeakMap === "function" ? WeakMap : FakeMap;
  function memoizeCompare(leftHandOperand, rightHandOperand, memoizeMap) {
    if (!memoizeMap || isPrimitive(leftHandOperand) || isPrimitive(rightHandOperand)) {
      return null;
    }
    var leftHandMap = memoizeMap.get(leftHandOperand);
    if (leftHandMap) {
      var result = leftHandMap.get(rightHandOperand);
      if (typeof result === "boolean") {
        return result;
      }
    }
    return null;
  }
  __name(memoizeCompare, "memoizeCompare");
  function memoizeSet(leftHandOperand, rightHandOperand, memoizeMap, result) {
    if (!memoizeMap || isPrimitive(leftHandOperand) || isPrimitive(rightHandOperand)) {
      return;
    }
    var leftHandMap = memoizeMap.get(leftHandOperand);
    if (leftHandMap) {
      leftHandMap.set(rightHandOperand, result);
    } else {
      leftHandMap = new MemoizeMap();
      leftHandMap.set(rightHandOperand, result);
      memoizeMap.set(leftHandOperand, leftHandMap);
    }
  }
  __name(memoizeSet, "memoizeSet");
  var deep_eql_default = deepEqual;
  function deepEqual(leftHandOperand, rightHandOperand, options) {
    if (options && options.comparator) {
      return extensiveDeepEqual(leftHandOperand, rightHandOperand, options);
    }
    var simpleResult = simpleEqual(leftHandOperand, rightHandOperand);
    if (simpleResult !== null) {
      return simpleResult;
    }
    return extensiveDeepEqual(leftHandOperand, rightHandOperand, options);
  }
  __name(deepEqual, "deepEqual");
  function simpleEqual(leftHandOperand, rightHandOperand) {
    if (leftHandOperand === rightHandOperand) {
      return leftHandOperand !== 0 || 1 / leftHandOperand === 1 / rightHandOperand;
    }
    if (leftHandOperand !== leftHandOperand && // eslint-disable-line no-self-compare
    rightHandOperand !== rightHandOperand) {
      return true;
    }
    if (isPrimitive(leftHandOperand) || isPrimitive(rightHandOperand)) {
      return false;
    }
    return null;
  }
  __name(simpleEqual, "simpleEqual");
  function extensiveDeepEqual(leftHandOperand, rightHandOperand, options) {
    options = options || {};
    options.memoize = options.memoize === false ? false : options.memoize || new MemoizeMap();
    var comparator = options && options.comparator;
    var memoizeResultLeft = memoizeCompare(leftHandOperand, rightHandOperand, options.memoize);
    if (memoizeResultLeft !== null) {
      return memoizeResultLeft;
    }
    var memoizeResultRight = memoizeCompare(rightHandOperand, leftHandOperand, options.memoize);
    if (memoizeResultRight !== null) {
      return memoizeResultRight;
    }
    if (comparator) {
      var comparatorResult = comparator(leftHandOperand, rightHandOperand);
      if (comparatorResult === false || comparatorResult === true) {
        memoizeSet(leftHandOperand, rightHandOperand, options.memoize, comparatorResult);
        return comparatorResult;
      }
      var simpleResult = simpleEqual(leftHandOperand, rightHandOperand);
      if (simpleResult !== null) {
        return simpleResult;
      }
    }
    var leftHandType = type2(leftHandOperand);
    if (leftHandType !== type2(rightHandOperand)) {
      memoizeSet(leftHandOperand, rightHandOperand, options.memoize, false);
      return false;
    }
    memoizeSet(leftHandOperand, rightHandOperand, options.memoize, true);
    var result = extensiveDeepEqualByType(leftHandOperand, rightHandOperand, leftHandType, options);
    memoizeSet(leftHandOperand, rightHandOperand, options.memoize, result);
    return result;
  }
  __name(extensiveDeepEqual, "extensiveDeepEqual");
  function extensiveDeepEqualByType(leftHandOperand, rightHandOperand, leftHandType, options) {
    switch (leftHandType) {
      case "String":
      case "Number":
      case "Boolean":
      case "Date":
        return deepEqual(leftHandOperand.valueOf(), rightHandOperand.valueOf());
      case "Promise":
      case "Symbol":
      case "function":
      case "WeakMap":
      case "WeakSet":
        return leftHandOperand === rightHandOperand;
      case "Error":
        return keysEqual(leftHandOperand, rightHandOperand, ["name", "message", "code"], options);
      case "Arguments":
      case "Int8Array":
      case "Uint8Array":
      case "Uint8ClampedArray":
      case "Int16Array":
      case "Uint16Array":
      case "Int32Array":
      case "Uint32Array":
      case "Float32Array":
      case "Float64Array":
      case "Array":
        return iterableEqual(leftHandOperand, rightHandOperand, options);
      case "RegExp":
        return regexpEqual(leftHandOperand, rightHandOperand);
      case "Generator":
        return generatorEqual(leftHandOperand, rightHandOperand, options);
      case "DataView":
        return iterableEqual(new Uint8Array(leftHandOperand.buffer), new Uint8Array(rightHandOperand.buffer), options);
      case "ArrayBuffer":
        return iterableEqual(new Uint8Array(leftHandOperand), new Uint8Array(rightHandOperand), options);
      case "Set":
        return entriesEqual(leftHandOperand, rightHandOperand, options);
      case "Map":
        return entriesEqual(leftHandOperand, rightHandOperand, options);
      case "Temporal.PlainDate":
      case "Temporal.PlainTime":
      case "Temporal.PlainDateTime":
      case "Temporal.Instant":
      case "Temporal.ZonedDateTime":
      case "Temporal.PlainYearMonth":
      case "Temporal.PlainMonthDay":
        return leftHandOperand.equals(rightHandOperand);
      case "Temporal.Duration":
        return leftHandOperand.total("nanoseconds") === rightHandOperand.total("nanoseconds");
      case "Temporal.TimeZone":
      case "Temporal.Calendar":
        return leftHandOperand.toString() === rightHandOperand.toString();
      default:
        return objectEqual(leftHandOperand, rightHandOperand, options);
    }
  }
  __name(extensiveDeepEqualByType, "extensiveDeepEqualByType");
  function regexpEqual(leftHandOperand, rightHandOperand) {
    return leftHandOperand.toString() === rightHandOperand.toString();
  }
  __name(regexpEqual, "regexpEqual");
  function entriesEqual(leftHandOperand, rightHandOperand, options) {
    if (leftHandOperand.size !== rightHandOperand.size) {
      return false;
    }
    if (leftHandOperand.size === 0) {
      return true;
    }
    var leftHandItems = [];
    var rightHandItems = [];
    leftHandOperand.forEach(/* @__PURE__ */ __name(function gatherEntries(key, value) {
      leftHandItems.push([key, value]);
    }, "gatherEntries"));
    rightHandOperand.forEach(/* @__PURE__ */ __name(function gatherEntries(key, value) {
      rightHandItems.push([key, value]);
    }, "gatherEntries"));
    return iterableEqual(leftHandItems.sort(), rightHandItems.sort(), options);
  }
  __name(entriesEqual, "entriesEqual");
  function iterableEqual(leftHandOperand, rightHandOperand, options) {
    var length = leftHandOperand.length;
    if (length !== rightHandOperand.length) {
      return false;
    }
    if (length === 0) {
      return true;
    }
    var index = -1;
    while (++index < length) {
      if (deepEqual(leftHandOperand[index], rightHandOperand[index], options) === false) {
        return false;
      }
    }
    return true;
  }
  __name(iterableEqual, "iterableEqual");
  function generatorEqual(leftHandOperand, rightHandOperand, options) {
    return iterableEqual(getGeneratorEntries(leftHandOperand), getGeneratorEntries(rightHandOperand), options);
  }
  __name(generatorEqual, "generatorEqual");
  function hasIteratorFunction(target) {
    return typeof Symbol !== "undefined" && typeof target === "object" && typeof Symbol.iterator !== "undefined" && typeof target[Symbol.iterator] === "function";
  }
  __name(hasIteratorFunction, "hasIteratorFunction");
  function getIteratorEntries(target) {
    if (hasIteratorFunction(target)) {
      try {
        return getGeneratorEntries(target[Symbol.iterator]());
      } catch (iteratorError) {
        return [];
      }
    }
    return [];
  }
  __name(getIteratorEntries, "getIteratorEntries");
  function getGeneratorEntries(generator) {
    var generatorResult = generator.next();
    var accumulator = [generatorResult.value];
    while (generatorResult.done === false) {
      generatorResult = generator.next();
      accumulator.push(generatorResult.value);
    }
    return accumulator;
  }
  __name(getGeneratorEntries, "getGeneratorEntries");
  function getEnumerableKeys(target) {
    var keys = [];
    for (var key in target) {
      keys.push(key);
    }
    return keys;
  }
  __name(getEnumerableKeys, "getEnumerableKeys");
  function getEnumerableSymbols(target) {
    var keys = [];
    var allKeys = Object.getOwnPropertySymbols(target);
    for (var i = 0; i < allKeys.length; i += 1) {
      var key = allKeys[i];
      if (Object.getOwnPropertyDescriptor(target, key).enumerable) {
        keys.push(key);
      }
    }
    return keys;
  }
  __name(getEnumerableSymbols, "getEnumerableSymbols");
  function keysEqual(leftHandOperand, rightHandOperand, keys, options) {
    var length = keys.length;
    if (length === 0) {
      return true;
    }
    for (var i = 0; i < length; i += 1) {
      if (deepEqual(leftHandOperand[keys[i]], rightHandOperand[keys[i]], options) === false) {
        return false;
      }
    }
    return true;
  }
  __name(keysEqual, "keysEqual");
  function objectEqual(leftHandOperand, rightHandOperand, options) {
    var leftHandKeys = getEnumerableKeys(leftHandOperand);
    var rightHandKeys = getEnumerableKeys(rightHandOperand);
    var leftHandSymbols = getEnumerableSymbols(leftHandOperand);
    var rightHandSymbols = getEnumerableSymbols(rightHandOperand);
    leftHandKeys = leftHandKeys.concat(leftHandSymbols);
    rightHandKeys = rightHandKeys.concat(rightHandSymbols);
    if (leftHandKeys.length && leftHandKeys.length === rightHandKeys.length) {
      if (iterableEqual(mapSymbols(leftHandKeys).sort(), mapSymbols(rightHandKeys).sort()) === false) {
        return false;
      }
      return keysEqual(leftHandOperand, rightHandOperand, leftHandKeys, options);
    }
    var leftHandEntries = getIteratorEntries(leftHandOperand);
    var rightHandEntries = getIteratorEntries(rightHandOperand);
    if (leftHandEntries.length && leftHandEntries.length === rightHandEntries.length) {
      leftHandEntries.sort();
      rightHandEntries.sort();
      return iterableEqual(leftHandEntries, rightHandEntries, options);
    }
    if (leftHandKeys.length === 0 && leftHandEntries.length === 0 && rightHandKeys.length === 0 && rightHandEntries.length === 0) {
      return true;
    }
    return false;
  }
  __name(objectEqual, "objectEqual");
  function isPrimitive(value) {
    return value === null || typeof value !== "object";
  }
  __name(isPrimitive, "isPrimitive");
  function mapSymbols(arr) {
    return arr.map(/* @__PURE__ */ __name(function mapSymbol(entry) {
      if (typeof entry === "symbol") {
        return entry.toString();
      }
      return entry;
    }, "mapSymbol"));
  }
  __name(mapSymbols, "mapSymbols");

  // node_modules/pathval/index.js
  function hasProperty(obj, name) {
    if (typeof obj === "undefined" || obj === null) {
      return false;
    }
    return name in Object(obj);
  }
  __name(hasProperty, "hasProperty");
  function parsePath(path) {
    const str = path.replace(/([^\\])\[/g, "$1.[");
    const parts = str.match(/(\\\.|[^.]+?)+/g);
    return parts.map((value) => {
      if (value === "constructor" || value === "__proto__" || value === "prototype") {
        return {};
      }
      const regexp = /^\[(\d+)\]$/;
      const mArr = regexp.exec(value);
      let parsed = null;
      if (mArr) {
        parsed = { i: parseFloat(mArr[1]) };
      } else {
        parsed = { p: value.replace(/\\([.[\]])/g, "$1") };
      }
      return parsed;
    });
  }
  __name(parsePath, "parsePath");
  function internalGetPathValue(obj, parsed, pathDepth) {
    let temporaryValue = obj;
    let res = null;
    pathDepth = typeof pathDepth === "undefined" ? parsed.length : pathDepth;
    for (let i = 0; i < pathDepth; i++) {
      const part = parsed[i];
      if (temporaryValue) {
        if (typeof part.p === "undefined") {
          temporaryValue = temporaryValue[part.i];
        } else {
          temporaryValue = temporaryValue[part.p];
        }
        if (i === pathDepth - 1) {
          res = temporaryValue;
        }
      }
    }
    return res;
  }
  __name(internalGetPathValue, "internalGetPathValue");
  function getPathInfo(obj, path) {
    const parsed = parsePath(path);
    const last = parsed[parsed.length - 1];
    const info = {
      parent: parsed.length > 1 ? internalGetPathValue(obj, parsed, parsed.length - 1) : obj,
      name: last.p || last.i,
      value: internalGetPathValue(obj, parsed)
    };
    info.exists = hasProperty(info.parent, info.name);
    return info;
  }
  __name(getPathInfo, "getPathInfo");

  // lib/chai/assertion.js
  function Assertion(obj, msg, ssfi, lockSsfi) {
    flag(this, "ssfi", ssfi || Assertion);
    flag(this, "lockSsfi", lockSsfi);
    flag(this, "object", obj);
    flag(this, "message", msg);
    flag(this, "eql", config.deepEqual || deep_eql_default);
    return proxify(this);
  }
  __name(Assertion, "Assertion");
  Object.defineProperty(Assertion, "includeStack", {
    get: function() {
      console.warn("Assertion.includeStack is deprecated, use chai.config.includeStack instead.");
      return config.includeStack;
    },
    set: function(value) {
      console.warn("Assertion.includeStack is deprecated, use chai.config.includeStack instead.");
      config.includeStack = value;
    }
  });
  Object.defineProperty(Assertion, "showDiff", {
    get: function() {
      console.warn("Assertion.showDiff is deprecated, use chai.config.showDiff instead.");
      return config.showDiff;
    },
    set: function(value) {
      console.warn("Assertion.showDiff is deprecated, use chai.config.showDiff instead.");
      config.showDiff = value;
    }
  });
  Assertion.addProperty = function(name, fn) {
    addProperty(this.prototype, name, fn);
  };
  Assertion.addMethod = function(name, fn) {
    addMethod(this.prototype, name, fn);
  };
  Assertion.addChainableMethod = function(name, fn, chainingBehavior) {
    addChainableMethod(this.prototype, name, fn, chainingBehavior);
  };
  Assertion.overwriteProperty = function(name, fn) {
    overwriteProperty(this.prototype, name, fn);
  };
  Assertion.overwriteMethod = function(name, fn) {
    overwriteMethod(this.prototype, name, fn);
  };
  Assertion.overwriteChainableMethod = function(name, fn, chainingBehavior) {
    overwriteChainableMethod(this.prototype, name, fn, chainingBehavior);
  };
  Assertion.prototype.assert = function(expr, msg, negateMsg, expected, _actual, showDiff) {
    var ok = test(this, arguments);
    if (false !== showDiff)
      showDiff = true;
    if (void 0 === expected && void 0 === _actual)
      showDiff = false;
    if (true !== config.showDiff)
      showDiff = false;
    if (!ok) {
      msg = getMessage2(this, arguments);
      var actual = getActual(this, arguments);
      var assertionErrorObjectProperties = {
        actual,
        expected,
        showDiff
      };
      var operator = getOperator(this, arguments);
      if (operator) {
        assertionErrorObjectProperties.operator = operator;
      }
      throw new AssertionError(
        msg,
        assertionErrorObjectProperties,
        config.includeStack ? this.assert : flag(this, "ssfi")
      );
    }
  };
  Object.defineProperty(
    Assertion.prototype,
    "_obj",
    {
      get: function() {
        return flag(this, "object");
      },
      set: function(val) {
        flag(this, "object", val);
      }
    }
  );

  // lib/chai/utils/isProxyEnabled.js
  function isProxyEnabled() {
    return config.useProxy && typeof Proxy !== "undefined" && typeof Reflect !== "undefined";
  }
  __name(isProxyEnabled, "isProxyEnabled");

  // lib/chai/utils/addProperty.js
  function addProperty(ctx, name, getter) {
    getter = getter === void 0 ? function() {
    } : getter;
    Object.defineProperty(
      ctx,
      name,
      {
        get: /* @__PURE__ */ __name(function propertyGetter() {
          if (!isProxyEnabled() && !flag(this, "lockSsfi")) {
            flag(this, "ssfi", propertyGetter);
          }
          var result = getter.call(this);
          if (result !== void 0)
            return result;
          var newAssertion = new Assertion();
          transferFlags(this, newAssertion);
          return newAssertion;
        }, "propertyGetter"),
        configurable: true
      }
    );
  }
  __name(addProperty, "addProperty");

  // lib/chai/utils/addLengthGuard.js
  var fnLengthDesc = Object.getOwnPropertyDescriptor(function() {
  }, "length");
  function addLengthGuard(fn, assertionName, isChainable) {
    if (!fnLengthDesc.configurable)
      return fn;
    Object.defineProperty(fn, "length", {
      get: function() {
        if (isChainable) {
          throw Error("Invalid Chai property: " + assertionName + '.length. Due to a compatibility issue, "length" cannot directly follow "' + assertionName + '". Use "' + assertionName + '.lengthOf" instead.');
        }
        throw Error("Invalid Chai property: " + assertionName + '.length. See docs for proper usage of "' + assertionName + '".');
      }
    });
    return fn;
  }
  __name(addLengthGuard, "addLengthGuard");

  // lib/chai/utils/getProperties.js
  function getProperties(object) {
    var result = Object.getOwnPropertyNames(object);
    function addProperty2(property) {
      if (result.indexOf(property) === -1) {
        result.push(property);
      }
    }
    __name(addProperty2, "addProperty");
    var proto = Object.getPrototypeOf(object);
    while (proto !== null) {
      Object.getOwnPropertyNames(proto).forEach(addProperty2);
      proto = Object.getPrototypeOf(proto);
    }
    return result;
  }
  __name(getProperties, "getProperties");

  // lib/chai/utils/proxify.js
  var builtins = ["__flags", "__methods", "_obj", "assert"];
  function proxify(obj, nonChainableMethodName) {
    if (!isProxyEnabled())
      return obj;
    return new Proxy(obj, {
      get: /* @__PURE__ */ __name(function proxyGetter(target, property) {
        if (typeof property === "string" && config.proxyExcludedKeys.indexOf(property) === -1 && !Reflect.has(target, property)) {
          if (nonChainableMethodName) {
            throw Error("Invalid Chai property: " + nonChainableMethodName + "." + property + '. See docs for proper usage of "' + nonChainableMethodName + '".');
          }
          var suggestion = null;
          var suggestionDistance = 4;
          getProperties(target).forEach(function(prop) {
            if (!Object.prototype.hasOwnProperty(prop) && builtins.indexOf(prop) === -1) {
              var dist = stringDistanceCapped(
                property,
                prop,
                suggestionDistance
              );
              if (dist < suggestionDistance) {
                suggestion = prop;
                suggestionDistance = dist;
              }
            }
          });
          if (suggestion !== null) {
            throw Error("Invalid Chai property: " + property + '. Did you mean "' + suggestion + '"?');
          } else {
            throw Error("Invalid Chai property: " + property);
          }
        }
        if (builtins.indexOf(property) === -1 && !flag(target, "lockSsfi")) {
          flag(target, "ssfi", proxyGetter);
        }
        return Reflect.get(target, property);
      }, "proxyGetter")
    });
  }
  __name(proxify, "proxify");
  function stringDistanceCapped(strA, strB, cap) {
    if (Math.abs(strA.length - strB.length) >= cap) {
      return cap;
    }
    var memo = [];
    for (var i = 0; i <= strA.length; i++) {
      memo[i] = Array(strB.length + 1).fill(0);
      memo[i][0] = i;
    }
    for (var j = 0; j < strB.length; j++) {
      memo[0][j] = j;
    }
    for (var i = 1; i <= strA.length; i++) {
      var ch = strA.charCodeAt(i - 1);
      for (var j = 1; j <= strB.length; j++) {
        if (Math.abs(i - j) >= cap) {
          memo[i][j] = cap;
          continue;
        }
        memo[i][j] = Math.min(
          memo[i - 1][j] + 1,
          memo[i][j - 1] + 1,
          memo[i - 1][j - 1] + (ch === strB.charCodeAt(j - 1) ? 0 : 1)
        );
      }
    }
    return memo[strA.length][strB.length];
  }
  __name(stringDistanceCapped, "stringDistanceCapped");

  // lib/chai/utils/addMethod.js
  function addMethod(ctx, name, method) {
    var methodWrapper = /* @__PURE__ */ __name(function() {
      if (!flag(this, "lockSsfi")) {
        flag(this, "ssfi", methodWrapper);
      }
      var result = method.apply(this, arguments);
      if (result !== void 0)
        return result;
      var newAssertion = new Assertion();
      transferFlags(this, newAssertion);
      return newAssertion;
    }, "methodWrapper");
    addLengthGuard(methodWrapper, name, false);
    ctx[name] = proxify(methodWrapper, name);
  }
  __name(addMethod, "addMethod");

  // lib/chai/utils/overwriteProperty.js
  function overwriteProperty(ctx, name, getter) {
    var _get = Object.getOwnPropertyDescriptor(ctx, name), _super = /* @__PURE__ */ __name(function() {
    }, "_super");
    if (_get && "function" === typeof _get.get)
      _super = _get.get;
    Object.defineProperty(
      ctx,
      name,
      {
        get: /* @__PURE__ */ __name(function overwritingPropertyGetter() {
          if (!isProxyEnabled() && !flag(this, "lockSsfi")) {
            flag(this, "ssfi", overwritingPropertyGetter);
          }
          var origLockSsfi = flag(this, "lockSsfi");
          flag(this, "lockSsfi", true);
          var result = getter(_super).call(this);
          flag(this, "lockSsfi", origLockSsfi);
          if (result !== void 0) {
            return result;
          }
          var newAssertion = new Assertion();
          transferFlags(this, newAssertion);
          return newAssertion;
        }, "overwritingPropertyGetter"),
        configurable: true
      }
    );
  }
  __name(overwriteProperty, "overwriteProperty");

  // lib/chai/utils/overwriteMethod.js
  function overwriteMethod(ctx, name, method) {
    var _method = ctx[name], _super = /* @__PURE__ */ __name(function() {
      throw new Error(name + " is not a function");
    }, "_super");
    if (_method && "function" === typeof _method)
      _super = _method;
    var overwritingMethodWrapper = /* @__PURE__ */ __name(function() {
      if (!flag(this, "lockSsfi")) {
        flag(this, "ssfi", overwritingMethodWrapper);
      }
      var origLockSsfi = flag(this, "lockSsfi");
      flag(this, "lockSsfi", true);
      var result = method(_super).apply(this, arguments);
      flag(this, "lockSsfi", origLockSsfi);
      if (result !== void 0) {
        return result;
      }
      var newAssertion = new Assertion();
      transferFlags(this, newAssertion);
      return newAssertion;
    }, "overwritingMethodWrapper");
    addLengthGuard(overwritingMethodWrapper, name, false);
    ctx[name] = proxify(overwritingMethodWrapper, name);
  }
  __name(overwriteMethod, "overwriteMethod");

  // lib/chai/utils/addChainableMethod.js
  var canSetPrototype = typeof Object.setPrototypeOf === "function";
  var testFn = /* @__PURE__ */ __name(function() {
  }, "testFn");
  var excludeNames = Object.getOwnPropertyNames(testFn).filter(function(name) {
    var propDesc = Object.getOwnPropertyDescriptor(testFn, name);
    if (typeof propDesc !== "object")
      return true;
    return !propDesc.configurable;
  });
  var call = Function.prototype.call;
  var apply = Function.prototype.apply;
  function addChainableMethod(ctx, name, method, chainingBehavior) {
    if (typeof chainingBehavior !== "function") {
      chainingBehavior = /* @__PURE__ */ __name(function() {
      }, "chainingBehavior");
    }
    var chainableBehavior = {
      method,
      chainingBehavior
    };
    if (!ctx.__methods) {
      ctx.__methods = {};
    }
    ctx.__methods[name] = chainableBehavior;
    Object.defineProperty(
      ctx,
      name,
      {
        get: /* @__PURE__ */ __name(function chainableMethodGetter() {
          chainableBehavior.chainingBehavior.call(this);
          var chainableMethodWrapper = /* @__PURE__ */ __name(function() {
            if (!flag(this, "lockSsfi")) {
              flag(this, "ssfi", chainableMethodWrapper);
            }
            var result = chainableBehavior.method.apply(this, arguments);
            if (result !== void 0) {
              return result;
            }
            var newAssertion = new Assertion();
            transferFlags(this, newAssertion);
            return newAssertion;
          }, "chainableMethodWrapper");
          addLengthGuard(chainableMethodWrapper, name, true);
          if (canSetPrototype) {
            var prototype = Object.create(this);
            prototype.call = call;
            prototype.apply = apply;
            Object.setPrototypeOf(chainableMethodWrapper, prototype);
          } else {
            var asserterNames = Object.getOwnPropertyNames(ctx);
            asserterNames.forEach(function(asserterName) {
              if (excludeNames.indexOf(asserterName) !== -1) {
                return;
              }
              var pd = Object.getOwnPropertyDescriptor(ctx, asserterName);
              Object.defineProperty(chainableMethodWrapper, asserterName, pd);
            });
          }
          transferFlags(this, chainableMethodWrapper);
          return proxify(chainableMethodWrapper);
        }, "chainableMethodGetter"),
        configurable: true
      }
    );
  }
  __name(addChainableMethod, "addChainableMethod");

  // lib/chai/utils/overwriteChainableMethod.js
  function overwriteChainableMethod(ctx, name, method, chainingBehavior) {
    var chainableBehavior = ctx.__methods[name];
    var _chainingBehavior = chainableBehavior.chainingBehavior;
    chainableBehavior.chainingBehavior = /* @__PURE__ */ __name(function overwritingChainableMethodGetter() {
      var result = chainingBehavior(_chainingBehavior).call(this);
      if (result !== void 0) {
        return result;
      }
      var newAssertion = new Assertion();
      transferFlags(this, newAssertion);
      return newAssertion;
    }, "overwritingChainableMethodGetter");
    var _method = chainableBehavior.method;
    chainableBehavior.method = /* @__PURE__ */ __name(function overwritingChainableMethodWrapper() {
      var result = method(_method).apply(this, arguments);
      if (result !== void 0) {
        return result;
      }
      var newAssertion = new Assertion();
      transferFlags(this, newAssertion);
      return newAssertion;
    }, "overwritingChainableMethodWrapper");
  }
  __name(overwriteChainableMethod, "overwriteChainableMethod");

  // lib/chai/utils/compareByInspect.js
  function compareByInspect(a, b) {
    return inspect2(a) < inspect2(b) ? -1 : 1;
  }
  __name(compareByInspect, "compareByInspect");

  // lib/chai/utils/getOwnEnumerablePropertySymbols.js
  function getOwnEnumerablePropertySymbols(obj) {
    if (typeof Object.getOwnPropertySymbols !== "function")
      return [];
    return Object.getOwnPropertySymbols(obj).filter(function(sym) {
      return Object.getOwnPropertyDescriptor(obj, sym).enumerable;
    });
  }
  __name(getOwnEnumerablePropertySymbols, "getOwnEnumerablePropertySymbols");

  // lib/chai/utils/getOwnEnumerableProperties.js
  function getOwnEnumerableProperties(obj) {
    return Object.keys(obj).concat(getOwnEnumerablePropertySymbols(obj));
  }
  __name(getOwnEnumerableProperties, "getOwnEnumerableProperties");

  // lib/chai/utils/isNaN.js
  function _isNaN(value) {
    return value !== value;
  }
  __name(_isNaN, "_isNaN");
  var isNaN2 = Number.isNaN || _isNaN;

  // lib/chai/utils/getOperator.js
  function isObjectType(obj) {
    var objectType = type(obj);
    var objectTypes = ["Array", "Object", "Function"];
    return objectTypes.indexOf(objectType) !== -1;
  }
  __name(isObjectType, "isObjectType");
  function getOperator(obj, args) {
    var operator = flag(obj, "operator");
    var negate = flag(obj, "negate");
    var expected = args[3];
    var msg = negate ? args[2] : args[1];
    if (operator) {
      return operator;
    }
    if (typeof msg === "function")
      msg = msg();
    msg = msg || "";
    if (!msg) {
      return void 0;
    }
    if (/\shave\s/.test(msg)) {
      return void 0;
    }
    var isObject = isObjectType(expected);
    if (/\snot\s/.test(msg)) {
      return isObject ? "notDeepStrictEqual" : "notStrictEqual";
    }
    return isObject ? "deepStrictEqual" : "strictEqual";
  }
  __name(getOperator, "getOperator");

  // lib/chai/utils/index.js
  function getName(fn) {
    return fn.name;
  }
  __name(getName, "getName");

  // lib/chai/core/assertions.js
  var { flag: flag2 } = utils_exports;
  [
    "to",
    "be",
    "been",
    "is",
    "and",
    "has",
    "have",
    "with",
    "that",
    "which",
    "at",
    "of",
    "same",
    "but",
    "does",
    "still",
    "also"
  ].forEach(function(chain) {
    Assertion.addProperty(chain);
  });
  Assertion.addProperty("not", function() {
    flag2(this, "negate", true);
  });
  Assertion.addProperty("deep", function() {
    flag2(this, "deep", true);
  });
  Assertion.addProperty("nested", function() {
    flag2(this, "nested", true);
  });
  Assertion.addProperty("own", function() {
    flag2(this, "own", true);
  });
  Assertion.addProperty("ordered", function() {
    flag2(this, "ordered", true);
  });
  Assertion.addProperty("any", function() {
    flag2(this, "any", true);
    flag2(this, "all", false);
  });
  Assertion.addProperty("all", function() {
    flag2(this, "all", true);
    flag2(this, "any", false);
  });
  var functionTypes = {
    "function": ["function", "asyncfunction", "generatorfunction", "asyncgeneratorfunction"],
    "asyncfunction": ["asyncfunction", "asyncgeneratorfunction"],
    "generatorfunction": ["generatorfunction", "asyncgeneratorfunction"],
    "asyncgeneratorfunction": ["asyncgeneratorfunction"]
  };
  function an(type3, msg) {
    if (msg)
      flag2(this, "message", msg);
    type3 = type3.toLowerCase();
    var obj = flag2(this, "object"), article = ~["a", "e", "i", "o", "u"].indexOf(type3.charAt(0)) ? "an " : "a ";
    const detectedType = type(obj).toLowerCase();
    if (functionTypes["function"].includes(type3)) {
      this.assert(
        functionTypes[type3].includes(detectedType),
        "expected #{this} to be " + article + type3,
        "expected #{this} not to be " + article + type3
      );
    } else {
      this.assert(
        type3 === detectedType,
        "expected #{this} to be " + article + type3,
        "expected #{this} not to be " + article + type3
      );
    }
  }
  __name(an, "an");
  Assertion.addChainableMethod("an", an);
  Assertion.addChainableMethod("a", an);
  function SameValueZero(a, b) {
    return isNaN2(a) && isNaN2(b) || a === b;
  }
  __name(SameValueZero, "SameValueZero");
  function includeChainingBehavior() {
    flag2(this, "contains", true);
  }
  __name(includeChainingBehavior, "includeChainingBehavior");
  function include(val, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), objType = type(obj).toLowerCase(), flagMsg = flag2(this, "message"), negate = flag2(this, "negate"), ssfi = flag2(this, "ssfi"), isDeep = flag2(this, "deep"), descriptor = isDeep ? "deep " : "", isEql = isDeep ? flag2(this, "eql") : SameValueZero;
    flagMsg = flagMsg ? flagMsg + ": " : "";
    var included = false;
    switch (objType) {
      case "string":
        included = obj.indexOf(val) !== -1;
        break;
      case "weakset":
        if (isDeep) {
          throw new AssertionError(
            flagMsg + "unable to use .deep.include with WeakSet",
            void 0,
            ssfi
          );
        }
        included = obj.has(val);
        break;
      case "map":
        obj.forEach(function(item) {
          included = included || isEql(item, val);
        });
        break;
      case "set":
        if (isDeep) {
          obj.forEach(function(item) {
            included = included || isEql(item, val);
          });
        } else {
          included = obj.has(val);
        }
        break;
      case "array":
        if (isDeep) {
          included = obj.some(function(item) {
            return isEql(item, val);
          });
        } else {
          included = obj.indexOf(val) !== -1;
        }
        break;
      default:
        if (val !== Object(val)) {
          throw new AssertionError(
            flagMsg + "the given combination of arguments (" + objType + " and " + type(val).toLowerCase() + ") is invalid for this assertion. You can use an array, a map, an object, a set, a string, or a weakset instead of a " + type(val).toLowerCase(),
            void 0,
            ssfi
          );
        }
        var props = Object.keys(val), firstErr = null, numErrs = 0;
        props.forEach(function(prop) {
          var propAssertion = new Assertion(obj);
          transferFlags(this, propAssertion, true);
          flag2(propAssertion, "lockSsfi", true);
          if (!negate || props.length === 1) {
            propAssertion.property(prop, val[prop]);
            return;
          }
          try {
            propAssertion.property(prop, val[prop]);
          } catch (err) {
            if (!check_error_exports.compatibleConstructor(err, AssertionError)) {
              throw err;
            }
            if (firstErr === null)
              firstErr = err;
            numErrs++;
          }
        }, this);
        if (negate && props.length > 1 && numErrs === props.length) {
          throw firstErr;
        }
        return;
    }
    this.assert(
      included,
      "expected #{this} to " + descriptor + "include " + inspect2(val),
      "expected #{this} to not " + descriptor + "include " + inspect2(val)
    );
  }
  __name(include, "include");
  Assertion.addChainableMethod("include", include, includeChainingBehavior);
  Assertion.addChainableMethod("contain", include, includeChainingBehavior);
  Assertion.addChainableMethod("contains", include, includeChainingBehavior);
  Assertion.addChainableMethod("includes", include, includeChainingBehavior);
  Assertion.addProperty("ok", function() {
    this.assert(
      flag2(this, "object"),
      "expected #{this} to be truthy",
      "expected #{this} to be falsy"
    );
  });
  Assertion.addProperty("true", function() {
    this.assert(
      true === flag2(this, "object"),
      "expected #{this} to be true",
      "expected #{this} to be false",
      flag2(this, "negate") ? false : true
    );
  });
  Assertion.addProperty("callable", function() {
    const val = flag2(this, "object");
    const ssfi = flag2(this, "ssfi");
    const message = flag2(this, "message");
    const msg = message ? `${message}: ` : "";
    const negate = flag2(this, "negate");
    const assertionMessage = negate ? `${msg}expected ${inspect2(val)} not to be a callable function` : `${msg}expected ${inspect2(val)} to be a callable function`;
    const isCallable = ["Function", "AsyncFunction", "GeneratorFunction", "AsyncGeneratorFunction"].includes(type(val));
    if (isCallable && negate || !isCallable && !negate) {
      throw new AssertionError(
        assertionMessage,
        void 0,
        ssfi
      );
    }
  });
  Assertion.addProperty("false", function() {
    this.assert(
      false === flag2(this, "object"),
      "expected #{this} to be false",
      "expected #{this} to be true",
      flag2(this, "negate") ? true : false
    );
  });
  Assertion.addProperty("null", function() {
    this.assert(
      null === flag2(this, "object"),
      "expected #{this} to be null",
      "expected #{this} not to be null"
    );
  });
  Assertion.addProperty("undefined", function() {
    this.assert(
      void 0 === flag2(this, "object"),
      "expected #{this} to be undefined",
      "expected #{this} not to be undefined"
    );
  });
  Assertion.addProperty("NaN", function() {
    this.assert(
      isNaN2(flag2(this, "object")),
      "expected #{this} to be NaN",
      "expected #{this} not to be NaN"
    );
  });
  function assertExist() {
    var val = flag2(this, "object");
    this.assert(
      val !== null && val !== void 0,
      "expected #{this} to exist",
      "expected #{this} to not exist"
    );
  }
  __name(assertExist, "assertExist");
  Assertion.addProperty("exist", assertExist);
  Assertion.addProperty("exists", assertExist);
  Assertion.addProperty("empty", function() {
    var val = flag2(this, "object"), ssfi = flag2(this, "ssfi"), flagMsg = flag2(this, "message"), itemsCount;
    flagMsg = flagMsg ? flagMsg + ": " : "";
    switch (type(val).toLowerCase()) {
      case "array":
      case "string":
        itemsCount = val.length;
        break;
      case "map":
      case "set":
        itemsCount = val.size;
        break;
      case "weakmap":
      case "weakset":
        throw new AssertionError(
          flagMsg + ".empty was passed a weak collection",
          void 0,
          ssfi
        );
      case "function":
        var msg = flagMsg + ".empty was passed a function " + getName(val);
        throw new AssertionError(msg.trim(), void 0, ssfi);
      default:
        if (val !== Object(val)) {
          throw new AssertionError(
            flagMsg + ".empty was passed non-string primitive " + inspect2(val),
            void 0,
            ssfi
          );
        }
        itemsCount = Object.keys(val).length;
    }
    this.assert(
      0 === itemsCount,
      "expected #{this} to be empty",
      "expected #{this} not to be empty"
    );
  });
  function checkArguments() {
    var obj = flag2(this, "object"), type3 = type(obj);
    this.assert(
      "Arguments" === type3,
      "expected #{this} to be arguments but got " + type3,
      "expected #{this} to not be arguments"
    );
  }
  __name(checkArguments, "checkArguments");
  Assertion.addProperty("arguments", checkArguments);
  Assertion.addProperty("Arguments", checkArguments);
  function assertEqual(val, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object");
    if (flag2(this, "deep")) {
      var prevLockSsfi = flag2(this, "lockSsfi");
      flag2(this, "lockSsfi", true);
      this.eql(val);
      flag2(this, "lockSsfi", prevLockSsfi);
    } else {
      this.assert(
        val === obj,
        "expected #{this} to equal #{exp}",
        "expected #{this} to not equal #{exp}",
        val,
        this._obj,
        true
      );
    }
  }
  __name(assertEqual, "assertEqual");
  Assertion.addMethod("equal", assertEqual);
  Assertion.addMethod("equals", assertEqual);
  Assertion.addMethod("eq", assertEqual);
  function assertEql(obj, msg) {
    if (msg)
      flag2(this, "message", msg);
    var eql = flag2(this, "eql");
    this.assert(
      eql(obj, flag2(this, "object")),
      "expected #{this} to deeply equal #{exp}",
      "expected #{this} to not deeply equal #{exp}",
      obj,
      this._obj,
      true
    );
  }
  __name(assertEql, "assertEql");
  Assertion.addMethod("eql", assertEql);
  Assertion.addMethod("eqls", assertEql);
  function assertAbove(n, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), doLength = flag2(this, "doLength"), flagMsg = flag2(this, "message"), msgPrefix = flagMsg ? flagMsg + ": " : "", ssfi = flag2(this, "ssfi"), objType = type(obj).toLowerCase(), nType = type(n).toLowerCase(), errorMessage, shouldThrow = true;
    if (doLength && objType !== "map" && objType !== "set") {
      new Assertion(obj, flagMsg, ssfi, true).to.have.property("length");
    }
    if (!doLength && (objType === "date" && nType !== "date")) {
      errorMessage = msgPrefix + "the argument to above must be a date";
    } else if (nType !== "number" && (doLength || objType === "number")) {
      errorMessage = msgPrefix + "the argument to above must be a number";
    } else if (!doLength && (objType !== "date" && objType !== "number")) {
      var printObj = objType === "string" ? "'" + obj + "'" : obj;
      errorMessage = msgPrefix + "expected " + printObj + " to be a number or a date";
    } else {
      shouldThrow = false;
    }
    if (shouldThrow) {
      throw new AssertionError(errorMessage, void 0, ssfi);
    }
    if (doLength) {
      var descriptor = "length", itemsCount;
      if (objType === "map" || objType === "set") {
        descriptor = "size";
        itemsCount = obj.size;
      } else {
        itemsCount = obj.length;
      }
      this.assert(
        itemsCount > n,
        "expected #{this} to have a " + descriptor + " above #{exp} but got #{act}",
        "expected #{this} to not have a " + descriptor + " above #{exp}",
        n,
        itemsCount
      );
    } else {
      this.assert(
        obj > n,
        "expected #{this} to be above #{exp}",
        "expected #{this} to be at most #{exp}",
        n
      );
    }
  }
  __name(assertAbove, "assertAbove");
  Assertion.addMethod("above", assertAbove);
  Assertion.addMethod("gt", assertAbove);
  Assertion.addMethod("greaterThan", assertAbove);
  function assertLeast(n, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), doLength = flag2(this, "doLength"), flagMsg = flag2(this, "message"), msgPrefix = flagMsg ? flagMsg + ": " : "", ssfi = flag2(this, "ssfi"), objType = type(obj).toLowerCase(), nType = type(n).toLowerCase(), errorMessage, shouldThrow = true;
    if (doLength && objType !== "map" && objType !== "set") {
      new Assertion(obj, flagMsg, ssfi, true).to.have.property("length");
    }
    if (!doLength && (objType === "date" && nType !== "date")) {
      errorMessage = msgPrefix + "the argument to least must be a date";
    } else if (nType !== "number" && (doLength || objType === "number")) {
      errorMessage = msgPrefix + "the argument to least must be a number";
    } else if (!doLength && (objType !== "date" && objType !== "number")) {
      var printObj = objType === "string" ? "'" + obj + "'" : obj;
      errorMessage = msgPrefix + "expected " + printObj + " to be a number or a date";
    } else {
      shouldThrow = false;
    }
    if (shouldThrow) {
      throw new AssertionError(errorMessage, void 0, ssfi);
    }
    if (doLength) {
      var descriptor = "length", itemsCount;
      if (objType === "map" || objType === "set") {
        descriptor = "size";
        itemsCount = obj.size;
      } else {
        itemsCount = obj.length;
      }
      this.assert(
        itemsCount >= n,
        "expected #{this} to have a " + descriptor + " at least #{exp} but got #{act}",
        "expected #{this} to have a " + descriptor + " below #{exp}",
        n,
        itemsCount
      );
    } else {
      this.assert(
        obj >= n,
        "expected #{this} to be at least #{exp}",
        "expected #{this} to be below #{exp}",
        n
      );
    }
  }
  __name(assertLeast, "assertLeast");
  Assertion.addMethod("least", assertLeast);
  Assertion.addMethod("gte", assertLeast);
  Assertion.addMethod("greaterThanOrEqual", assertLeast);
  function assertBelow(n, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), doLength = flag2(this, "doLength"), flagMsg = flag2(this, "message"), msgPrefix = flagMsg ? flagMsg + ": " : "", ssfi = flag2(this, "ssfi"), objType = type(obj).toLowerCase(), nType = type(n).toLowerCase(), errorMessage, shouldThrow = true;
    if (doLength && objType !== "map" && objType !== "set") {
      new Assertion(obj, flagMsg, ssfi, true).to.have.property("length");
    }
    if (!doLength && (objType === "date" && nType !== "date")) {
      errorMessage = msgPrefix + "the argument to below must be a date";
    } else if (nType !== "number" && (doLength || objType === "number")) {
      errorMessage = msgPrefix + "the argument to below must be a number";
    } else if (!doLength && (objType !== "date" && objType !== "number")) {
      var printObj = objType === "string" ? "'" + obj + "'" : obj;
      errorMessage = msgPrefix + "expected " + printObj + " to be a number or a date";
    } else {
      shouldThrow = false;
    }
    if (shouldThrow) {
      throw new AssertionError(errorMessage, void 0, ssfi);
    }
    if (doLength) {
      var descriptor = "length", itemsCount;
      if (objType === "map" || objType === "set") {
        descriptor = "size";
        itemsCount = obj.size;
      } else {
        itemsCount = obj.length;
      }
      this.assert(
        itemsCount < n,
        "expected #{this} to have a " + descriptor + " below #{exp} but got #{act}",
        "expected #{this} to not have a " + descriptor + " below #{exp}",
        n,
        itemsCount
      );
    } else {
      this.assert(
        obj < n,
        "expected #{this} to be below #{exp}",
        "expected #{this} to be at least #{exp}",
        n
      );
    }
  }
  __name(assertBelow, "assertBelow");
  Assertion.addMethod("below", assertBelow);
  Assertion.addMethod("lt", assertBelow);
  Assertion.addMethod("lessThan", assertBelow);
  function assertMost(n, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), doLength = flag2(this, "doLength"), flagMsg = flag2(this, "message"), msgPrefix = flagMsg ? flagMsg + ": " : "", ssfi = flag2(this, "ssfi"), objType = type(obj).toLowerCase(), nType = type(n).toLowerCase(), errorMessage, shouldThrow = true;
    if (doLength && objType !== "map" && objType !== "set") {
      new Assertion(obj, flagMsg, ssfi, true).to.have.property("length");
    }
    if (!doLength && (objType === "date" && nType !== "date")) {
      errorMessage = msgPrefix + "the argument to most must be a date";
    } else if (nType !== "number" && (doLength || objType === "number")) {
      errorMessage = msgPrefix + "the argument to most must be a number";
    } else if (!doLength && (objType !== "date" && objType !== "number")) {
      var printObj = objType === "string" ? "'" + obj + "'" : obj;
      errorMessage = msgPrefix + "expected " + printObj + " to be a number or a date";
    } else {
      shouldThrow = false;
    }
    if (shouldThrow) {
      throw new AssertionError(errorMessage, void 0, ssfi);
    }
    if (doLength) {
      var descriptor = "length", itemsCount;
      if (objType === "map" || objType === "set") {
        descriptor = "size";
        itemsCount = obj.size;
      } else {
        itemsCount = obj.length;
      }
      this.assert(
        itemsCount <= n,
        "expected #{this} to have a " + descriptor + " at most #{exp} but got #{act}",
        "expected #{this} to have a " + descriptor + " above #{exp}",
        n,
        itemsCount
      );
    } else {
      this.assert(
        obj <= n,
        "expected #{this} to be at most #{exp}",
        "expected #{this} to be above #{exp}",
        n
      );
    }
  }
  __name(assertMost, "assertMost");
  Assertion.addMethod("most", assertMost);
  Assertion.addMethod("lte", assertMost);
  Assertion.addMethod("lessThanOrEqual", assertMost);
  Assertion.addMethod("within", function(start, finish, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), doLength = flag2(this, "doLength"), flagMsg = flag2(this, "message"), msgPrefix = flagMsg ? flagMsg + ": " : "", ssfi = flag2(this, "ssfi"), objType = type(obj).toLowerCase(), startType = type(start).toLowerCase(), finishType = type(finish).toLowerCase(), errorMessage, shouldThrow = true, range = startType === "date" && finishType === "date" ? start.toISOString() + ".." + finish.toISOString() : start + ".." + finish;
    if (doLength && objType !== "map" && objType !== "set") {
      new Assertion(obj, flagMsg, ssfi, true).to.have.property("length");
    }
    if (!doLength && (objType === "date" && (startType !== "date" || finishType !== "date"))) {
      errorMessage = msgPrefix + "the arguments to within must be dates";
    } else if ((startType !== "number" || finishType !== "number") && (doLength || objType === "number")) {
      errorMessage = msgPrefix + "the arguments to within must be numbers";
    } else if (!doLength && (objType !== "date" && objType !== "number")) {
      var printObj = objType === "string" ? "'" + obj + "'" : obj;
      errorMessage = msgPrefix + "expected " + printObj + " to be a number or a date";
    } else {
      shouldThrow = false;
    }
    if (shouldThrow) {
      throw new AssertionError(errorMessage, void 0, ssfi);
    }
    if (doLength) {
      var descriptor = "length", itemsCount;
      if (objType === "map" || objType === "set") {
        descriptor = "size";
        itemsCount = obj.size;
      } else {
        itemsCount = obj.length;
      }
      this.assert(
        itemsCount >= start && itemsCount <= finish,
        "expected #{this} to have a " + descriptor + " within " + range,
        "expected #{this} to not have a " + descriptor + " within " + range
      );
    } else {
      this.assert(
        obj >= start && obj <= finish,
        "expected #{this} to be within " + range,
        "expected #{this} to not be within " + range
      );
    }
  });
  function assertInstanceOf(constructor, msg) {
    if (msg)
      flag2(this, "message", msg);
    var target = flag2(this, "object");
    var ssfi = flag2(this, "ssfi");
    var flagMsg = flag2(this, "message");
    try {
      var isInstanceOf = target instanceof constructor;
    } catch (err) {
      if (err instanceof TypeError) {
        flagMsg = flagMsg ? flagMsg + ": " : "";
        throw new AssertionError(
          flagMsg + "The instanceof assertion needs a constructor but " + type(constructor) + " was given.",
          void 0,
          ssfi
        );
      }
      throw err;
    }
    var name = getName(constructor);
    if (name == null) {
      name = "an unnamed constructor";
    }
    this.assert(
      isInstanceOf,
      "expected #{this} to be an instance of " + name,
      "expected #{this} to not be an instance of " + name
    );
  }
  __name(assertInstanceOf, "assertInstanceOf");
  Assertion.addMethod("instanceof", assertInstanceOf);
  Assertion.addMethod("instanceOf", assertInstanceOf);
  function assertProperty(name, val, msg) {
    if (msg)
      flag2(this, "message", msg);
    var isNested = flag2(this, "nested"), isOwn = flag2(this, "own"), flagMsg = flag2(this, "message"), obj = flag2(this, "object"), ssfi = flag2(this, "ssfi"), nameType = typeof name;
    flagMsg = flagMsg ? flagMsg + ": " : "";
    if (isNested) {
      if (nameType !== "string") {
        throw new AssertionError(
          flagMsg + "the argument to property must be a string when using nested syntax",
          void 0,
          ssfi
        );
      }
    } else {
      if (nameType !== "string" && nameType !== "number" && nameType !== "symbol") {
        throw new AssertionError(
          flagMsg + "the argument to property must be a string, number, or symbol",
          void 0,
          ssfi
        );
      }
    }
    if (isNested && isOwn) {
      throw new AssertionError(
        flagMsg + 'The "nested" and "own" flags cannot be combined.',
        void 0,
        ssfi
      );
    }
    if (obj === null || obj === void 0) {
      throw new AssertionError(
        flagMsg + "Target cannot be null or undefined.",
        void 0,
        ssfi
      );
    }
    var isDeep = flag2(this, "deep"), negate = flag2(this, "negate"), pathInfo = isNested ? getPathInfo(obj, name) : null, value = isNested ? pathInfo.value : obj[name], isEql = isDeep ? flag2(this, "eql") : (val1, val2) => val1 === val2;
    var descriptor = "";
    if (isDeep)
      descriptor += "deep ";
    if (isOwn)
      descriptor += "own ";
    if (isNested)
      descriptor += "nested ";
    descriptor += "property ";
    var hasProperty2;
    if (isOwn)
      hasProperty2 = Object.prototype.hasOwnProperty.call(obj, name);
    else if (isNested)
      hasProperty2 = pathInfo.exists;
    else
      hasProperty2 = hasProperty(obj, name);
    if (!negate || arguments.length === 1) {
      this.assert(
        hasProperty2,
        "expected #{this} to have " + descriptor + inspect2(name),
        "expected #{this} to not have " + descriptor + inspect2(name)
      );
    }
    if (arguments.length > 1) {
      this.assert(
        hasProperty2 && isEql(val, value),
        "expected #{this} to have " + descriptor + inspect2(name) + " of #{exp}, but got #{act}",
        "expected #{this} to not have " + descriptor + inspect2(name) + " of #{act}",
        val,
        value
      );
    }
    flag2(this, "object", value);
  }
  __name(assertProperty, "assertProperty");
  Assertion.addMethod("property", assertProperty);
  function assertOwnProperty(name, value, msg) {
    flag2(this, "own", true);
    assertProperty.apply(this, arguments);
  }
  __name(assertOwnProperty, "assertOwnProperty");
  Assertion.addMethod("ownProperty", assertOwnProperty);
  Assertion.addMethod("haveOwnProperty", assertOwnProperty);
  function assertOwnPropertyDescriptor(name, descriptor, msg) {
    if (typeof descriptor === "string") {
      msg = descriptor;
      descriptor = null;
    }
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object");
    var actualDescriptor = Object.getOwnPropertyDescriptor(Object(obj), name);
    var eql = flag2(this, "eql");
    if (actualDescriptor && descriptor) {
      this.assert(
        eql(descriptor, actualDescriptor),
        "expected the own property descriptor for " + inspect2(name) + " on #{this} to match " + inspect2(descriptor) + ", got " + inspect2(actualDescriptor),
        "expected the own property descriptor for " + inspect2(name) + " on #{this} to not match " + inspect2(descriptor),
        descriptor,
        actualDescriptor,
        true
      );
    } else {
      this.assert(
        actualDescriptor,
        "expected #{this} to have an own property descriptor for " + inspect2(name),
        "expected #{this} to not have an own property descriptor for " + inspect2(name)
      );
    }
    flag2(this, "object", actualDescriptor);
  }
  __name(assertOwnPropertyDescriptor, "assertOwnPropertyDescriptor");
  Assertion.addMethod("ownPropertyDescriptor", assertOwnPropertyDescriptor);
  Assertion.addMethod("haveOwnPropertyDescriptor", assertOwnPropertyDescriptor);
  function assertLengthChain() {
    flag2(this, "doLength", true);
  }
  __name(assertLengthChain, "assertLengthChain");
  function assertLength(n, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), objType = type(obj).toLowerCase(), flagMsg = flag2(this, "message"), ssfi = flag2(this, "ssfi"), descriptor = "length", itemsCount;
    switch (objType) {
      case "map":
      case "set":
        descriptor = "size";
        itemsCount = obj.size;
        break;
      default:
        new Assertion(obj, flagMsg, ssfi, true).to.have.property("length");
        itemsCount = obj.length;
    }
    this.assert(
      itemsCount == n,
      "expected #{this} to have a " + descriptor + " of #{exp} but got #{act}",
      "expected #{this} to not have a " + descriptor + " of #{act}",
      n,
      itemsCount
    );
  }
  __name(assertLength, "assertLength");
  Assertion.addChainableMethod("length", assertLength, assertLengthChain);
  Assertion.addChainableMethod("lengthOf", assertLength, assertLengthChain);
  function assertMatch(re, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object");
    this.assert(
      re.exec(obj),
      "expected #{this} to match " + re,
      "expected #{this} not to match " + re
    );
  }
  __name(assertMatch, "assertMatch");
  Assertion.addMethod("match", assertMatch);
  Assertion.addMethod("matches", assertMatch);
  Assertion.addMethod("string", function(str, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), flagMsg = flag2(this, "message"), ssfi = flag2(this, "ssfi");
    new Assertion(obj, flagMsg, ssfi, true).is.a("string");
    this.assert(
      ~obj.indexOf(str),
      "expected #{this} to contain " + inspect2(str),
      "expected #{this} to not contain " + inspect2(str)
    );
  });
  function assertKeys(keys) {
    var obj = flag2(this, "object"), objType = type(obj), keysType = type(keys), ssfi = flag2(this, "ssfi"), isDeep = flag2(this, "deep"), str, deepStr = "", actual, ok = true, flagMsg = flag2(this, "message");
    flagMsg = flagMsg ? flagMsg + ": " : "";
    var mixedArgsMsg = flagMsg + "when testing keys against an object or an array you must give a single Array|Object|String argument or multiple String arguments";
    if (objType === "Map" || objType === "Set") {
      deepStr = isDeep ? "deeply " : "";
      actual = [];
      obj.forEach(function(val, key) {
        actual.push(key);
      });
      if (keysType !== "Array") {
        keys = Array.prototype.slice.call(arguments);
      }
    } else {
      actual = getOwnEnumerableProperties(obj);
      switch (keysType) {
        case "Array":
          if (arguments.length > 1) {
            throw new AssertionError(mixedArgsMsg, void 0, ssfi);
          }
          break;
        case "Object":
          if (arguments.length > 1) {
            throw new AssertionError(mixedArgsMsg, void 0, ssfi);
          }
          keys = Object.keys(keys);
          break;
        default:
          keys = Array.prototype.slice.call(arguments);
      }
      keys = keys.map(function(val) {
        return typeof val === "symbol" ? val : String(val);
      });
    }
    if (!keys.length) {
      throw new AssertionError(flagMsg + "keys required", void 0, ssfi);
    }
    var len = keys.length, any = flag2(this, "any"), all = flag2(this, "all"), expected = keys, isEql = isDeep ? flag2(this, "eql") : (val1, val2) => val1 === val2;
    if (!any && !all) {
      all = true;
    }
    if (any) {
      ok = expected.some(function(expectedKey) {
        return actual.some(function(actualKey) {
          return isEql(expectedKey, actualKey);
        });
      });
    }
    if (all) {
      ok = expected.every(function(expectedKey) {
        return actual.some(function(actualKey) {
          return isEql(expectedKey, actualKey);
        });
      });
      if (!flag2(this, "contains")) {
        ok = ok && keys.length == actual.length;
      }
    }
    if (len > 1) {
      keys = keys.map(function(key) {
        return inspect2(key);
      });
      var last = keys.pop();
      if (all) {
        str = keys.join(", ") + ", and " + last;
      }
      if (any) {
        str = keys.join(", ") + ", or " + last;
      }
    } else {
      str = inspect2(keys[0]);
    }
    str = (len > 1 ? "keys " : "key ") + str;
    str = (flag2(this, "contains") ? "contain " : "have ") + str;
    this.assert(
      ok,
      "expected #{this} to " + deepStr + str,
      "expected #{this} to not " + deepStr + str,
      expected.slice(0).sort(compareByInspect),
      actual.sort(compareByInspect),
      true
    );
  }
  __name(assertKeys, "assertKeys");
  Assertion.addMethod("keys", assertKeys);
  Assertion.addMethod("key", assertKeys);
  function assertThrows(errorLike, errMsgMatcher, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), ssfi = flag2(this, "ssfi"), flagMsg = flag2(this, "message"), negate = flag2(this, "negate") || false;
    new Assertion(obj, flagMsg, ssfi, true).is.a("function");
    if (errorLike instanceof RegExp || typeof errorLike === "string") {
      errMsgMatcher = errorLike;
      errorLike = null;
    }
    var caughtErr;
    try {
      obj();
    } catch (err) {
      caughtErr = err;
    }
    var everyArgIsUndefined = errorLike === void 0 && errMsgMatcher === void 0;
    var everyArgIsDefined = Boolean(errorLike && errMsgMatcher);
    var errorLikeFail = false;
    var errMsgMatcherFail = false;
    if (everyArgIsUndefined || !everyArgIsUndefined && !negate) {
      var errorLikeString = "an error";
      if (errorLike instanceof Error) {
        errorLikeString = "#{exp}";
      } else if (errorLike) {
        errorLikeString = check_error_exports.getConstructorName(errorLike);
      }
      this.assert(
        caughtErr,
        "expected #{this} to throw " + errorLikeString,
        "expected #{this} to not throw an error but #{act} was thrown",
        errorLike && errorLike.toString(),
        caughtErr instanceof Error ? caughtErr.toString() : typeof caughtErr === "string" ? caughtErr : caughtErr && check_error_exports.getConstructorName(caughtErr)
      );
    }
    if (errorLike && caughtErr) {
      if (errorLike instanceof Error) {
        var isCompatibleInstance = check_error_exports.compatibleInstance(caughtErr, errorLike);
        if (isCompatibleInstance === negate) {
          if (everyArgIsDefined && negate) {
            errorLikeFail = true;
          } else {
            this.assert(
              negate,
              "expected #{this} to throw #{exp} but #{act} was thrown",
              "expected #{this} to not throw #{exp}" + (caughtErr && !negate ? " but #{act} was thrown" : ""),
              errorLike.toString(),
              caughtErr.toString()
            );
          }
        }
      }
      var isCompatibleConstructor = check_error_exports.compatibleConstructor(caughtErr, errorLike);
      if (isCompatibleConstructor === negate) {
        if (everyArgIsDefined && negate) {
          errorLikeFail = true;
        } else {
          this.assert(
            negate,
            "expected #{this} to throw #{exp} but #{act} was thrown",
            "expected #{this} to not throw #{exp}" + (caughtErr ? " but #{act} was thrown" : ""),
            errorLike instanceof Error ? errorLike.toString() : errorLike && check_error_exports.getConstructorName(errorLike),
            caughtErr instanceof Error ? caughtErr.toString() : caughtErr && check_error_exports.getConstructorName(caughtErr)
          );
        }
      }
    }
    if (caughtErr && errMsgMatcher !== void 0 && errMsgMatcher !== null) {
      var placeholder = "including";
      if (errMsgMatcher instanceof RegExp) {
        placeholder = "matching";
      }
      var isCompatibleMessage = check_error_exports.compatibleMessage(caughtErr, errMsgMatcher);
      if (isCompatibleMessage === negate) {
        if (everyArgIsDefined && negate) {
          errMsgMatcherFail = true;
        } else {
          this.assert(
            negate,
            "expected #{this} to throw error " + placeholder + " #{exp} but got #{act}",
            "expected #{this} to throw error not " + placeholder + " #{exp}",
            errMsgMatcher,
            check_error_exports.getMessage(caughtErr)
          );
        }
      }
    }
    if (errorLikeFail && errMsgMatcherFail) {
      this.assert(
        negate,
        "expected #{this} to throw #{exp} but #{act} was thrown",
        "expected #{this} to not throw #{exp}" + (caughtErr ? " but #{act} was thrown" : ""),
        errorLike instanceof Error ? errorLike.toString() : errorLike && check_error_exports.getConstructorName(errorLike),
        caughtErr instanceof Error ? caughtErr.toString() : caughtErr && check_error_exports.getConstructorName(caughtErr)
      );
    }
    flag2(this, "object", caughtErr);
  }
  __name(assertThrows, "assertThrows");
  Assertion.addMethod("throw", assertThrows);
  Assertion.addMethod("throws", assertThrows);
  Assertion.addMethod("Throw", assertThrows);
  function respondTo(method, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), itself = flag2(this, "itself"), context = "function" === typeof obj && !itself ? obj.prototype[method] : obj[method];
    this.assert(
      "function" === typeof context,
      "expected #{this} to respond to " + inspect2(method),
      "expected #{this} to not respond to " + inspect2(method)
    );
  }
  __name(respondTo, "respondTo");
  Assertion.addMethod("respondTo", respondTo);
  Assertion.addMethod("respondsTo", respondTo);
  Assertion.addProperty("itself", function() {
    flag2(this, "itself", true);
  });
  function satisfy(matcher, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object");
    var result = matcher(obj);
    this.assert(
      result,
      "expected #{this} to satisfy " + objDisplay(matcher),
      "expected #{this} to not satisfy" + objDisplay(matcher),
      flag2(this, "negate") ? false : true,
      result
    );
  }
  __name(satisfy, "satisfy");
  Assertion.addMethod("satisfy", satisfy);
  Assertion.addMethod("satisfies", satisfy);
  function closeTo(expected, delta, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), flagMsg = flag2(this, "message"), ssfi = flag2(this, "ssfi");
    new Assertion(obj, flagMsg, ssfi, true).is.a("number");
    if (typeof expected !== "number" || typeof delta !== "number") {
      flagMsg = flagMsg ? flagMsg + ": " : "";
      var deltaMessage = delta === void 0 ? ", and a delta is required" : "";
      throw new AssertionError(
        flagMsg + "the arguments to closeTo or approximately must be numbers" + deltaMessage,
        void 0,
        ssfi
      );
    }
    this.assert(
      Math.abs(obj - expected) <= delta,
      "expected #{this} to be close to " + expected + " +/- " + delta,
      "expected #{this} not to be close to " + expected + " +/- " + delta
    );
  }
  __name(closeTo, "closeTo");
  Assertion.addMethod("closeTo", closeTo);
  Assertion.addMethod("approximately", closeTo);
  function isSubsetOf(_subset, _superset, cmp, contains, ordered) {
    let superset = Array.from(_superset);
    let subset = Array.from(_subset);
    if (!contains) {
      if (subset.length !== superset.length)
        return false;
      superset = superset.slice();
    }
    return subset.every(function(elem, idx) {
      if (ordered)
        return cmp ? cmp(elem, superset[idx]) : elem === superset[idx];
      if (!cmp) {
        var matchIdx = superset.indexOf(elem);
        if (matchIdx === -1)
          return false;
        if (!contains)
          superset.splice(matchIdx, 1);
        return true;
      }
      return superset.some(function(elem2, matchIdx2) {
        if (!cmp(elem, elem2))
          return false;
        if (!contains)
          superset.splice(matchIdx2, 1);
        return true;
      });
    });
  }
  __name(isSubsetOf, "isSubsetOf");
  Assertion.addMethod("members", function(subset, msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object"), flagMsg = flag2(this, "message"), ssfi = flag2(this, "ssfi");
    new Assertion(obj, flagMsg, ssfi, true).to.be.iterable;
    new Assertion(subset, flagMsg, ssfi, true).to.be.iterable;
    var contains = flag2(this, "contains");
    var ordered = flag2(this, "ordered");
    var subject, failMsg, failNegateMsg;
    if (contains) {
      subject = ordered ? "an ordered superset" : "a superset";
      failMsg = "expected #{this} to be " + subject + " of #{exp}";
      failNegateMsg = "expected #{this} to not be " + subject + " of #{exp}";
    } else {
      subject = ordered ? "ordered members" : "members";
      failMsg = "expected #{this} to have the same " + subject + " as #{exp}";
      failNegateMsg = "expected #{this} to not have the same " + subject + " as #{exp}";
    }
    var cmp = flag2(this, "deep") ? flag2(this, "eql") : void 0;
    this.assert(
      isSubsetOf(subset, obj, cmp, contains, ordered),
      failMsg,
      failNegateMsg,
      subset,
      obj,
      true
    );
  });
  Assertion.addProperty("iterable", function(msg) {
    if (msg)
      flag2(this, "message", msg);
    var obj = flag2(this, "object");
    this.assert(
      obj != void 0 && obj[Symbol.iterator],
      "expected #{this} to be an iterable",
      "expected #{this} to not be an iterable",
      obj
    );
  });
  function oneOf(list, msg) {
    if (msg)
      flag2(this, "message", msg);
    var expected = flag2(this, "object"), flagMsg = flag2(this, "message"), ssfi = flag2(this, "ssfi"), contains = flag2(this, "contains"), isDeep = flag2(this, "deep"), eql = flag2(this, "eql");
    new Assertion(list, flagMsg, ssfi, true).to.be.an("array");
    if (contains) {
      this.assert(
        list.some(function(possibility) {
          return expected.indexOf(possibility) > -1;
        }),
        "expected #{this} to contain one of #{exp}",
        "expected #{this} to not contain one of #{exp}",
        list,
        expected
      );
    } else {
      if (isDeep) {
        this.assert(
          list.some(function(possibility) {
            return eql(expected, possibility);
          }),
          "expected #{this} to deeply equal one of #{exp}",
          "expected #{this} to deeply equal one of #{exp}",
          list,
          expected
        );
      } else {
        this.assert(
          list.indexOf(expected) > -1,
          "expected #{this} to be one of #{exp}",
          "expected #{this} to not be one of #{exp}",
          list,
          expected
        );
      }
    }
  }
  __name(oneOf, "oneOf");
  Assertion.addMethod("oneOf", oneOf);
  function assertChanges(subject, prop, msg) {
    if (msg)
      flag2(this, "message", msg);
    var fn = flag2(this, "object"), flagMsg = flag2(this, "message"), ssfi = flag2(this, "ssfi");
    new Assertion(fn, flagMsg, ssfi, true).is.a("function");
    var initial;
    if (!prop) {
      new Assertion(subject, flagMsg, ssfi, true).is.a("function");
      initial = subject();
    } else {
      new Assertion(subject, flagMsg, ssfi, true).to.have.property(prop);
      initial = subject[prop];
    }
    fn();
    var final = prop === void 0 || prop === null ? subject() : subject[prop];
    var msgObj = prop === void 0 || prop === null ? initial : "." + prop;
    flag2(this, "deltaMsgObj", msgObj);
    flag2(this, "initialDeltaValue", initial);
    flag2(this, "finalDeltaValue", final);
    flag2(this, "deltaBehavior", "change");
    flag2(this, "realDelta", final !== initial);
    this.assert(
      initial !== final,
      "expected " + msgObj + " to change",
      "expected " + msgObj + " to not change"
    );
  }
  __name(assertChanges, "assertChanges");
  Assertion.addMethod("change", assertChanges);
  Assertion.addMethod("changes", assertChanges);
  function assertIncreases(subject, prop, msg) {
    if (msg)
      flag2(this, "message", msg);
    var fn = flag2(this, "object"), flagMsg = flag2(this, "message"), ssfi = flag2(this, "ssfi");
    new Assertion(fn, flagMsg, ssfi, true).is.a("function");
    var initial;
    if (!prop) {
      new Assertion(subject, flagMsg, ssfi, true).is.a("function");
      initial = subject();
    } else {
      new Assertion(subject, flagMsg, ssfi, true).to.have.property(prop);
      initial = subject[prop];
    }
    new Assertion(initial, flagMsg, ssfi, true).is.a("number");
    fn();
    var final = prop === void 0 || prop === null ? subject() : subject[prop];
    var msgObj = prop === void 0 || prop === null ? initial : "." + prop;
    flag2(this, "deltaMsgObj", msgObj);
    flag2(this, "initialDeltaValue", initial);
    flag2(this, "finalDeltaValue", final);
    flag2(this, "deltaBehavior", "increase");
    flag2(this, "realDelta", final - initial);
    this.assert(
      final - initial > 0,
      "expected " + msgObj + " to increase",
      "expected " + msgObj + " to not increase"
    );
  }
  __name(assertIncreases, "assertIncreases");
  Assertion.addMethod("increase", assertIncreases);
  Assertion.addMethod("increases", assertIncreases);
  function assertDecreases(subject, prop, msg) {
    if (msg)
      flag2(this, "message", msg);
    var fn = flag2(this, "object"), flagMsg = flag2(this, "message"), ssfi = flag2(this, "ssfi");
    new Assertion(fn, flagMsg, ssfi, true).is.a("function");
    var initial;
    if (!prop) {
      new Assertion(subject, flagMsg, ssfi, true).is.a("function");
      initial = subject();
    } else {
      new Assertion(subject, flagMsg, ssfi, true).to.have.property(prop);
      initial = subject[prop];
    }
    new Assertion(initial, flagMsg, ssfi, true).is.a("number");
    fn();
    var final = prop === void 0 || prop === null ? subject() : subject[prop];
    var msgObj = prop === void 0 || prop === null ? initial : "." + prop;
    flag2(this, "deltaMsgObj", msgObj);
    flag2(this, "initialDeltaValue", initial);
    flag2(this, "finalDeltaValue", final);
    flag2(this, "deltaBehavior", "decrease");
    flag2(this, "realDelta", initial - final);
    this.assert(
      final - initial < 0,
      "expected " + msgObj + " to decrease",
      "expected " + msgObj + " to not decrease"
    );
  }
  __name(assertDecreases, "assertDecreases");
  Assertion.addMethod("decrease", assertDecreases);
  Assertion.addMethod("decreases", assertDecreases);
  function assertDelta(delta, msg) {
    if (msg)
      flag2(this, "message", msg);
    var msgObj = flag2(this, "deltaMsgObj");
    var initial = flag2(this, "initialDeltaValue");
    var final = flag2(this, "finalDeltaValue");
    var behavior = flag2(this, "deltaBehavior");
    var realDelta = flag2(this, "realDelta");
    var expression;
    if (behavior === "change") {
      expression = Math.abs(final - initial) === Math.abs(delta);
    } else {
      expression = realDelta === Math.abs(delta);
    }
    this.assert(
      expression,
      "expected " + msgObj + " to " + behavior + " by " + delta,
      "expected " + msgObj + " to not " + behavior + " by " + delta
    );
  }
  __name(assertDelta, "assertDelta");
  Assertion.addMethod("by", assertDelta);
  Assertion.addProperty("extensible", function() {
    var obj = flag2(this, "object");
    var isExtensible = obj === Object(obj) && Object.isExtensible(obj);
    this.assert(
      isExtensible,
      "expected #{this} to be extensible",
      "expected #{this} to not be extensible"
    );
  });
  Assertion.addProperty("sealed", function() {
    var obj = flag2(this, "object");
    var isSealed = obj === Object(obj) ? Object.isSealed(obj) : true;
    this.assert(
      isSealed,
      "expected #{this} to be sealed",
      "expected #{this} to not be sealed"
    );
  });
  Assertion.addProperty("frozen", function() {
    var obj = flag2(this, "object");
    var isFrozen = obj === Object(obj) ? Object.isFrozen(obj) : true;
    this.assert(
      isFrozen,
      "expected #{this} to be frozen",
      "expected #{this} to not be frozen"
    );
  });
  Assertion.addProperty("finite", function(msg) {
    var obj = flag2(this, "object");
    this.assert(
      typeof obj === "number" && isFinite(obj),
      "expected #{this} to be a finite number",
      "expected #{this} to not be a finite number"
    );
  });

  // lib/chai/interface/expect.js
  function expect(val, message) {
    return new Assertion(val, message);
  }
  __name(expect, "expect");
  expect.fail = function(actual, expected, message, operator) {
    if (arguments.length < 2) {
      message = actual;
      actual = void 0;
    }
    message = message || "expect.fail()";
    throw new AssertionError(message, {
      actual,
      expected,
      operator
    }, expect.fail);
  };

  // lib/chai/interface/should.js
  var should_exports = {};
  __export(should_exports, {
    Should: () => Should,
    should: () => should$1
  });
  function loadShould() {
    function shouldGetter() {
      if (this instanceof String || this instanceof Number || this instanceof Boolean || typeof Symbol === "function" && this instanceof Symbol || typeof BigInt === "function" && this instanceof BigInt) {
        return new Assertion(this.valueOf(), null, shouldGetter);
      }
      return new Assertion(this, null, shouldGetter);
    }
    __name(shouldGetter, "shouldGetter");
    function shouldSetter(value) {
      Object.defineProperty(this, "should", {
        value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    __name(shouldSetter, "shouldSetter");
    Object.defineProperty(Object.prototype, "should", {
      set: shouldSetter,
      get: shouldGetter,
      configurable: true
    });
    var should2 = {};
    should2.fail = function(actual, expected, message, operator) {
      if (arguments.length < 2) {
        message = actual;
        actual = void 0;
      }
      message = message || "should.fail()";
      throw new AssertionError(message, {
        actual,
        expected,
        operator
      }, should2.fail);
    };
    should2.equal = function(val1, val2, msg) {
      new Assertion(val1, msg).to.equal(val2);
    };
    should2.Throw = function(fn, errt, errs, msg) {
      new Assertion(fn, msg).to.Throw(errt, errs);
    };
    should2.exist = function(val, msg) {
      new Assertion(val, msg).to.exist;
    };
    should2.not = {};
    should2.not.equal = function(val1, val2, msg) {
      new Assertion(val1, msg).to.not.equal(val2);
    };
    should2.not.Throw = function(fn, errt, errs, msg) {
      new Assertion(fn, msg).to.not.Throw(errt, errs);
    };
    should2.not.exist = function(val, msg) {
      new Assertion(val, msg).to.not.exist;
    };
    should2["throw"] = should2["Throw"];
    should2.not["throw"] = should2.not["Throw"];
    return should2;
  }
  __name(loadShould, "loadShould");
  var should$1 = loadShould;
  var Should = loadShould;

  // lib/chai/interface/assert.js
  function assert(express, errmsg) {
    var test2 = new Assertion(null, null, assert, true);
    test2.assert(
      express,
      errmsg,
      "[ negation message unavailable ]"
    );
  }
  __name(assert, "assert");
  assert.fail = function(actual, expected, message, operator) {
    if (arguments.length < 2) {
      message = actual;
      actual = void 0;
    }
    message = message || "assert.fail()";
    throw new AssertionError(message, {
      actual,
      expected,
      operator
    }, assert.fail);
  };
  assert.isOk = function(val, msg) {
    new Assertion(val, msg, assert.isOk, true).is.ok;
  };
  assert.isNotOk = function(val, msg) {
    new Assertion(val, msg, assert.isNotOk, true).is.not.ok;
  };
  assert.equal = function(act, exp, msg) {
    var test2 = new Assertion(act, msg, assert.equal, true);
    test2.assert(
      exp == flag(test2, "object"),
      "expected #{this} to equal #{exp}",
      "expected #{this} to not equal #{act}",
      exp,
      act,
      true
    );
  };
  assert.notEqual = function(act, exp, msg) {
    var test2 = new Assertion(act, msg, assert.notEqual, true);
    test2.assert(
      exp != flag(test2, "object"),
      "expected #{this} to not equal #{exp}",
      "expected #{this} to equal #{act}",
      exp,
      act,
      true
    );
  };
  assert.strictEqual = function(act, exp, msg) {
    new Assertion(act, msg, assert.strictEqual, true).to.equal(exp);
  };
  assert.notStrictEqual = function(act, exp, msg) {
    new Assertion(act, msg, assert.notStrictEqual, true).to.not.equal(exp);
  };
  assert.deepEqual = assert.deepStrictEqual = function(act, exp, msg) {
    new Assertion(act, msg, assert.deepEqual, true).to.eql(exp);
  };
  assert.notDeepEqual = function(act, exp, msg) {
    new Assertion(act, msg, assert.notDeepEqual, true).to.not.eql(exp);
  };
  assert.isAbove = function(val, abv, msg) {
    new Assertion(val, msg, assert.isAbove, true).to.be.above(abv);
  };
  assert.isAtLeast = function(val, atlst, msg) {
    new Assertion(val, msg, assert.isAtLeast, true).to.be.least(atlst);
  };
  assert.isBelow = function(val, blw, msg) {
    new Assertion(val, msg, assert.isBelow, true).to.be.below(blw);
  };
  assert.isAtMost = function(val, atmst, msg) {
    new Assertion(val, msg, assert.isAtMost, true).to.be.most(atmst);
  };
  assert.isTrue = function(val, msg) {
    new Assertion(val, msg, assert.isTrue, true).is["true"];
  };
  assert.isNotTrue = function(val, msg) {
    new Assertion(val, msg, assert.isNotTrue, true).to.not.equal(true);
  };
  assert.isFalse = function(val, msg) {
    new Assertion(val, msg, assert.isFalse, true).is["false"];
  };
  assert.isNotFalse = function(val, msg) {
    new Assertion(val, msg, assert.isNotFalse, true).to.not.equal(false);
  };
  assert.isNull = function(val, msg) {
    new Assertion(val, msg, assert.isNull, true).to.equal(null);
  };
  assert.isNotNull = function(val, msg) {
    new Assertion(val, msg, assert.isNotNull, true).to.not.equal(null);
  };
  assert.isNaN = function(val, msg) {
    new Assertion(val, msg, assert.isNaN, true).to.be.NaN;
  };
  assert.isNotNaN = function(val, msg) {
    new Assertion(val, msg, assert.isNotNaN, true).not.to.be.NaN;
  };
  assert.exists = function(val, msg) {
    new Assertion(val, msg, assert.exists, true).to.exist;
  };
  assert.notExists = function(val, msg) {
    new Assertion(val, msg, assert.notExists, true).to.not.exist;
  };
  assert.isUndefined = function(val, msg) {
    new Assertion(val, msg, assert.isUndefined, true).to.equal(void 0);
  };
  assert.isDefined = function(val, msg) {
    new Assertion(val, msg, assert.isDefined, true).to.not.equal(void 0);
  };
  assert.isCallable = function(val, msg) {
    new Assertion(val, msg, assert.isCallable, true).is.callable;
  };
  assert.isNotCallable = function(val, msg) {
    new Assertion(val, msg, assert.isNotCallable, true).is.not.callable;
  };
  assert.isObject = function(val, msg) {
    new Assertion(val, msg, assert.isObject, true).to.be.a("object");
  };
  assert.isNotObject = function(val, msg) {
    new Assertion(val, msg, assert.isNotObject, true).to.not.be.a("object");
  };
  assert.isArray = function(val, msg) {
    new Assertion(val, msg, assert.isArray, true).to.be.an("array");
  };
  assert.isNotArray = function(val, msg) {
    new Assertion(val, msg, assert.isNotArray, true).to.not.be.an("array");
  };
  assert.isString = function(val, msg) {
    new Assertion(val, msg, assert.isString, true).to.be.a("string");
  };
  assert.isNotString = function(val, msg) {
    new Assertion(val, msg, assert.isNotString, true).to.not.be.a("string");
  };
  assert.isNumber = function(val, msg) {
    new Assertion(val, msg, assert.isNumber, true).to.be.a("number");
  };
  assert.isNotNumber = function(val, msg) {
    new Assertion(val, msg, assert.isNotNumber, true).to.not.be.a("number");
  };
  assert.isFinite = function(val, msg) {
    new Assertion(val, msg, assert.isFinite, true).to.be.finite;
  };
  assert.isBoolean = function(val, msg) {
    new Assertion(val, msg, assert.isBoolean, true).to.be.a("boolean");
  };
  assert.isNotBoolean = function(val, msg) {
    new Assertion(val, msg, assert.isNotBoolean, true).to.not.be.a("boolean");
  };
  assert.typeOf = function(val, type3, msg) {
    new Assertion(val, msg, assert.typeOf, true).to.be.a(type3);
  };
  assert.notTypeOf = function(val, type3, msg) {
    new Assertion(val, msg, assert.notTypeOf, true).to.not.be.a(type3);
  };
  assert.instanceOf = function(val, type3, msg) {
    new Assertion(val, msg, assert.instanceOf, true).to.be.instanceOf(type3);
  };
  assert.notInstanceOf = function(val, type3, msg) {
    new Assertion(val, msg, assert.notInstanceOf, true).to.not.be.instanceOf(type3);
  };
  assert.include = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.include, true).include(inc);
  };
  assert.notInclude = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.notInclude, true).not.include(inc);
  };
  assert.deepInclude = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.deepInclude, true).deep.include(inc);
  };
  assert.notDeepInclude = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.notDeepInclude, true).not.deep.include(inc);
  };
  assert.nestedInclude = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.nestedInclude, true).nested.include(inc);
  };
  assert.notNestedInclude = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.notNestedInclude, true).not.nested.include(inc);
  };
  assert.deepNestedInclude = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.deepNestedInclude, true).deep.nested.include(inc);
  };
  assert.notDeepNestedInclude = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.notDeepNestedInclude, true).not.deep.nested.include(inc);
  };
  assert.ownInclude = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.ownInclude, true).own.include(inc);
  };
  assert.notOwnInclude = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.notOwnInclude, true).not.own.include(inc);
  };
  assert.deepOwnInclude = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.deepOwnInclude, true).deep.own.include(inc);
  };
  assert.notDeepOwnInclude = function(exp, inc, msg) {
    new Assertion(exp, msg, assert.notDeepOwnInclude, true).not.deep.own.include(inc);
  };
  assert.match = function(exp, re, msg) {
    new Assertion(exp, msg, assert.match, true).to.match(re);
  };
  assert.notMatch = function(exp, re, msg) {
    new Assertion(exp, msg, assert.notMatch, true).to.not.match(re);
  };
  assert.property = function(obj, prop, msg) {
    new Assertion(obj, msg, assert.property, true).to.have.property(prop);
  };
  assert.notProperty = function(obj, prop, msg) {
    new Assertion(obj, msg, assert.notProperty, true).to.not.have.property(prop);
  };
  assert.propertyVal = function(obj, prop, val, msg) {
    new Assertion(obj, msg, assert.propertyVal, true).to.have.property(prop, val);
  };
  assert.notPropertyVal = function(obj, prop, val, msg) {
    new Assertion(obj, msg, assert.notPropertyVal, true).to.not.have.property(prop, val);
  };
  assert.deepPropertyVal = function(obj, prop, val, msg) {
    new Assertion(obj, msg, assert.deepPropertyVal, true).to.have.deep.property(prop, val);
  };
  assert.notDeepPropertyVal = function(obj, prop, val, msg) {
    new Assertion(obj, msg, assert.notDeepPropertyVal, true).to.not.have.deep.property(prop, val);
  };
  assert.ownProperty = function(obj, prop, msg) {
    new Assertion(obj, msg, assert.ownProperty, true).to.have.own.property(prop);
  };
  assert.notOwnProperty = function(obj, prop, msg) {
    new Assertion(obj, msg, assert.notOwnProperty, true).to.not.have.own.property(prop);
  };
  assert.ownPropertyVal = function(obj, prop, value, msg) {
    new Assertion(obj, msg, assert.ownPropertyVal, true).to.have.own.property(prop, value);
  };
  assert.notOwnPropertyVal = function(obj, prop, value, msg) {
    new Assertion(obj, msg, assert.notOwnPropertyVal, true).to.not.have.own.property(prop, value);
  };
  assert.deepOwnPropertyVal = function(obj, prop, value, msg) {
    new Assertion(obj, msg, assert.deepOwnPropertyVal, true).to.have.deep.own.property(prop, value);
  };
  assert.notDeepOwnPropertyVal = function(obj, prop, value, msg) {
    new Assertion(obj, msg, assert.notDeepOwnPropertyVal, true).to.not.have.deep.own.property(prop, value);
  };
  assert.nestedProperty = function(obj, prop, msg) {
    new Assertion(obj, msg, assert.nestedProperty, true).to.have.nested.property(prop);
  };
  assert.notNestedProperty = function(obj, prop, msg) {
    new Assertion(obj, msg, assert.notNestedProperty, true).to.not.have.nested.property(prop);
  };
  assert.nestedPropertyVal = function(obj, prop, val, msg) {
    new Assertion(obj, msg, assert.nestedPropertyVal, true).to.have.nested.property(prop, val);
  };
  assert.notNestedPropertyVal = function(obj, prop, val, msg) {
    new Assertion(obj, msg, assert.notNestedPropertyVal, true).to.not.have.nested.property(prop, val);
  };
  assert.deepNestedPropertyVal = function(obj, prop, val, msg) {
    new Assertion(obj, msg, assert.deepNestedPropertyVal, true).to.have.deep.nested.property(prop, val);
  };
  assert.notDeepNestedPropertyVal = function(obj, prop, val, msg) {
    new Assertion(obj, msg, assert.notDeepNestedPropertyVal, true).to.not.have.deep.nested.property(prop, val);
  };
  assert.lengthOf = function(exp, len, msg) {
    new Assertion(exp, msg, assert.lengthOf, true).to.have.lengthOf(len);
  };
  assert.hasAnyKeys = function(obj, keys, msg) {
    new Assertion(obj, msg, assert.hasAnyKeys, true).to.have.any.keys(keys);
  };
  assert.hasAllKeys = function(obj, keys, msg) {
    new Assertion(obj, msg, assert.hasAllKeys, true).to.have.all.keys(keys);
  };
  assert.containsAllKeys = function(obj, keys, msg) {
    new Assertion(obj, msg, assert.containsAllKeys, true).to.contain.all.keys(keys);
  };
  assert.doesNotHaveAnyKeys = function(obj, keys, msg) {
    new Assertion(obj, msg, assert.doesNotHaveAnyKeys, true).to.not.have.any.keys(keys);
  };
  assert.doesNotHaveAllKeys = function(obj, keys, msg) {
    new Assertion(obj, msg, assert.doesNotHaveAllKeys, true).to.not.have.all.keys(keys);
  };
  assert.hasAnyDeepKeys = function(obj, keys, msg) {
    new Assertion(obj, msg, assert.hasAnyDeepKeys, true).to.have.any.deep.keys(keys);
  };
  assert.hasAllDeepKeys = function(obj, keys, msg) {
    new Assertion(obj, msg, assert.hasAllDeepKeys, true).to.have.all.deep.keys(keys);
  };
  assert.containsAllDeepKeys = function(obj, keys, msg) {
    new Assertion(obj, msg, assert.containsAllDeepKeys, true).to.contain.all.deep.keys(keys);
  };
  assert.doesNotHaveAnyDeepKeys = function(obj, keys, msg) {
    new Assertion(obj, msg, assert.doesNotHaveAnyDeepKeys, true).to.not.have.any.deep.keys(keys);
  };
  assert.doesNotHaveAllDeepKeys = function(obj, keys, msg) {
    new Assertion(obj, msg, assert.doesNotHaveAllDeepKeys, true).to.not.have.all.deep.keys(keys);
  };
  assert.throws = function(fn, errorLike, errMsgMatcher, msg) {
    if ("string" === typeof errorLike || errorLike instanceof RegExp) {
      errMsgMatcher = errorLike;
      errorLike = null;
    }
    var assertErr = new Assertion(fn, msg, assert.throws, true).to.throw(errorLike, errMsgMatcher);
    return flag(assertErr, "object");
  };
  assert.doesNotThrow = function(fn, errorLike, errMsgMatcher, msg) {
    if ("string" === typeof errorLike || errorLike instanceof RegExp) {
      errMsgMatcher = errorLike;
      errorLike = null;
    }
    new Assertion(fn, msg, assert.doesNotThrow, true).to.not.throw(errorLike, errMsgMatcher);
  };
  assert.operator = function(val, operator, val2, msg) {
    var ok;
    switch (operator) {
      case "==":
        ok = val == val2;
        break;
      case "===":
        ok = val === val2;
        break;
      case ">":
        ok = val > val2;
        break;
      case ">=":
        ok = val >= val2;
        break;
      case "<":
        ok = val < val2;
        break;
      case "<=":
        ok = val <= val2;
        break;
      case "!=":
        ok = val != val2;
        break;
      case "!==":
        ok = val !== val2;
        break;
      default:
        msg = msg ? msg + ": " : msg;
        throw new AssertionError(
          msg + 'Invalid operator "' + operator + '"',
          void 0,
          assert.operator
        );
    }
    var test2 = new Assertion(ok, msg, assert.operator, true);
    test2.assert(
      true === flag(test2, "object"),
      "expected " + inspect2(val) + " to be " + operator + " " + inspect2(val2),
      "expected " + inspect2(val) + " to not be " + operator + " " + inspect2(val2)
    );
  };
  assert.closeTo = function(act, exp, delta, msg) {
    new Assertion(act, msg, assert.closeTo, true).to.be.closeTo(exp, delta);
  };
  assert.approximately = function(act, exp, delta, msg) {
    new Assertion(act, msg, assert.approximately, true).to.be.approximately(exp, delta);
  };
  assert.sameMembers = function(set1, set2, msg) {
    new Assertion(set1, msg, assert.sameMembers, true).to.have.same.members(set2);
  };
  assert.notSameMembers = function(set1, set2, msg) {
    new Assertion(set1, msg, assert.notSameMembers, true).to.not.have.same.members(set2);
  };
  assert.sameDeepMembers = function(set1, set2, msg) {
    new Assertion(set1, msg, assert.sameDeepMembers, true).to.have.same.deep.members(set2);
  };
  assert.notSameDeepMembers = function(set1, set2, msg) {
    new Assertion(set1, msg, assert.notSameDeepMembers, true).to.not.have.same.deep.members(set2);
  };
  assert.sameOrderedMembers = function(set1, set2, msg) {
    new Assertion(set1, msg, assert.sameOrderedMembers, true).to.have.same.ordered.members(set2);
  };
  assert.notSameOrderedMembers = function(set1, set2, msg) {
    new Assertion(set1, msg, assert.notSameOrderedMembers, true).to.not.have.same.ordered.members(set2);
  };
  assert.sameDeepOrderedMembers = function(set1, set2, msg) {
    new Assertion(set1, msg, assert.sameDeepOrderedMembers, true).to.have.same.deep.ordered.members(set2);
  };
  assert.notSameDeepOrderedMembers = function(set1, set2, msg) {
    new Assertion(set1, msg, assert.notSameDeepOrderedMembers, true).to.not.have.same.deep.ordered.members(set2);
  };
  assert.includeMembers = function(superset, subset, msg) {
    new Assertion(superset, msg, assert.includeMembers, true).to.include.members(subset);
  };
  assert.notIncludeMembers = function(superset, subset, msg) {
    new Assertion(superset, msg, assert.notIncludeMembers, true).to.not.include.members(subset);
  };
  assert.includeDeepMembers = function(superset, subset, msg) {
    new Assertion(superset, msg, assert.includeDeepMembers, true).to.include.deep.members(subset);
  };
  assert.notIncludeDeepMembers = function(superset, subset, msg) {
    new Assertion(superset, msg, assert.notIncludeDeepMembers, true).to.not.include.deep.members(subset);
  };
  assert.includeOrderedMembers = function(superset, subset, msg) {
    new Assertion(superset, msg, assert.includeOrderedMembers, true).to.include.ordered.members(subset);
  };
  assert.notIncludeOrderedMembers = function(superset, subset, msg) {
    new Assertion(superset, msg, assert.notIncludeOrderedMembers, true).to.not.include.ordered.members(subset);
  };
  assert.includeDeepOrderedMembers = function(superset, subset, msg) {
    new Assertion(superset, msg, assert.includeDeepOrderedMembers, true).to.include.deep.ordered.members(subset);
  };
  assert.notIncludeDeepOrderedMembers = function(superset, subset, msg) {
    new Assertion(superset, msg, assert.notIncludeDeepOrderedMembers, true).to.not.include.deep.ordered.members(subset);
  };
  assert.oneOf = function(inList, list, msg) {
    new Assertion(inList, msg, assert.oneOf, true).to.be.oneOf(list);
  };
  assert.isIterable = function(obj, msg) {
    if (obj == void 0 || !obj[Symbol.iterator]) {
      msg = msg ? `${msg} expected ${inspect2(obj)} to be an iterable` : `expected ${inspect2(obj)} to be an iterable`;
      throw new AssertionError(
        msg,
        void 0,
        assert.isIterable
      );
    }
  };
  assert.changes = function(fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === "function") {
      msg = prop;
      prop = null;
    }
    new Assertion(fn, msg, assert.changes, true).to.change(obj, prop);
  };
  assert.changesBy = function(fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === "function") {
      var tmpMsg = delta;
      delta = prop;
      msg = tmpMsg;
    } else if (arguments.length === 3) {
      delta = prop;
      prop = null;
    }
    new Assertion(fn, msg, assert.changesBy, true).to.change(obj, prop).by(delta);
  };
  assert.doesNotChange = function(fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === "function") {
      msg = prop;
      prop = null;
    }
    return new Assertion(fn, msg, assert.doesNotChange, true).to.not.change(obj, prop);
  };
  assert.changesButNotBy = function(fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === "function") {
      var tmpMsg = delta;
      delta = prop;
      msg = tmpMsg;
    } else if (arguments.length === 3) {
      delta = prop;
      prop = null;
    }
    new Assertion(fn, msg, assert.changesButNotBy, true).to.change(obj, prop).but.not.by(delta);
  };
  assert.increases = function(fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === "function") {
      msg = prop;
      prop = null;
    }
    return new Assertion(fn, msg, assert.increases, true).to.increase(obj, prop);
  };
  assert.increasesBy = function(fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === "function") {
      var tmpMsg = delta;
      delta = prop;
      msg = tmpMsg;
    } else if (arguments.length === 3) {
      delta = prop;
      prop = null;
    }
    new Assertion(fn, msg, assert.increasesBy, true).to.increase(obj, prop).by(delta);
  };
  assert.doesNotIncrease = function(fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === "function") {
      msg = prop;
      prop = null;
    }
    return new Assertion(fn, msg, assert.doesNotIncrease, true).to.not.increase(obj, prop);
  };
  assert.increasesButNotBy = function(fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === "function") {
      var tmpMsg = delta;
      delta = prop;
      msg = tmpMsg;
    } else if (arguments.length === 3) {
      delta = prop;
      prop = null;
    }
    new Assertion(fn, msg, assert.increasesButNotBy, true).to.increase(obj, prop).but.not.by(delta);
  };
  assert.decreases = function(fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === "function") {
      msg = prop;
      prop = null;
    }
    return new Assertion(fn, msg, assert.decreases, true).to.decrease(obj, prop);
  };
  assert.decreasesBy = function(fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === "function") {
      var tmpMsg = delta;
      delta = prop;
      msg = tmpMsg;
    } else if (arguments.length === 3) {
      delta = prop;
      prop = null;
    }
    new Assertion(fn, msg, assert.decreasesBy, true).to.decrease(obj, prop).by(delta);
  };
  assert.doesNotDecrease = function(fn, obj, prop, msg) {
    if (arguments.length === 3 && typeof obj === "function") {
      msg = prop;
      prop = null;
    }
    return new Assertion(fn, msg, assert.doesNotDecrease, true).to.not.decrease(obj, prop);
  };
  assert.doesNotDecreaseBy = function(fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === "function") {
      var tmpMsg = delta;
      delta = prop;
      msg = tmpMsg;
    } else if (arguments.length === 3) {
      delta = prop;
      prop = null;
    }
    return new Assertion(fn, msg, assert.doesNotDecreaseBy, true).to.not.decrease(obj, prop).by(delta);
  };
  assert.decreasesButNotBy = function(fn, obj, prop, delta, msg) {
    if (arguments.length === 4 && typeof obj === "function") {
      var tmpMsg = delta;
      delta = prop;
      msg = tmpMsg;
    } else if (arguments.length === 3) {
      delta = prop;
      prop = null;
    }
    new Assertion(fn, msg, assert.decreasesButNotBy, true).to.decrease(obj, prop).but.not.by(delta);
  };
  assert.ifError = function(val) {
    if (val) {
      throw val;
    }
  };
  assert.isExtensible = function(obj, msg) {
    new Assertion(obj, msg, assert.isExtensible, true).to.be.extensible;
  };
  assert.isNotExtensible = function(obj, msg) {
    new Assertion(obj, msg, assert.isNotExtensible, true).to.not.be.extensible;
  };
  assert.isSealed = function(obj, msg) {
    new Assertion(obj, msg, assert.isSealed, true).to.be.sealed;
  };
  assert.isNotSealed = function(obj, msg) {
    new Assertion(obj, msg, assert.isNotSealed, true).to.not.be.sealed;
  };
  assert.isFrozen = function(obj, msg) {
    new Assertion(obj, msg, assert.isFrozen, true).to.be.frozen;
  };
  assert.isNotFrozen = function(obj, msg) {
    new Assertion(obj, msg, assert.isNotFrozen, true).to.not.be.frozen;
  };
  assert.isEmpty = function(val, msg) {
    new Assertion(val, msg, assert.isEmpty, true).to.be.empty;
  };
  assert.isNotEmpty = function(val, msg) {
    new Assertion(val, msg, assert.isNotEmpty, true).to.not.be.empty;
  };
  (/* @__PURE__ */ __name(function alias(name, as) {
    assert[as] = assert[name];
    return alias;
  }, "alias"))("isOk", "ok")("isNotOk", "notOk")("throws", "throw")("throws", "Throw")("isExtensible", "extensible")("isNotExtensible", "notExtensible")("isSealed", "sealed")("isNotSealed", "notSealed")("isFrozen", "frozen")("isNotFrozen", "notFrozen")("isEmpty", "empty")("isNotEmpty", "notEmpty")("isCallable", "isFunction")("isNotCallable", "isNotFunction");

  // lib/chai.js
  var used = [];
  function use(fn) {
    const exports = {
      AssertionError,
      util: utils_exports,
      config,
      expect,
      assert,
      Assertion,
      ...should_exports
    };
    if (!~used.indexOf(fn)) {
      fn(exports, utils_exports);
      used.push(fn);
    }
    return exports;
  }
  __name(use, "use");
  /*!
   * Chai - flag utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - test utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - expectTypes utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - getActual utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - message composition utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - transferFlags utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * chai
   * http://chaijs.com
   * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - isProxyEnabled helper
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - addProperty utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - addLengthGuard utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - getProperties utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - proxify utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - addMethod utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - overwriteProperty utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - overwriteMethod utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - addChainingMethod utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - overwriteChainableMethod utility
   * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - compareByInspect utility
   * Copyright(c) 2011-2016 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - getOwnEnumerablePropertySymbols utility
   * Copyright(c) 2011-2016 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - getOwnEnumerableProperties utility
   * Copyright(c) 2011-2016 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * Chai - isNaN utility
   * Copyright(c) 2012-2015 Sakthipriyan Vairamani <thechargingvolcano@gmail.com>
   * MIT Licensed
   */
  /*!
   * chai
   * Copyright(c) 2011 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*!
   * chai
   * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
   * MIT Licensed
   */
  /*! Bundled license information:

  deep-eql/index.js:
    (*!
     * deep-eql
     * Copyright(c) 2013 Jake Luer <jake@alogicalparadox.com>
     * MIT Licensed
     *)
    (*!
     * Check to see if the MemoizeMap has recorded a result of the two operands
     *
     * @param {Mixed} leftHandOperand
     * @param {Mixed} rightHandOperand
     * @param {MemoizeMap} memoizeMap
     * @returns {Boolean|null} result
    *)
    (*!
     * Set the result of the equality into the MemoizeMap
     *
     * @param {Mixed} leftHandOperand
     * @param {Mixed} rightHandOperand
     * @param {MemoizeMap} memoizeMap
     * @param {Boolean} result
    *)
    (*!
     * Primary Export
     *)
    (*!
     * The main logic of the `deepEqual` function.
     *
     * @param {Mixed} leftHandOperand
     * @param {Mixed} rightHandOperand
     * @param {Object} [options] (optional) Additional options
     * @param {Array} [options.comparator] (optional) Override default algorithm, determining custom equality.
     * @param {Array} [options.memoize] (optional) Provide a custom memoization object which will cache the results of
        complex objects for a speed boost. By passing `false` you can disable memoization, but this will cause circular
        references to blow the stack.
     * @return {Boolean} equal match
    *)
    (*!
     * Compare two Regular Expressions for equality.
     *
     * @param {RegExp} leftHandOperand
     * @param {RegExp} rightHandOperand
     * @return {Boolean} result
     *)
    (*!
     * Compare two Sets/Maps for equality. Faster than other equality functions.
     *
     * @param {Set} leftHandOperand
     * @param {Set} rightHandOperand
     * @param {Object} [options] (Optional)
     * @return {Boolean} result
     *)
    (*!
     * Simple equality for flat iterable objects such as Arrays, TypedArrays or Node.js buffers.
     *
     * @param {Iterable} leftHandOperand
     * @param {Iterable} rightHandOperand
     * @param {Object} [options] (Optional)
     * @return {Boolean} result
     *)
    (*!
     * Simple equality for generator objects such as those returned by generator functions.
     *
     * @param {Iterable} leftHandOperand
     * @param {Iterable} rightHandOperand
     * @param {Object} [options] (Optional)
     * @return {Boolean} result
     *)
    (*!
     * Determine if the given object has an @@iterator function.
     *
     * @param {Object} target
     * @return {Boolean} `true` if the object has an @@iterator function.
     *)
    (*!
     * Gets all iterator entries from the given Object. If the Object has no @@iterator function, returns an empty array.
     * This will consume the iterator - which could have side effects depending on the @@iterator implementation.
     *
     * @param {Object} target
     * @returns {Array} an array of entries from the @@iterator function
     *)
    (*!
     * Gets all entries from a Generator. This will consume the generator - which could have side effects.
     *
     * @param {Generator} target
     * @returns {Array} an array of entries from the Generator.
     *)
    (*!
     * Gets all own and inherited enumerable keys from a target.
     *
     * @param {Object} target
     * @returns {Array} an array of own and inherited enumerable keys from the target.
     *)
    (*!
     * Determines if two objects have matching values, given a set of keys. Defers to deepEqual for the equality check of
     * each key. If any value of the given key is not equal, the function will return false (early).
     *
     * @param {Mixed} leftHandOperand
     * @param {Mixed} rightHandOperand
     * @param {Array} keys An array of keys to compare the values of leftHandOperand and rightHandOperand against
     * @param {Object} [options] (Optional)
     * @return {Boolean} result
     *)
    (*!
     * Recursively check the equality of two Objects. Once basic sameness has been established it will defer to `deepEqual`
     * for each enumerable key in the object.
     *
     * @param {Mixed} leftHandOperand
     * @param {Mixed} rightHandOperand
     * @param {Object} [options] (Optional)
     * @return {Boolean} result
     *)
    (*!
     * Returns true if the argument is a primitive.
     *
     * This intentionally returns true for all objects that can be compared by reference,
     * including functions and symbols.
     *
     * @param {Mixed} value
     * @return {Boolean} result
     *)
  */

  function chaiPromised(chai, utils) {
      const Assertion = chai.Assertion;
      const assert = chai.assert;
      const proxify = utils.proxify;
      //  if ((utils as any).checkError) {
      const checkError = utils.checkError;
      //  }
      function isLegacyJQueryPromise(thenable) {
          return typeof thenable.catch !== 'function' &&
              typeof thenable.always === 'function' &&
              typeof thenable.done === 'function' &&
              typeof thenable.fail === 'function' &&
              typeof thenable.pipe === 'function' &&
              typeof thenable.progress === 'function' &&
              typeof thenable.state === 'function';
      }
      function assertIsAboutPromise(assertion) {
          if (!assertion) {
              throw new TypeError(`${assertion} is not a thenable.`);
          }
          if (typeof assertion._obj.then !== 'function') {
              throw new TypeError(utils.inspect(assertion._obj) + ' is not a thenable.');
          }
          if (isLegacyJQueryPromise(assertion._obj)) {
              throw new TypeError('Chai as Promised is incompatible with thenables of jQuery<3.0.0, sorry! Please ' +
                  'upgrade jQuery or use another Promises/A+ compatible library (see ' +
                  'http://promisesaplus.com/).');
          }
      }
      function proxifyIfSupported(assertion, methodName) {
          return proxify === undefined ? assertion : proxify(assertion, methodName);
      }
      function method(name, asserter) {
          utils.addMethod(Assertion.prototype, name, function () {
              assertIsAboutPromise(this);
              return asserter.apply(this, arguments);
          });
      }
      function property(name, asserter) {
          utils.addProperty(Assertion.prototype, name, function () {
              assertIsAboutPromise(this);
              return proxifyIfSupported(asserter.apply(this, arguments), name);
          });
      }
      function doNotify(promise, done) {
          promise.then(() => {
              done();
          }, done);
      }
      function assertIfNegated(assertion, message, extra) {
          assertion.assert(true, null, message, extra.expected, extra.actual);
      }
      function assertIfNotNegated(assertion, message, extra) {
          assertion.assert(false, message, null, extra.expected, extra.actual);
      }
      function getBasePromise(assertion) {
          return typeof assertion.then === 'function' ? assertion : assertion._obj;
      }
      function getReasonName(reason) {
          return reason instanceof Error ? reason.toString() : checkError.getConstructorName(reason);
      }
      const propertyNames = Object.getOwnPropertyNames(Assertion.prototype);
      const propertyDescs = {};
      for (const name of propertyNames) {
          propertyDescs[name] = Object.getOwnPropertyDescriptor(Assertion.prototype, name);
      }
      property('fulfilled', function () {
          const derivedPromise = getBasePromise(this).then((value) => {
              assertIfNegated(this, 'expected promise not to be fulfilled but it was fulfilled with #{act}', { actual: value });
              return value;
          }, (reason) => {
              assertIfNotNegated(this, 'expected promise to be fulfilled but it was rejected with #{act}', { actual: getReasonName(reason) });
              return reason;
          });
          transferPromiseness(this, derivedPromise);
          return this;
      });
      property('rejected', function () {
          const derivedPromise = getBasePromise(this).then((value) => {
              assertIfNotNegated(this, 'expected promise to be rejected but it was fulfilled with #{act}', { actual: value });
              return value;
          }, (reason) => {
              assertIfNegated(this, 'expected promise not to be rejected but it was rejected with #{act}', { actual: getReasonName(reason) });
              // Return the reason, transforming this into a fulfillment, to allow further assertions, e.g.
              // `promise.should.be.rejected.and.eventually.equal("reason")`.
              return reason;
          });
          transferPromiseness(this, derivedPromise);
          return this;
      });
      // @ts-ignore
      method('rejectedWith', function (errorLike, errMsgMatcher, message) {
          let errorLikeName = null;
          const negate = utils.flag(this, 'negate') || false;
          // rejectedWith with that is called without arguments is
          // the same as a plain ".rejected" use.
          if (errorLike === undefined && errMsgMatcher === undefined &&
              message === undefined) {
              /* eslint-disable no-unused-expressions */
              return this.rejected;
              /* eslint-enable no-unused-expressions */
          }
          if (message !== undefined) {
              utils.flag(this, 'message', message);
          }
          if (errorLike instanceof RegExp || typeof errorLike === 'string') {
              errMsgMatcher = errorLike;
              errorLike = null;
          }
          else if (errorLike && errorLike instanceof Error) {
              errorLikeName = errorLike.toString();
          }
          else if (typeof errorLike === 'function') {
              errorLikeName = checkError.getConstructorName(errorLike);
          }
          else {
              errorLike = null;
          }
          const everyArgIsDefined = Boolean(errorLike && errMsgMatcher);
          let matcherRelation = 'including';
          if (errMsgMatcher instanceof RegExp) {
              matcherRelation = 'matching';
          }
          const derivedPromise = getBasePromise(this).then((value) => {
              let assertionMessage = null;
              let expected = null;
              if (errorLike) {
                  assertionMessage = 'expected promise to be rejected with #{exp} but it was fulfilled with #{act}';
                  expected = errorLikeName;
              }
              else if (errMsgMatcher) {
                  assertionMessage = `expected promise to be rejected with an error ${matcherRelation} #{exp} but ` +
                      `it was fulfilled with #{act}`;
                  expected = errMsgMatcher;
              }
              assertIfNotNegated(this, assertionMessage, { expected, actual: value });
              return value;
          }, (reason) => {
              const errorLikeCompatible = errorLike && (errorLike instanceof Error ?
                  checkError.compatibleInstance(reason, errorLike) :
                  checkError.compatibleConstructor(reason, errorLike));
              const errMsgMatcherCompatible = errMsgMatcher && checkError.compatibleMessage(reason, errMsgMatcher);
              const reasonName = getReasonName(reason);
              if (negate && everyArgIsDefined) {
                  if (errorLikeCompatible && errMsgMatcherCompatible) {
                      this.assert(true, null, 'expected promise not to be rejected with #{exp} but it was rejected ' +
                          'with #{act}', errorLikeName, reasonName);
                  }
              }
              else {
                  if (errorLike) {
                      this.assert(errorLikeCompatible, 'expected promise to be rejected with #{exp} but it was rejected with #{act}', 'expected promise not to be rejected with #{exp} but it was rejected ' +
                          'with #{act}', errorLikeName, reasonName);
                  }
                  if (errMsgMatcher) {
                      this.assert(errMsgMatcherCompatible, `expected promise to be rejected with an error ${matcherRelation} #{exp} but got ` +
                          `#{act}`, `expected promise not to be rejected with an error ${matcherRelation} #{exp}`, errMsgMatcher, checkError.getMessage(reason));
                  }
              }
              return reason;
          });
          transferPromiseness(this, derivedPromise);
          return this;
      });
      property('eventually', function () {
          utils.flag(this, 'eventually', true);
          return this;
      });
      // @ts-ignore
      method('notify', function (done) {
          doNotify(getBasePromise(this), done);
          return this;
      });
      // @ts-ignore
      method('become', function (value, message) {
          return this.eventually.deep.equal(value, message);
      });
      // ### `eventually`
      // We need to be careful not to trigger any getters, thus `Object.getOwnPropertyDescriptor` usage.
      const methodNames = propertyNames.filter(name => {
          return name !== 'assert' && typeof propertyDescs[name].value === 'function';
      });
      methodNames.forEach(methodName => {
          Assertion.overwriteMethod(methodName, originalMethod => function () {
              return doAsserterAsyncAndAddThen(originalMethod, this, arguments);
          });
      });
      const getterNames = propertyNames.filter(name => {
          return name !== '_obj' && typeof propertyDescs[name].get === 'function';
      });
      getterNames.forEach(getterName => {
          // Chainable methods are things like `an`, which can work both for `.should.be.an.instanceOf` and as
          // `should.be.an("object")`. We need to handle those specially.
          // @ts-ignore
          const isChainableMethod = Assertion.prototype.__methods.hasOwnProperty(getterName);
          if (isChainableMethod) {
              Assertion.overwriteChainableMethod(getterName, originalMethod => function () {
                  return doAsserterAsyncAndAddThen(originalMethod, this, arguments);
              }, 
              // @ts-ignore
              (originalGetter) => function () {
                  return doAsserterAsyncAndAddThen(originalGetter, this);
              });
          }
          else {
              Assertion.overwriteProperty(getterName, originalGetter => function () {
                  return proxifyIfSupported(doAsserterAsyncAndAddThen(originalGetter, this), getterName);
              });
          }
      });
      function doAsserterAsyncAndAddThen(asserter, assertion, args) {
          // Since we're intercepting all methods/properties, we need to just pass through if they don't want
          // `eventually`, or if we've already fulfilled the promise (see below).
          if (!utils.flag(assertion, 'eventually')) {
              asserter.apply(assertion, args);
              return assertion;
          }
          const derivedPromise = getBasePromise(assertion).then((value) => {
              // Set up the environment for the asserter to actually run: `_obj` should be the fulfillment value, and
              // now that we have the value, we're no longer in "eventually" mode, so we won't run any of this code,
              // just the base Chai code that we get to via the short-circuit above.
              // @ts-ignore
              assertion._obj = value;
              utils.flag(assertion, 'eventually', false);
              return args ? transformAsserterArgs(args) : args;
          }).then((newArgs) => {
              asserter.apply(assertion, newArgs);
              // Because asserters, for example `property`, can change the value of `_obj` (i.e. change the "object"
              // flag), we need to communicate this value change to subsequent chained asserters. Since we build a
              // promise chain paralleling the asserter chain, we can use it to communicate such changes.
              // @ts-ignore
              return assertion._obj;
          });
          transferPromiseness(assertion, derivedPromise);
          return assertion;
      }
      // ### Now use the `Assertion` framework to build an `assert` interface.
      const originalAssertMethods = Object.getOwnPropertyNames(assert).filter(propName => {
          // @ts-ignore
          return typeof assert[propName] === 'function';
      });
      assert.isFulfilled = (promise, message) => (new Assertion(promise, message)).to.be.fulfilled;
      // @ts-ignore
      assert.isRejected = (promise, errorLike, errMsgMatcher, message) => {
          const assertion = new Assertion(promise, message);
          return assertion.to.be.rejectedWith(errorLike, errMsgMatcher, message);
      };
      assert.becomes = (promise, value, message) => assert.eventually.deepEqual(promise, value, message);
      assert.doesNotBecome = (promise, value, message) => assert.eventually.notDeepEqual(promise, value, message);
      assert.eventually = {};
      originalAssertMethods.forEach((assertMethodName) => {
          assert.eventually[assertMethodName] = function (promise, ...otherArgs) {
              let customRejectionHandler;
              const message = otherArgs[assert[assertMethodName].length - 2];
              if (typeof message === 'string') {
                  customRejectionHandler = (reason) => {
                      throw new chai.AssertionError(`${message}\n\nOriginal reason: ${utils.inspect(reason)}`);
                  };
              }
              const returnedPromise = promise.then((fulfillmentValue) => assert[assertMethodName](fulfillmentValue, ...otherArgs), customRejectionHandler);
              returnedPromise.notify = (done) => {
                  doNotify(returnedPromise, done);
              };
              return returnedPromise;
          };
      });
  }
  let transferPromiseness = (assertion, promise) => {
      assertion.then = promise.then.bind(promise);
  };
  const chaiAsPromised = chaiPromised;
  let transformAsserterArgs = (values) => values;

  const should = should$1();
  use(chaiAsPromised);
  const get = url => fetch(url).then(resp => resp.arrayBuffer());
  describe('Shp', function () {
    describe('park and rides not zipped', function () {
      const pandr = getShapefile('http://localhost:3000/files/pandr');
      it('should have the right keys', function () {
        return pandr.should.eventually.contain.keys('type', 'features');
      });
      it('should be the right type', function () {
        return pandr.should.eventually.have.property('type', 'FeatureCollection');
      });
      it('should have the right number of features', function () {
        return pandr.then(function (a) { return a.features; }).should.eventually.have.length(80);
      });
    });
    describe('park and rides not zipped but with suffix', function () {
      const pandr = getShapefile('http://localhost:3000/files/pandr.shp');
      it('should have the right keys', function () {
        return pandr.should.eventually.contain.keys('type', 'features');
      });
      it('should be the right type', function () {
        return pandr.should.eventually.have.property('type', 'FeatureCollection');
      });
      it('should have the right number of features', function () {
        return pandr.then(function (a) { return a.features; }).should.eventually.have.length(80);
      });
    });
    describe('park and rides not zipped but loaded individually', async function () {
      const pandr = Promise.all([
        get('http://localhost:3000/files/pandr.shp'),
        get('http://localhost:3000/files/pandr.dbf'),
        get('http://localhost:3000/files/pandr.prj')
      ]).then(([shapefile, dbf, prj]) => getShapefile({
        shp: shapefile, dbf, prj
      }));
      it('should have the right keys', function () {
        return pandr.should.eventually.contain.keys('type', 'features');
      });
      it('should be the right type', function () {
        return pandr.should.eventually.have.property('type', 'FeatureCollection');
      });
      it('should have the right number of features', function () {
        return pandr.then(function (a) { return a.features; }).should.eventually.have.length(80);
      });
    });
    describe('park and rides zipped', function () {
      const pandr = getShapefile('http://localhost:3000/files/pandr.zip').catch(e => console.log('ERR', e));
      it('should have the right keys', function () {
        return pandr.should.eventually.contain.keys('type', 'features');
      });
      it('should be the right type', function () {
        return pandr.should.eventually.have.property('type', 'FeatureCollection');
      });
      it('should have the right number of features', function () {
        return pandr.then(function (a) { return a.features; }).should.eventually.have.length(80);
      });
    });
    describe('senate unzipped', function () {
      const pandr = getShapefile('http://localhost:3000/test/data/senate');
      it('should have the right keys', function () {
        return pandr.should.eventually.contain.keys('type', 'features');
      });
      it('should be the right type', function () {
        return pandr.should.eventually.have.property('type', 'FeatureCollection');
      });
      it('should have the right number of features', function () {
        return pandr.then(function (a) { return a.features; }).should.eventually.have.length(40);
      });
    });
    describe('mixed case zipped', function () {
      const pandr = getShapefile('http://localhost:3000/test/data/mixedcase.zip');
      it('should have the right keys', function () {
        return pandr.should.eventually.contain.keys('type', 'features');
      });
      it('should be the right type', function () {
        return pandr.should.eventually.have.property('type', 'FeatureCollection');
      });
      it('should have the right number of features', function () {
        return pandr.then(function (a) { return a.features; }).should.eventually.have.length(40);
      });
    });
    describe('senate zipped', function () {
      const pandr = getShapefile('http://localhost:3000/test/data/senate.zip');
      it('should have the right keys', function () {
        return pandr.should.eventually.contain.keys('type', 'features');
      });
      it('should be the right type', function () {
        return pandr.should.eventually.have.property('type', 'FeatureCollection');
      });
      it('should have the right number of features', function () {
        return pandr.then(function (a) { return a.features; }).should.eventually.have.length(40);
      });
    });
    describe('county unzipped', function () {
      const pandr = getShapefile('http://localhost:3000/test/data/counties');
      it('should have the right keys', function () {
        return pandr.should.eventually.contain.keys('type', 'features');
      });
      it('should be the right type', function () {
        return pandr.should.eventually.have.property('type', 'FeatureCollection');
      });
      it('should have the right number of features', function () {
        return pandr.then(function (a) { return a.features; }).should.eventually.have.length(14);
      });
    });
    describe('county zipped', function () {
      return getShapefile('http://localhost:3000/test/data/counties.zip').then(thing => {
        thing.should.contain.keys('type', 'features');
        thing.should.have.property('type', 'FeatureCollection');
        return thing.features;
      }).should.eventually.have.length(14);
    });
    describe('trains zipped', function () {
      const pandr = getShapefile('http://localhost:3000/test/data/train_stations.zip');
      it('should have the right keys', function () {
        return pandr.should.eventually.contain.keys('type', 'features');
      });
      it('should be the right type', function () {
        return pandr.should.eventually.have.property('type', 'FeatureCollection');
      });
      it('should have the right number of features', function () {
        return pandr.then(function (a) { return a.features; }).should.eventually.have.length(361);
      });
    });
    describe('trains zipped with query params', function () {
      const pandr = getShapefile('http://localhost:3000/test/data/train_stations.zip?foo=bar');
      it('should have the right keys', function () {
        return pandr.should.eventually.contain.keys('type', 'features');
      });
      it('should be the right type', function () {
        return pandr.should.eventually.have.property('type', 'FeatureCollection');
      });
      it('should have the right number of features', function () {
        return pandr.then(function (a) { return a.features; }).should.eventually.have.length(361);
      });
    });
    describe('z', function () {
      it('should work with multipoint z', function () {
        return getShapefile('http://localhost:3000/test/data/export_multipointz').then(function (resp) {
          return resp.features[0].geometry.coordinates;
        }).should.eventually.deep.equal([
          [
            -123.00000000000001,
            48.00000000000001,
            1200
          ],
          [
            -122,
            47,
            2500
          ],
          [
            -121,
            46,
            3600
          ]
        ]);
      });
      it('should work with polyline z', function () {
        return getShapefile('http://localhost:3000/test/data/export_polylinez').then(function (resp) {
          return resp.features[0].geometry.coordinates;
        }).should.eventually.deep.equal([
          [
            [
              -119.99999999999999,
              45,
              800
            ],
            [
              -119,
              44,
              1100
            ],
            [
              -118.00000000000001,
              43,
              2300
            ]
          ],
          [
            [
              -115,
              40,
              0
            ],
            [
              -114.00000000000001,
              39,
              0
            ],
            [
              -113,
              38,
              0
            ]
          ]
        ]);
      });
    });
    describe('empty attributes table', function () {
      const pandr = getShapefile('http://localhost:3000/files/empty-shp.zip');
      it('should have the right keys', function () {
        return pandr.should.eventually.contain.keys('type', 'features');
      });
      it('should be the right type', function () {
        return pandr.should.eventually.have.property('type', 'FeatureCollection');
      });
      it('should have the right number of features', function () {
        return pandr.then(function (a) { return a.features; }).should.eventually.have.length(2);
      });
    });
    describe('errors', function () {
      it('bad file should be rejected', function () {
        return getShapefile('http://localhost:3000/test/data/bad').should.be.rejected;
      });
      it('imaginary file file should be rejected', function (done) {
        getShapefile('http://localhost:3000/test/data/notthere').then(function () {
          done(true);
        }, function () {
          done();
        });
      });
      it('bad zip be rejected', function () {
        return getShapefile('http://localhost:3000/test/data/badzip.zip').should.be.rejected;
      });
      it('no shp in zip', function () {
        return getShapefile('http://localhost:3000/test/data/noshp.zip').should.be.rejected;
      });
    });
    describe('encoding', function () {
      it('should work for utf.zip', function () {
        return getShapefile('http://localhost:3000/test/data/utf.zip').then(function (item) {
          item.should.contain.keys('type', 'features');
          return item.features.map(function (feature) {
            return feature.properties.field;
          });
        }).should.eventually.deep.equal([
          '💩',
          'Hněvošický háj'
        ]);
      });
      it('should work for utf', function () {
        return getShapefile('http://localhost:3000/test/data/utf').then(function (item) {
          item.should.contain.keys('type', 'features');
          return item.features.map(function (feature) {
            return feature.properties.field;
          });
        }).should.eventually.deep.equal([
          '💩',
          'Hněvošický háj'
        ]);
      });
      it('should work for codepage.zip', function () {
        return getShapefile('http://localhost:3000/test/data/codepage.zip').then(function (item) {
          item.should.contain.keys('type', 'features');
          return item.features.map(function (feature) {
            return feature.properties.field;
          });
        }).should.eventually.deep.equal([
          '??',
          'Hněvošický háj'
        ]);
      });
      it('should work for codepage', function () {
        return getShapefile('http://localhost:3000/test/data/codepage').then(function (item) {
          item.should.contain.keys('type', 'features');
          return item.features.map(function (feature) {
            return feature.properties.field;
          });
        }).should.eventually.deep.equal([
          '??',
          'Hněvošický háj'
        ]);
      });
      it('should work for codepage individually', function () {
        return Promise.all([
          get('http://localhost:3000/test/data/codepage.shp'),
          get('http://localhost:3000/test/data/codepage.dbf'),
          get('http://localhost:3000/test/data/codepage.prj'),
          get('http://localhost:3000/test/data/codepage.cpg')
        ]).then(([shapefile, dbf, prj, cpg]) => getShapefile({
          shp: shapefile, dbf, prj, cpg
        })).then(function (item) {
          item.should.contain.keys('type', 'features');
          return item.features.map(function (feature) {
            return feature.properties.field;
          });
        }).should.eventually.deep.equal([
          '??',
          'Hněvošický háj'
        ]);
      });
      it('should work for a stupid code page', function () {
        return getShapefile('http://localhost:3000/test/data/htmlcpg').then(function (item) {
          item.should.contain.keys('type', 'features');
          return item.features.map(function (feature) {
            return feature.properties.field;
          });
        }).should.eventually.deep.equal([
          '💩',
          'Hněvošický háj'
        ]);
      });
      it('should work for a stupid prj', function () {
        return getShapefile('http://localhost:3000/test/data/htmlprj').then(function (item) {
          item.should.contain.keys('type', 'features');
          return item.features.map(function (feature) {
            return feature.properties.field;
          });
        }).should.eventually.deep.equal([
          '💩',
          'Hněvošický háj'
        ]);
      });
      it('should work for a stupid prj and query params', function () {
        return getShapefile('http://localhost:3000/test/data/htmlprj?blah=baz').then(function (item) {
          item.should.contain.keys('type', 'features');
          return item.features.map(function (feature) {
            return feature.properties.field;
          });
        }).should.eventually.deep.equal([
          '💩',
          'Hněvošický háj'
        ]);
      });
    });
    describe('misc stuff', function () {
      it('should work for a null geom', function () {
        return getShapefile('http://localhost:3000/test/data/LGA_2013_AUST').then(function (item) {
          item.should.contain.keys('type', 'features');
          item.features[4].geometry.coordinates.length.should.equal(21);
          item.features[4].properties.LGA_NAME13.should.equal('Kangaroo Island (DC)');
          return item.features.length;
        }).should.eventually.equal(13);
      });
      it('should work for with this shapfile', function () {
        return getShapefile('http://localhost:3000/test/data/T8Th4_6n.zip').then(function (item) {
          item.should.contain.keys('type', 'features');
          return item.features.length;
        }).should.eventually.equal(3);
      });
      it('should work for with this shapfile with a query param', function () {
        return getShapefile('http://localhost:3000/test/data/T8Th4_6n.zip?foo=bar').then(function (item) {
          item.should.contain.keys('type', 'features');
          return item.features.length;
        }).should.eventually.equal(3);
      });
      it('file too long', function () {
        return getShapefile('http://localhost:3000/test/data/ipra_dresden_polygon');
      });
      it('should handle missing dbf', function () {
        return getShapefile('http://localhost:3000/test/data/no-dbf').then(thing => {
          thing.should.contain.keys('type', 'features');
          thing.should.have.property('type', 'FeatureCollection');
          return thing.features;
        }).should.eventually.have.length(14);
      });
      it('should handle missing dbf in a zip', function () {
        return getShapefile('http://localhost:3000/test/data/no-dbf.zip').then(thing => {
          thing.should.contain.keys('type', 'features');
          thing.should.have.property('type', 'FeatureCollection');
          return thing.features;
        }).should.eventually.have.length(14);
      });
      it('should work with a line that has zero points', function () {
        return getShapefile('http://localhost:3000/test/data/zero-len-line.zip').then(thing => {
          thing.should.contain.keys('type', 'features');
          thing.should.have.property('type', 'FeatureCollection');
          should.equal(thing.features[1].geometry, null);
          return thing.features;
        }).should.eventually.have.length(3);
      });
      it('should handle .mshp files', function () {
        return getShapefile('http://localhost:3000/test/data/qgis.zip').then(thing => {
          thing.should.contain.keys('type', 'features');
          thing.should.have.property('type', 'FeatureCollection');
          return thing.features;
        }).should.eventually.have.length(2);
      });
      it('should handle weirdly ordered rings', function () {
        return getShapefile('http://localhost:3000/test/data/SHP_Exclude.zip').then(thing => {
          thing.should.contain.keys('type', 'features');
          thing.should.have.property('type', 'FeatureCollection');
          return thing.features[0].geometry.coordinates;
        }).should.eventually.have.length(2);
      });
      it('should handle files that lie about their length', function () {
        return getShapefile('http://localhost:3000/test/data/badlen.zip').then(thing => {
          thing.should.contain.keys('type', 'features');
          thing.should.have.property('type', 'FeatureCollection');
          return thing.features;
        }).should.eventually.have.length(203);
      });
    });
  });

})();
