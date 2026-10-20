/* ============================================================================
 *  Ñ sin runtime — el eDSL «fecha» (src/08-edsl-fecha.js), en C.
 *  Se incluye desde nrt.c, después de nrt_formato.inc (usa js_si, js_max2…).
 *
 *  Una fecha de Ñ no tiene zona horaria: son milisegundos que siempre se leen
 *  en UTC. La VM usa Date.UTC y los getUTC… de JavaScript; aquí están hechos a
 *  mano con las mismas reglas del estándar (MakeDay, MakeTime, TimeClip, y los
 *  años 0–99 de Date.UTC, que son 1900–1999), así que dan los mismos números.
 *  El reloj local solo se mira en «hoy» y «ahora», una vez, al nacer la fecha.
 * ========================================================================== */
#include <time.h>

#define DIA_MS 86400000.0
static NV n_fecha(double ms) { NFecha* f = (NFecha*)n_objeto(sizeof(NFecha), NC_FECHA); f->ms = ms; return n_obj((NObj*)f); }
static double fe_ms(NV v) { return ((NFecha*)v.u.o)->ms; }

static const char* const FE_MESES[] = { "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre" };
static const char* const FE_DIAS[] = { "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo" };
static const char* const FE_MES_CORTO[] = { "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic" };
static const char* const FE_DIA_CORTO[] = { "lun", "mar", "mié", "jue", "vie", "sáb", "dom" };

static int fe_bisiesto(double a) { return (fmod(a, 4) == 0 && fmod(a, 100) != 0) || fmod(a, 400) == 0; }
static double fe_dias_mes(double a, double m) {   /* m de 0 a 11; fuera de ahí, NaN (undefined en la VM) */
  static const int D[] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
  if (!(m >= 0 && m <= 11) || m != trunc(m)) return NAN;
  return m == 1 && fe_bisiesto(a) ? 29 : D[(int)m];
}
static double ent_inf(double x) { return isnan(x) ? 0 : trunc(x) + 0.0; }   /* ToIntegerOrInfinity */
static double fe_dias_civil(double y, double m, double d) {   /* m de 1 a 12 */
  int64_t Y = (int64_t)y - (m <= 2), M = (int64_t)m;
  int64_t era = (Y >= 0 ? Y : Y - 399) / 400;
  int64_t yoe = Y - era * 400;
  int64_t doy = (153 * (M + (M > 2 ? -3 : 9)) + 2) / 5;
  int64_t doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return (double)(era * 146097 + doe - 719468) + d - 1;
}
static double fe_make_day(double y, double m, double d) {
  if (!isfinite(y) || !isfinite(m) || !isfinite(d)) return NAN;
  y = ent_inf(y); m = ent_inf(m); d = ent_inf(d);
  double ym = y + floor(m / 12), mn = fmod(m, 12); if (mn < 0) mn += 12;
  if (fabs(ym) > 400000) return NAN;   /* muy fuera del rango de una fecha: TimeClip lo dejaría en NaN */
  return fe_dias_civil(ym, mn + 1, d);
}
static double fe_make_time(double h, double mi, double s, double ms) {
  if (!isfinite(h) || !isfinite(mi) || !isfinite(s) || !isfinite(ms)) return NAN;
  return ent_inf(h) * 3600000.0 + ent_inf(mi) * 60000.0 + ent_inf(s) * 1000.0 + ent_inf(ms);
}
static double fe_clip(double t) {   /* TimeClip */
  if (!isfinite(t) || fabs(t) > 8.64e15) return NAN;
  return ent_inf(t);
}
/* Date.UTC(a, m, d, h, mi, s, ms) */
static double fe_utc(double a, double m, double d, double h, double mi, double s, double ms) {
  if (!isnan(a)) { double ai = ent_inf(a); if (ai >= 0 && ai <= 99) a = 1900 + ai; }
  double dia = fe_make_day(a, m, d), t = fe_make_time(h, mi, s, ms);
  double r = dia * DIA_MS + t;
  return fe_clip(r);
}
static double o0(double x) { return x == 0 || isnan(x) ? 0 : x; }   /* «x || 0» */
static double fe_msDe(double a, double m, double d, double h, double mi, double s, double ms) {
  return fe_utc(a, m, d, o0(h), o0(mi), o0(s), o0(ms));
}
static double fe_msDe3(double a, double m, double d) { return fe_utc(a, m, d, 0, 0, 0, 0); }

typedef struct { double a, m, d, h, mi, s, ms, sem; } FePartes;   /* m de 0 a 11; sem: lunes = 0 */
static FePartes fe_partes(double ms) {
  FePartes p; double t = fe_clip(ms);
  if (isnan(t)) { p.a = p.m = p.d = p.h = p.mi = p.s = p.ms = p.sem = NAN; return p; }
  double dia = floor(t / DIA_MS), dentro = t - dia * DIA_MS;
  int64_t z = (int64_t)dia + 719468;
  int64_t era = (z >= 0 ? z : z - 146096) / 146097;
  int64_t doe = z - era * 146097;
  int64_t yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  int64_t y = yoe + era * 400;
  int64_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  int64_t mp = (5 * doy + 2) / 153;
  int64_t d = doy - (153 * mp + 2) / 5 + 1;
  int64_t m = mp < 10 ? mp + 3 : mp - 9;
  y += (m <= 2);
  p.a = (double)y; p.m = (double)(m - 1); p.d = (double)d;
  p.h = floor(dentro / 3600000); p.mi = floor(fmod(dentro, 3600000) / 60000);
  p.s = floor(fmod(dentro, 60000) / 1000); p.ms = fmod(dentro, 1000);
  double wd = fmod(dia + 4, 7); if (wd < 0) wd += 7;   /* 1970-01-01 fue jueves */
  p.sem = fmod(wd + 6, 7);
  return p;
}
/* String(n).padStart(an, '0') */
static void fe_dd(NBuf* b, double n, int an) {
  char s[64]; num_js(n, s); int L = (int)strlen(s);
  for (int i = L; i < an; i++) b_c(b, '0');
  b_utf8(b, s);
}
static void iso_de_fecha(NBuf* b, double ms) {
  FePartes p = fe_partes(ms);
  fe_dd(b, p.a, 4); b_c(b, '-'); fe_dd(b, p.m + 1, 2); b_c(b, '-'); fe_dd(b, p.d, 2);
  if (!js_si(p.h) && !js_si(p.mi) && !js_si(p.s) && !js_si(p.ms)) return;
  b_c(b, ' '); fe_dd(b, p.h, 2); b_c(b, ':'); fe_dd(b, p.mi, 2); b_c(b, ':'); fe_dd(b, p.s, 2);
  if (js_si(p.ms)) { b_c(b, '.'); fe_dd(b, p.ms, 3); }
}

static int exige_fecha(NV v, int k, const char* f, NV* err) {
  if (n_es(v, NC_FECHA)) return 1;
  *err = ERR("«%s»: el argumento %d debe ser una fecha y es %s", f, (long long)k, n_tipo_de(v)); return 0;
}
#define FCH(var, k, f) double var; do { NV v_ = FA(k), e_; if (!exige_fecha(v_, (k) + 1, f, &e_)) return e_; var = fe_ms(v_); } while (0)
static NV fe_valida(double a, double m, double d, const char* f) {   /* nulo si vale; el error si no */
  if (m < 1 || m > 12) return ERRP(T("los meses van de 1 a 12"), "«%s»: el mes %j no existe", f, m);
  double max = fe_dias_mes(a, m - 1);
  if (d < 1 || d > max) {
    NV pista = msg("ese mes tiene %j días", max);
    const char* nm = (m >= 1 && m <= 12) ? FE_MESES[(int)m - 1] : "undefined";
    return ERRP(pista, "«%s»: %j no es un día de %s de %j", f, d, nm, a);
  }
  return n_nulo();
}
#define VALIDA(a, m, d, f) do { NV e_ = fe_valida(a, m, d, f); if (N_FALLO(e_)) return e_; } while (0)

/* ── construir ──────────────────────────────────────────────────────────── */
NAT(fe_fecha) {
  (void)n; (void)extra; FENT(an, 0, "fecha"); FENT(m, 1, "fecha"); FENT(d, 2, "fecha");
  VALIDA(an, m, d, "fecha");
  return n_fecha(fe_msDe3(an, m - 1, d));
}
NAT(fe_fechaHora) {
  (void)extra;
  if (n < 5) return n_error("«fechaHora» necesita al menos año, mes, día, hora y minuto", NULL);
  FENT(an, 0, "fechaHora"); FENT(m, 1, "fechaHora"); FENT(d, 2, "fechaHora");
  VALIDA(an, m, d, "fechaHora");
  FENT(h, 3, "fechaHora"); FENT(mi, 4, "fechaHora");
  double s = 0; if (n > 5) { FENT(q, 5, "fechaHora"); s = q; }
  return n_fecha(fe_msDe(an, m - 1, d, h, mi, s, 0));
}
static struct tm fe_local(void) {
  time_t t = time(NULL); struct tm r;
#ifdef _WIN32
  r = *localtime(&t);   /* localtime_s no está en todas las mingw */
#else
  localtime_r(&t, &r);
#endif
  return r;
}
NAT(fe_hoy) { SIN_USO; struct tm l = fe_local(); return n_fecha(fe_msDe3(l.tm_year + 1900, l.tm_mon, l.tm_mday)); }
NAT(fe_ahora) { SIN_USO; struct tm l = fe_local(); return n_fecha(fe_msDe(l.tm_year + 1900, l.tm_mon, l.tm_mday, l.tm_hour, l.tm_min, l.tm_sec, 0)); }
/* lee entre min y max dígitos ASCII; el siguiente no puede ser un dígito */
static int fe_digitos(const uint16_t* s, int64_t n, int64_t* i, int min, int max, double* v) {
  int k = 0; double x = 0;
  while (*i < n && k < max && s[*i] >= '0' && s[*i] <= '9') { x = x * 10 + (s[*i] - '0'); (*i)++; k++; }
  if (k < min || (*i < n && s[*i] >= '0' && s[*i] <= '9')) return 0;
  *v = x; return 1;
}
static int fe_leer_hora(const uint16_t* s, int64_t n, int64_t* i, double* h, double* mi, double* sg) {   /* (\d{1,2}):(\d{2})(?::(\d{2}))?$ */
  if (!fe_digitos(s, n, i, 1, 2, h) || *i >= n || s[*i] != ':') return 0;
  (*i)++;
  if (!fe_digitos(s, n, i, 2, 2, mi)) return 0;
  if (*i < n && s[*i] == ':') { (*i)++; if (!fe_digitos(s, n, i, 2, 2, sg)) return 0; }
  return *i == n;
}
NAT(fe_aFecha) {
  (void)n; (void)extra; TXT(a[0], 1, "aFecha");
  NV st = recortar_js(a[0], 1, 1); NTexto* t = TX(st); const uint16_t* s = t->s; int64_t L = t->n;
  double an = 0, me = 0, d = 0, h = 0, mi = 0, sg = 0; int ok = 0;
  { /* 2026-09-29, y opcionalmente « 14:30» o «T14:30:05» */
    int64_t i = 0;
    if (fe_digitos(s, L, &i, 4, 4, &an) && i < L && s[i] == '-' && (i++, fe_digitos(s, L, &i, 1, 2, &me)) && i < L && s[i] == '-' &&
        (i++, fe_digitos(s, L, &i, 1, 2, &d))) {
      if (i == L) ok = 1;
      else if (s[i] == 'T' || s[i] == ' ') { i++; double hh = 0, mm = 0, ss = 0; if (fe_leer_hora(s, L, &i, &hh, &mm, &ss)) { ok = 1; h = hh; mi = mm; sg = ss; } }
    }
  }
  if (!ok) { /* 29/09/2026, y opcionalmente « 14:30» */
    int64_t i = 0; double x = 0, y = 0, z = 0;
    if (fe_digitos(s, L, &i, 1, 2, &x) && i < L && s[i] == '/' && (i++, fe_digitos(s, L, &i, 1, 2, &y)) && i < L && s[i] == '/' &&
        (i++, fe_digitos(s, L, &i, 4, 4, &z))) {
      if (i == L) ok = 1;
      else if (s[i] == ' ') { i++; double hh = 0, mm = 0, ss = 0; if (fe_leer_hora(s, L, &i, &hh, &mm, &ss)) { ok = 1; h = hh; mi = mm; sg = ss; } }
      if (ok) { an = z; me = y; d = x; }
    }
  }
  if (!ok) { NV r = ERRP(T("formatos que lee: 2026-09-29 · 2026-09-29 14:30 · 29/09/2026"), "«aFecha»: no entiendo «%v»", st); n_dec(st); return r; }
  n_dec(st);
  VALIDA(an, me, d, "aFecha");
  return n_fecha(fe_msDe(an, me - 1, d, h, mi, sg, 0));
}
NAT(fe_desdeMarca) { (void)n; (void)extra; FENT(x, 0, "desdeMarca"); return n_fecha(x); }

/* ── leer las partes ────────────────────────────────────────────────────── */
#define FE_LEER(nombre, expr) NAT(fe_##nombre) { (void)n; (void)extra; FCH(ms, 0, #nombre); FePartes p = fe_partes(ms); return n_num(expr); }
FE_LEER(anio, p.a) FE_LEER(mes, p.m + 1) FE_LEER(dia, p.d) FE_LEER(hora, p.h) FE_LEER(minuto, p.mi) FE_LEER(segundo, p.s)
FE_LEER(diaSemana, p.sem + 1) FE_LEER(trimestre, floor(p.m / 3) + 1)
NAT(fe_diaDelAnio) {
  (void)n; (void)extra; FCH(ms, 0, "diaDelAnio"); FePartes p = fe_partes(ms);
  return n_num(round_js((fe_msDe3(p.a, p.m, p.d) - fe_msDe3(p.a, 0, 1)) / DIA_MS) + 1);
}
NAT(fe_semana) {
  (void)n; (void)extra; FCH(ms, 0, "semana"); FePartes p = fe_partes(ms);
  double jue = fe_msDe3(p.a, p.m, p.d + (3 - p.sem));
  double ene1 = fe_partes(jue).a;
  return n_num(floor((jue - fe_msDe3(ene1, 0, 1)) / (7 * DIA_MS)) + 1);
}
static NV fe_de_tabla(const char* const* t, double i, int n) { return (i >= 0 && i < n && i == trunc(i)) ? T(t[(int)i]) : n_nulo(); }   /* undefined → nulo, como en la VM */
#define FE_NOMBRA(nombre, tabla, idx, k) NAT(fe_##nombre) { (void)n; (void)extra; FCH(ms, 0, #nombre); FePartes p = fe_partes(ms); return fe_de_tabla(tabla, idx, k); }
FE_NOMBRA(nombreMes, FE_MESES, p.m, 12) FE_NOMBRA(nombreDia, FE_DIAS, p.sem, 7)
FE_NOMBRA(mesCorto, FE_MES_CORTO, p.m, 12) FE_NOMBRA(diaCorto, FE_DIA_CORTO, p.sem, 7)

/* ── mover ──────────────────────────────────────────────────────────────── */
#define FE_MUEVE(nombre, u) NAT(fe_##nombre) { (void)n; (void)extra; FCH(ms, 0, #nombre); FENT(k, 1, #nombre); return n_fecha(ms + k * (u)); }
FE_MUEVE(sumarSegundos, 1000.0) FE_MUEVE(sumarMinutos, 60000.0) FE_MUEVE(sumarHoras, 3600000.0)
FE_MUEVE(sumarDias, DIA_MS) FE_MUEVE(sumarSemanas, 7 * DIA_MS)
static NV fe_mover_meses(double ms, double k) {
  FePartes p = fe_partes(ms);
  double total = p.a * 12 + p.m + k;
  double an = floor(total / 12), m = fmod(fmod(total, 12) + 12, 12);
  return n_fecha(fe_msDe(an, m, js_min2(p.d, fe_dias_mes(an, m)), p.h, p.mi, p.s, p.ms));
}
NAT(fe_sumarMeses) { (void)n; (void)extra; FCH(ms, 0, "sumarMeses"); FENT(k, 1, "sumarMeses"); return fe_mover_meses(ms, k); }
NAT(fe_sumarAnios) { (void)n; (void)extra; FCH(ms, 0, "sumarAnios"); FENT(k, 1, "sumarAnios"); return fe_mover_meses(ms, k * 12); }

/* ── bordes ─────────────────────────────────────────────────────────────── */
#define FE_BORDE(nombre, expr) NAT(fe_##nombre) { (void)n; (void)extra; FCH(ms, 0, #nombre); FePartes p = fe_partes(ms); return n_fecha(expr); }
FE_BORDE(inicioDia, fe_msDe3(p.a, p.m, p.d))
FE_BORDE(finDia, fe_msDe(p.a, p.m, p.d, 23, 59, 59, 999))
FE_BORDE(inicioSemana, fe_msDe3(p.a, p.m, p.d - p.sem))
FE_BORDE(finSemana, fe_msDe(p.a, p.m, p.d + (6 - p.sem), 23, 59, 59, 999))
FE_BORDE(inicioMes, fe_msDe3(p.a, p.m, 1))
FE_BORDE(finMes, fe_msDe(p.a, p.m, fe_dias_mes(p.a, p.m), 23, 59, 59, 999))
FE_BORDE(inicioAnio, fe_msDe3(p.a, 0, 1))
FE_BORDE(finAnio, fe_msDe(p.a, 11, 31, 23, 59, 59, 999))

/* ── medir distancias: tiempo transcurrido, truncado hacia cero ─────────── */
#define FE_MIDE(nombre, u) NAT(fe_##nombre) { (void)n; (void)extra; FCH(b, 1, #nombre); FCH(x, 0, #nombre); return n_num(trunc((b - x) / (u)) + 0.0); }
FE_MIDE(segundosEntre, 1000.0) FE_MIDE(minutosEntre, 60000.0) FE_MIDE(horasEntre, 3600000.0) FE_MIDE(diasEntre, DIA_MS)
static double fe_meses(double x, double y) {
  FePartes p = fe_partes(x), q = fe_partes(y);
  double k = (q.a - p.a) * 12 + (q.m - p.m);
  double hp = p.h * 3600000 + p.mi * 60000 + p.s * 1000 + p.ms, hq = q.h * 3600000 + q.mi * 60000 + q.s * 1000 + q.ms;
  int rel = q.d != p.d ? (q.d > p.d ? 1 : -1) : (hq == hp ? 0 : (hq > hp ? 1 : -1));
  if (k > 0 && rel < 0) k--;
  else if (k < 0 && rel > 0) k++;
  return k;
}
NAT(fe_mesesEntre) { (void)n; (void)extra; FCH(x, 0, "mesesEntre"); FCH(y, 1, "mesesEntre"); return n_num(fe_meses(x, y)); }
NAT(fe_aniosEntre) { (void)n; (void)extra; FCH(x, 0, "aniosEntre"); FCH(y, 1, "aniosEntre"); return n_num(trunc(fe_meses(x, y) / 12) + 0.0); }
NAT(fe_duracion) {
  (void)n; (void)extra; FCH(y, 1, "duracion"); FCH(x, 0, "duracion");
  double ms = fabs(y - x);
  double dd = trunc(ms / DIA_MS) + 0.0; ms = fmod(ms, DIA_MS);
  double hh = trunc(ms / 3600000) + 0.0; ms = fmod(ms, 3600000);
  double mm = trunc(ms / 60000) + 0.0; ms = fmod(ms, 60000);
  double ss = trunc(ms / 1000) + 0.0;
  NV kv[8] = { T("dias"), n_num(dd), T("horas"), n_num(hh), T("minutos"), n_num(mm), T("segundos"), n_num(ss) };
  NV d = n_dic_de(kv, 4);
  n_dec(kv[0]); n_dec(kv[2]); n_dec(kv[4]); n_dec(kv[6]);
  return d;
}

/* ── preguntar ──────────────────────────────────────────────────────────── */
NAT(fe_esBisiesto) { (void)n; (void)extra; FCH(ms, 0, "esBisiesto"); return n_bool(fe_bisiesto(fe_partes(ms).a)); }
NAT(fe_diasDelMes) { (void)n; (void)extra; FCH(ms, 0, "diasDelMes"); FePartes p = fe_partes(ms); return n_num(fe_dias_mes(p.a, p.m)); }
NAT(fe_esFinDeSemana) { (void)n; (void)extra; FCH(ms, 0, "esFinDeSemana"); return n_bool(fe_partes(ms).sem >= 5); }
NAT(fe_esMismoDia) {
  (void)n; (void)extra; FCH(x, 0, "esMismoDia"); FCH(y, 1, "esMismoDia");
  FePartes p = fe_partes(x), q = fe_partes(y);
  return n_bool(p.a == q.a && p.m == q.m && p.d == q.d);
}
NAT(fe_estaEntre) {
  (void)n; (void)extra; FCH(x, 0, "estaEntre"); FCH(d, 1, "estaEntre"); FCH(h, 2, "estaEntre");
  return n_bool(x >= js_min2(d, h) && x <= js_max2(d, h));
}
NAT(fe_esAntesDe) { (void)n; (void)extra; FCH(x, 0, "esAntesDe"); FCH(y, 1, "esAntesDe"); return n_bool(x < y); }
NAT(fe_esDespuesDe) { (void)n; (void)extra; FCH(x, 0, "esDespuesDe"); FCH(y, 1, "esDespuesDe"); return n_bool(x > y); }

/* ── sacarla ────────────────────────────────────────────────────────────── */
static void fe_tabla_en(NBuf* b, const char* const* t, double i, int n) { if (i >= 0 && i < n && i == trunc(i)) b_utf8(b, t[(int)i]); else b_utf8(b, "undefined"); }
NAT(fe_deFecha) {
  (void)extra; FCH(ms, 0, "deFecha"); FePartes p = fe_partes(ms);
  NV forma; if (n > 1) { FTXT(1, "deFecha"); forma = n_inc(a[1]); } else forma = T("iso");
  char f8[16] = ""; { int64_t L; char* u = n_a_utf8(forma, &L); if (L < (int64_t)sizeof f8) memcpy(f8, u, (size_t)L + 1); free(u); }
  NBuf b = {0};
  if (!strcmp(f8, "iso")) iso_de_fecha(&b, ms);
  else if (!strcmp(f8, "corta")) { fe_dd(&b, p.d, 2); b_c(&b, '/'); fe_dd(&b, p.m + 1, 2); b_c(&b, '/'); b_num(&b, p.a); }
  else if (!strcmp(f8, "larga")) { b_num(&b, p.d); b_utf8(&b, " de "); fe_tabla_en(&b, FE_MESES, p.m, 12); b_utf8(&b, " de "); b_num(&b, p.a); }
  else if (!strcmp(f8, "mes")) { fe_tabla_en(&b, FE_MESES, p.m, 12); b_utf8(&b, " de "); b_num(&b, p.a); }
  else if (!strcmp(f8, "hora")) { fe_dd(&b, p.h, 2); b_c(&b, ':'); fe_dd(&b, p.mi, 2); }
  else if (!strcmp(f8, "completa")) {
    fe_tabla_en(&b, FE_DIAS, p.sem, 7); b_utf8(&b, ", "); b_num(&b, p.d); b_utf8(&b, " de "); fe_tabla_en(&b, FE_MESES, p.m, 12);
    b_utf8(&b, " de "); b_num(&b, p.a); b_utf8(&b, ", "); fe_dd(&b, p.h, 2); b_c(&b, ':'); fe_dd(&b, p.mi, 2);
  } else {
    free(b.s);
    NV r = ERRP(T("formatos: iso · corta · larga · mes · hora · completa"), "«deFecha»: no conozco el formato «%v»", forma);
    n_dec(forma); return r;
  }
  n_dec(forma);
  return b_texto(&b);
}
NAT(fe_aIso) { (void)n; (void)extra; FCH(ms, 0, "aIso"); NBuf b = {0}; iso_de_fecha(&b, ms); return b_texto(&b); }
NAT(fe_aMarca) { (void)n; (void)extra; FCH(ms, 0, "aMarca"); return n_num(ms); }

#define NAT_FECHA \
  { "fecha/fecha", 3, fe_fecha }, { "fecha/fechaHora", -1, fe_fechaHora }, { "fecha/hoy", 0, fe_hoy }, { "fecha/ahora", 0, fe_ahora }, \
  { "fecha/aFecha", 1, fe_aFecha }, { "fecha/desdeMarca", 1, fe_desdeMarca }, \
  { "fecha/anio", 1, fe_anio }, { "fecha/mes", 1, fe_mes }, { "fecha/dia", 1, fe_dia }, { "fecha/hora", 1, fe_hora }, \
  { "fecha/minuto", 1, fe_minuto }, { "fecha/segundo", 1, fe_segundo }, { "fecha/diaSemana", 1, fe_diaSemana }, \
  { "fecha/trimestre", 1, fe_trimestre }, { "fecha/diaDelAnio", 1, fe_diaDelAnio }, { "fecha/semana", 1, fe_semana }, \
  { "fecha/nombreMes", 1, fe_nombreMes }, { "fecha/nombreDia", 1, fe_nombreDia }, { "fecha/mesCorto", 1, fe_mesCorto }, \
  { "fecha/diaCorto", 1, fe_diaCorto }, \
  { "fecha/sumarSegundos", 2, fe_sumarSegundos }, { "fecha/sumarMinutos", 2, fe_sumarMinutos }, { "fecha/sumarHoras", 2, fe_sumarHoras }, \
  { "fecha/sumarDias", 2, fe_sumarDias }, { "fecha/sumarSemanas", 2, fe_sumarSemanas }, { "fecha/sumarMeses", 2, fe_sumarMeses }, \
  { "fecha/sumarAnios", 2, fe_sumarAnios }, \
  { "fecha/inicioDia", 1, fe_inicioDia }, { "fecha/finDia", 1, fe_finDia }, { "fecha/inicioSemana", 1, fe_inicioSemana }, \
  { "fecha/finSemana", 1, fe_finSemana }, { "fecha/inicioMes", 1, fe_inicioMes }, { "fecha/finMes", 1, fe_finMes }, \
  { "fecha/inicioAnio", 1, fe_inicioAnio }, { "fecha/finAnio", 1, fe_finAnio }, \
  { "fecha/segundosEntre", 2, fe_segundosEntre }, { "fecha/minutosEntre", 2, fe_minutosEntre }, { "fecha/horasEntre", 2, fe_horasEntre }, \
  { "fecha/diasEntre", 2, fe_diasEntre }, { "fecha/mesesEntre", 2, fe_mesesEntre }, { "fecha/aniosEntre", 2, fe_aniosEntre }, \
  { "fecha/duracion", 2, fe_duracion }, \
  { "fecha/esBisiesto", 1, fe_esBisiesto }, { "fecha/diasDelMes", 1, fe_diasDelMes }, { "fecha/esFinDeSemana", 1, fe_esFinDeSemana }, \
  { "fecha/esMismoDia", 2, fe_esMismoDia }, { "fecha/estaEntre", 3, fe_estaEntre }, { "fecha/esAntesDe", 2, fe_esAntesDe }, \
  { "fecha/esDespuesDe", 2, fe_esDespuesDe }, \
  { "fecha/deFecha", -1, fe_deFecha }, { "fecha/aIso", 1, fe_aIso }, { "fecha/aMarca", 1, fe_aMarca },
