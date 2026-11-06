/* ============================================================================
 *  (motor-exp A6) El eDSL «sistema» y lo que lo rodea, en el ejecutable nativo:
 *  rutas, carpeta actual, información del sistema, copiar/mover/listar, leerLineas
 *  (un generador), ejecutar y ejecutarEnFondo (un hilo + el bucle de eventos),
 *  JSON, temporizadores (luego/cada/detener), y los errores de lo que solo existe
 *  con una página o un almacén.
 *
 *  Cada función dice lo mismo que su par de src/04-stdlib.js + util/n-node.js
 *  (el anfitrión de Node): mismos mensajes, mismos códigos (ENOENT…), mismo orden
 *  de claves. Lo que Node hace con path.* aquí se hace con el mismo algoritmo.
 *  Windows: el código está, y no se ha probado ahí (no hay dónde correrlo).
 * ========================================================================== */
#include <errno.h>
#include <sys/stat.h>
#include <sys/types.h>
#if defined(_WIN32)
#include <direct.h>
#include <process.h>
#else
#include <dirent.h>
#include <fcntl.h>
#include <pthread.h>
#include <signal.h>
#include <sys/wait.h>
#include <sys/utsname.h>
#include <pwd.h>
extern char** environ;
#endif

/* ── pequeños ayudantes ──────────────────────────────────────────────────── */
static char* sx_dup(const char* s) { size_t l = strlen(s); char* r = (char*)n_mem(l + 1); memcpy(r, s, l + 1); return r; }
static char* sx_cat(const char* a, const char* b) { size_t la = strlen(a), lb = strlen(b); char* r = (char*)n_mem(la + lb + 1); memcpy(r, a, la); memcpy(r + la, b, lb + 1); return r; }
static void dic_pon(NV d, const char* k, NV v) { NV kk = n_texto_utf8(k); n_dic_poner(DC(d), kk, v); n_dec(kk); n_dec(v); }
static const char* errno_nombre(int e) {
  switch (e) {
    case ENOENT: return "ENOENT"; case EACCES: return "EACCES"; case EEXIST: return "EEXIST"; case ENOTDIR: return "ENOTDIR"; case EISDIR: return "EISDIR";
    case ENOTEMPTY: return "ENOTEMPTY"; case EXDEV: return "EXDEV"; case EPERM: return "EPERM"; case EINVAL: return "EINVAL"; case EBUSY: return "EBUSY";
    case ENOSPC: return "ENOSPC"; case EMFILE: return "EMFILE"; case ENAMETOOLONG: return "ENAMETOOLONG"; case EROFS: return "EROFS";
#ifdef ELOOP
    case ELOOP: return "ELOOP";
#endif
    default: return "UNKNOWN";
  }
}
/* el error de n-node: «QUIEN»: MENSAJE (CODIGO), del tipo «archivo» */
static NV err_arch_c(const char* quien, const char* que, const char* ruta, const char* otra, const char* codigo) {
  char* r = sx_dup(que);
  NBuf b = {0};
  b_utf8(&b, "\xC2\xAB"); b_utf8(&b, quien); b_utf8(&b, "\xC2\xBB: "); b_utf8(&b, r); b_c(&b, ' '); b_utf8(&b, ruta);
  if (otra) { b_utf8(&b, " a "); b_utf8(&b, otra); }
  b_utf8(&b, " ("); b_utf8(&b, codigo); b_c(&b, ')');
  free(r);
  return error_tipo("archivo", b_texto(&b));
}
static NV err_sis_c(const char* quien, const char* mensaje) {
  char t[1024]; snprintf(t, sizeof t, "\xC2\xAB%s\xC2\xBB: %s", quien, mensaje);
  return error_tipo("sistema", n_texto_utf8(t));
}

/* ═══════════════════════════════════════════════════════════════ rutas */
/* El mismo algoritmo que path.posix de Node. En Windows se pasa a «/» para calcular y se vuelve a «\»; la unidad («C:») se aparta. */
#if defined(_WIN32)
#define SX_WIN 1
#endif
typedef struct { char pre[4]; int abs; } SxPre;
static char* sx_entra(const char* p, SxPre* pre) {   /* → ruta con «/» y sin unidad */
  char* r = sx_dup(p);
  pre->pre[0] = 0; pre->abs = 0;
#ifdef SX_WIN
  for (char* q = r; *q; q++) if (*q == '\\') *q = '/';
  if (((r[0] >= 'a' && r[0] <= 'z') || (r[0] >= 'A' && r[0] <= 'Z')) && r[1] == ':') { pre->pre[0] = r[0]; pre->pre[1] = ':'; pre->pre[2] = 0; memmove(r, r + 2, strlen(r + 2) + 1); }
#endif
  return r;
}
static char* sx_sale(char* r, const SxPre* pre) {     /* vuelve a la forma del sistema */
#ifdef SX_WIN
  for (char* q = r; *q; q++) if (*q == '/') *q = '\\';
  if (pre->pre[0]) { char* s = sx_cat(pre->pre, r); free(r); return s; }
#else
  (void)pre;
#endif
  return r;
}
/* normalizeString de Node */
static char* sx_normstr(const char* path, int sobreRaiz) {
  size_t len = strlen(path);
  char* res = (char*)n_mem(len + 8); size_t rl = 0; res[0] = 0;
  long lastSeg = 0, lastSlash = -1; int dots = 0; char code = 0;
  for (size_t i = 0; i <= len; ++i) {
    if (i < len) code = path[i]; else if (code == '/') break; else code = '/';
    if (code == '/') {
      if (lastSlash == (long)i - 1 || dots == 1) { /* nada */ }
      else if (dots == 2) {
        if (rl < 2 || lastSeg != 2 || res[rl - 1] != '.' || res[rl - 2] != '.') {
          if (rl > 2) {
            long ls = -1; for (long k = (long)rl - 1; k >= 0; k--) if (res[k] == '/') { ls = k; break; }
            if (ls == -1) { rl = 0; lastSeg = 0; }
            else { rl = (size_t)ls; long l2 = -1; for (long k = (long)rl - 1; k >= 0; k--) if (res[k] == '/') { l2 = k; break; } lastSeg = (long)rl - 1 - l2; }
            res[rl] = 0; lastSlash = (long)i; dots = 0; continue;
          } else if (rl != 0) { rl = 0; res[0] = 0; lastSeg = 0; lastSlash = (long)i; dots = 0; continue; }
        }
        if (sobreRaiz) { if (rl > 0) { res[rl++] = '/'; } res[rl++] = '.'; res[rl++] = '.'; res[rl] = 0; lastSeg = 2; }
      } else {
        if (rl > 0) res[rl++] = '/';
        size_t a = (size_t)(lastSlash + 1), n2 = i - a;
        memcpy(res + rl, path + a, n2); rl += n2; res[rl] = 0;
        lastSeg = (long)i - lastSlash - 1;
      }
      lastSlash = (long)i; dots = 0;
    } else if (code == '.' && dots != -1) ++dots;
    else dots = -1;
  }
  res[rl] = 0;
  return res;
}
static char* sx_normalize_i(const char* p) {
  size_t len = strlen(p);
  if (len == 0) return sx_dup(".");
  int abs = p[0] == '/', trail = p[len - 1] == '/';
  char* r = sx_normstr(p, !abs);
  if (!r[0]) { free(r); if (abs) return sx_dup("/"); return sx_dup(trail ? "./" : "."); }
  char* out = (char*)n_mem(strlen(r) + 3); size_t o = 0;
  if (abs) out[o++] = '/';
  size_t lr = strlen(r); memcpy(out + o, r, lr); o += lr;
  if (trail) out[o++] = '/';
  out[o] = 0; free(r);
  return out;
}
static char* sx_normalize(const char* p) { SxPre pre; char* a = sx_entra(p, &pre); char* r = sx_normalize_i(a); free(a); return sx_sale(r, &pre); }
static char* sx_join(char** partes, int n) {
  size_t tot = 1; for (int i = 0; i < n; i++) tot += strlen(partes[i]) + 1;
  char* j = (char*)n_mem(tot); size_t o = 0; int hay = 0;
  for (int i = 0; i < n; i++) if (partes[i][0]) { if (hay) j[o++] = '/'; size_t l = strlen(partes[i]); memcpy(j + o, partes[i], l); o += l; hay = 1; }
  j[o] = 0;
  if (!hay) { free(j); return sx_dup("."); }
  char* r = sx_normalize(j); free(j);
  return r;
}
static char* sx_cwd(void) {
  char b[4096];
#ifdef SX_WIN
  if (!_getcwd(b, sizeof b)) return sx_dup(".");
#else
  if (!getcwd(b, sizeof b)) return sx_dup(".");
#endif
  return sx_dup(b);
}
static char* sx_resolve_i(const char* p, const SxPre* ppre, SxPre* salida) {   /* p ya con «/» y sin unidad */
  (void)ppre;
  char* cwd0 = sx_cwd(); SxPre cp; char* cwd = sx_entra(cwd0, &cp); free(cwd0);
  char* res; int abs;
  if (p[0]) {
    if (p[0] == '/') { res = sx_dup(p); abs = 1; if (ppre) *salida = *ppre; }
    else { char* t = sx_cat(cwd, "/"); res = sx_cat(t, p); free(t); abs = 1; *salida = cp; if (ppre && ppre->pre[0]) *salida = *ppre; }
  } else { res = sx_dup(cwd); abs = 1; *salida = cp; }
  free(cwd);
  char* n = sx_normstr(res, !abs); free(res);
  char* out = (char*)n_mem(strlen(n) + 3); size_t o = 0;
  if (abs) out[o++] = '/';
  size_t l = strlen(n); memcpy(out + o, n, l); o += l; out[o] = 0; free(n);
  if (!abs && !out[0]) { free(out); return sx_dup("."); }
  return out;
}
static char* sx_resolve(const char* p) { SxPre pre; char* a = sx_entra(p, &pre); SxPre sal; char* r = sx_resolve_i(a, &pre, &sal); free(a); return sx_sale(r, &sal); }
static char* sx_basename(const char* p) {
  SxPre pre; char* a = sx_entra(p, &pre);
  long len = (long)strlen(a), end = len;
  while (end > 1 && a[end - 1] == '/') end--;
  if (len > 0 && end == 1 && a[0] == '/') { free(a); return sx_dup(""); }
  if (end == 0) { free(a); return sx_dup(""); }
  long ini = end; while (ini > 0 && a[ini - 1] != '/') ini--;
  char* r = (char*)n_mem((size_t)(end - ini) + 1); memcpy(r, a + ini, (size_t)(end - ini)); r[end - ini] = 0;
  free(a); return r;
}
static char* sx_extname(const char* p) {
  char* b = sx_basename(p);
  size_t l = strlen(b);
  long punto = -1; for (long k = (long)l - 1; k >= 0; k--) if (b[k] == '.') { punto = k; break; }
  char* r = (punto <= 0 || (l == 2 && b[0] == '.' && b[1] == '.')) ? sx_dup("") : sx_dup(b + punto);
  free(b); return r;
}
static char* sx_dirname(const char* p) {
  SxPre pre; char* a = sx_entra(p, &pre);
  long len = (long)strlen(a);
  char* r;
  if (len == 0) r = sx_dup(pre.pre[0] ? "" : ".");
  else {
    int hasRoot = a[0] == '/'; long end = -1; int matched = 1;
    for (long i = len - 1; i >= 1; --i) { if (a[i] == '/') { if (!matched) { end = i; break; } } else matched = 0; }
    if (end == -1) r = sx_dup(hasRoot ? "/" : ".");
    else if (hasRoot && end == 1) r = sx_dup("//");
    else { r = (char*)n_mem((size_t)end + 1); memcpy(r, a, (size_t)end); r[end] = 0; }
  }
  free(a);
  return sx_sale(r, &pre);
}
static int sx_esabs(const char* p) {
#ifdef SX_WIN
  if (p[0] == '/' || p[0] == '\\') return 1;
  return ((p[0] >= 'a' && p[0] <= 'z') || (p[0] >= 'A' && p[0] <= 'Z')) && p[1] == ':' && (p[2] == '/' || p[2] == '\\');
#else
  return p[0] == '/';
#endif
}
static char* sx_relative(const char* de, const char* a) {
  SxPre p1, p2, s1, s2;
  char* d1 = sx_entra(de, &p1); char* a1 = sx_entra(a, &p2);
  char* from = sx_resolve_i(d1, &p1, &s1); char* to = sx_resolve_i(a1, &p2, &s2);
  free(d1); free(a1);
  char* res;
  if (s1.pre[0] && s2.pre[0] && strcmp(s1.pre, s2.pre) != 0) { res = sx_sale(to, &s2); free(from); return res; }
  if (strcmp(from, to) == 0) { free(from); free(to); return sx_dup(""); }
  long fromStart = 1, fromEnd = (long)strlen(from), fromLen = fromEnd - fromStart, toStart = 1, toLen = (long)strlen(to) - toStart;
  long length = fromLen < toLen ? fromLen : toLen, lastCommonSep = -1, i = 0;
  for (; i < length; i++) { char fc = from[fromStart + i]; if (fc != to[toStart + i]) break; else if (fc == '/') lastCommonSep = i; }
  if (i == length) {
    if (toLen > length) {
      if (to[toStart + i] == '/') { res = sx_dup(to + toStart + i + 1); free(from); free(to); SxPre z; z.pre[0] = 0; return sx_sale(res, &z); }
      if (i == 0) { res = sx_dup(to + toStart + i); free(from); free(to); SxPre z; z.pre[0] = 0; return sx_sale(res, &z); }
    } else if (fromLen > length) {
      if (from[fromStart + i] == '/') lastCommonSep = i; else if (i == 0) lastCommonSep = 0;
    }
  }
  NBuf b = {0}; int vacio = 1;
  for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) if (i == fromEnd || from[i] == '/') { b_utf8(&b, vacio ? ".." : "/.."); vacio = 0; }
  NV t = b_texto(&b); char* o = n_a_utf8(t, NULL); n_dec(t);
  res = sx_cat(o, to + toStart + lastCommonSep); free(o); free(from); free(to);
  SxPre z; z.pre[0] = 0;
  return sx_sale(res, &z);
}
static NV sx_texto_free(char* s) { NV r = n_texto_utf8(s); free(s); return r; }

NAT(sx_unirRuta) {
  (void)extra;
  if (n < 1) return n_error("«unirRuta» necesita al menos un trozo", NULL);
  char** p = (char**)n_mem(sizeof(char*) * (size_t)n);
  for (int i = 0; i < n; i++) { if (!n_es(a[i], NC_TEXTO)) { for (int k = 0; k < i; k++) free(p[k]); free(p); return ERR("«unirRuta»: el argumento %d debe ser texto y es %s", (long long)(i + 1), n_tipo_de(a[i])); } p[i] = n_a_utf8(a[i], NULL); }
  char* r = sx_join(p, n);
  for (int i = 0; i < n; i++) free(p[i]);
  free(p);
  return sx_texto_free(r);
}
#define SX_RUTA1(nombre, quien, expr) NAT(nombre) { (void)n; (void)extra; TXT(a[0], 1, quien); char* p = n_a_utf8(a[0], NULL); expr; free(p); return r; }
SX_RUTA1(sx_nombreArchivo, "nombreArchivo", NV r = sx_texto_free(sx_basename(p)))
SX_RUTA1(sx_extension, "extension", NV r = sx_texto_free(sx_extname(p)))
SX_RUTA1(sx_carpetaDe, "carpetaDe", NV r = sx_texto_free(sx_dirname(p)))
SX_RUTA1(sx_esRutaAbsoluta, "esRutaAbsoluta", NV r = n_bool(sx_esabs(p)))
SX_RUTA1(sx_normalizarRuta, "normalizarRuta", NV r = sx_texto_free(sx_normalize(p)))
SX_RUTA1(sx_rutaAbsoluta, "rutaAbsoluta", NV r = sx_texto_free(sx_resolve(p)))
NAT(sx_sinExtension) {
  (void)n; (void)extra; TXT(a[0], 1, "sinExtension");
  char* p = n_a_utf8(a[0], NULL); char* e = sx_extname(p);
  size_t lp = strlen(p), le = strlen(e);
  NV r = le ? n_texto_utf8n(p, (int64_t)(lp - le)) : n_texto_utf8(p);
  free(p); free(e); return r;
}
NAT(sx_rutaRelativa) {
  (void)n; (void)extra; TXT(a[0], 1, "rutaRelativa"); TXT(a[1], 2, "rutaRelativa");
  char* d = n_a_utf8(a[0], NULL); char* t = n_a_utf8(a[1], NULL);
  NV r = sx_texto_free(sx_relative(d, t)); free(d); free(t); return r;
}

/* ═════════════════════════════════════════════ carpeta actual e información */
NAT(sx_carpetaActual) { SIN_USO; return sx_texto_free(sx_cwd()); }
NAT(sx_cambiarCarpeta) {
  (void)n; (void)extra; TXT(a[0], 1, "cambiarCarpeta");
  char* r = n_a_utf8(a[0], NULL);
#ifdef SX_WIN
  int rc = _chdir(r);
#else
  int rc = chdir(r);
#endif
  if (rc != 0) {
    int e = errno; char m[4200]; snprintf(m, sizeof m, "ENOENT: no such file or directory, chdir '%s' -> '%s'", "", r);
    /* Node: «ENOENT: no such file or directory, chdir '<cwd>' -> '<r>'» */
    char* cwd = sx_cwd();
    snprintf(m, sizeof m, "%s: %s, chdir '%s' -> '%s'", errno_nombre(e), e == ENOENT ? "no such file or directory" : e == ENOTDIR ? "not a directory" : e == EACCES ? "permission denied" : strerror(e), cwd, r);
    free(cwd); free(r);
    return err_sis_c("cambiarCarpeta", m);
  }
  free(r);
  return n_nulo();
}
NAT(sx_infoSistema) {
  SIN_USO;
  NV d = n_dic_nuevo();
#if defined(_WIN32)
  dic_pon(d, "so", n_texto_utf8("windows"));
#elif defined(__APPLE__)
  dic_pon(d, "so", n_texto_utf8("mac"));
#else
  dic_pon(d, "so", n_texto_utf8("linux"));
#endif
#if defined(__x86_64__) || defined(_M_X64)
  dic_pon(d, "arquitectura", n_texto_utf8("x64"));
#elif defined(__aarch64__) || defined(_M_ARM64)
  dic_pon(d, "arquitectura", n_texto_utf8("arm64"));
#elif defined(__i386__)
  dic_pon(d, "arquitectura", n_texto_utf8("ia32"));
#else
  dic_pon(d, "arquitectura", n_texto_utf8("desconocida"));
#endif
  double nproc = 1, total = 0, libre = 0;
  char usuario[256] = "", personal[1024] = "", temporal[1024] = "/tmp", equipo[256] = "";
#if defined(_WIN32)
  { SYSTEM_INFO si; GetSystemInfo(&si); nproc = si.dwNumberOfProcessors;
    MEMORYSTATUSEX ms; ms.dwLength = sizeof ms; if (GlobalMemoryStatusEx(&ms)) { total = (double)ms.ullTotalPhys; libre = (double)ms.ullAvailPhys; }
    DWORD l = sizeof usuario; GetUserNameA(usuario, &l);
    const char* h = getenv("USERPROFILE"); if (h) snprintf(personal, sizeof personal, "%s", h);
    DWORD t = GetTempPathA(sizeof temporal, temporal); if (t > 3 && (temporal[t - 1] == '\\')) temporal[t - 1] = 0;
    l = sizeof equipo; GetComputerNameA(equipo, &l); }
#else
  { long np = sysconf(_SC_NPROCESSORS_ONLN); if (np > 0) nproc = (double)np;
    long pg = sysconf(_SC_PAGESIZE); long pt = sysconf(_SC_PHYS_PAGES), pa = sysconf(_SC_AVPHYS_PAGES);
    if (pg > 0 && pt > 0) total = (double)pg * (double)pt;
    if (pg > 0 && pa > 0) libre = (double)pg * (double)pa;
    { FILE* f = fopen("/proc/meminfo", "r"); if (f) { char ln[256]; while (fgets(ln, sizeof ln, f)) { unsigned long long kb; if (sscanf(ln, "MemAvailable: %llu kB", &kb) == 1) { libre = (double)kb * 1024.0; break; } } fclose(f); } }
    struct passwd* pw = getpwuid(getuid());
    if (pw) { snprintf(usuario, sizeof usuario, "%s", pw->pw_name); if (pw->pw_dir) snprintf(personal, sizeof personal, "%s", pw->pw_dir); }
    const char* h = getenv("HOME"); if (h) snprintf(personal, sizeof personal, "%s", h);
    const char* t = getenv("TMPDIR"); if (!t) t = getenv("TMP"); if (!t) t = getenv("TEMP"); if (t && *t) { snprintf(temporal, sizeof temporal, "%s", t); size_t lt = strlen(temporal); if (lt > 1 && temporal[lt - 1] == '/') temporal[lt - 1] = 0; }
    gethostname(equipo, sizeof equipo); }
#endif
  dic_pon(d, "procesadores", n_num(nproc));
  dic_pon(d, "memoria", n_num(total));
  dic_pon(d, "libre", n_num(libre));
  dic_pon(d, "usuario", n_texto_utf8(usuario));
  dic_pon(d, "personal", n_texto_utf8(personal));
  dic_pon(d, "temporal", n_texto_utf8(temporal));
  dic_pon(d, "equipo", n_texto_utf8(equipo));
  dic_pon(d, "motor", n_texto_utf8("nativo (AOT)"));
  return d;
}

/* ═══════════════════════════════════════════════════════════ archivos */
#if defined(_WIN32)
typedef struct _stat64 SxStat;
static int sx_stat(const char* r, SxStat* st) { wchar_t w[4096]; MultiByteToWideChar(CP_UTF8, 0, r, -1, w, 4096); return _wstat64(w, st); }
#define SX_ISDIR(m) (((m) & _S_IFMT) == _S_IFDIR)
#define SX_ISREG(m) (((m) & _S_IFMT) == _S_IFREG)
#else
typedef struct stat SxStat;
static int sx_stat(const char* r, SxStat* st) { return stat(r, st); }
#define SX_ISDIR(m) S_ISDIR(m)
#define SX_ISREG(m) S_ISREG(m)
#endif
static int sx_es_carpeta(const char* r) { SxStat st; return sx_stat(r, &st) == 0 && SX_ISDIR(st.st_mode); }
NAT(sx_esCarpeta) { (void)n; (void)extra; TXT(a[0], 1, "esCarpeta"); char* r = n_a_utf8(a[0], NULL); int v = sx_es_carpeta(r); free(r); return n_bool(v); }
NAT(sx_tamanoArchivo) {
  (void)n; (void)extra; TXT(a[0], 1, "tamanoArchivo");
  char* r = n_a_utf8(a[0], NULL); SxStat st;
  if (sx_stat(r, &st) != 0) { int e = errno; NV x = err_arch_c("tamanoArchivo", "no existe", r, NULL, errno_nombre(e)); free(r); return x; }
  free(r); return n_num((double)st.st_size);
}
NAT(sx_infoArchivo) {
  (void)n; (void)extra; TXT(a[0], 1, "infoArchivo");
  char* r = n_a_utf8(a[0], NULL); SxStat st;
  if (sx_stat(r, &st) != 0) { int e = errno; NV x = err_arch_c("infoArchivo", "no existe", r, NULL, errno_nombre(e)); free(r); return x; }
  free(r);
  NV d = n_dic_nuevo();
  dic_pon(d, "tamano", n_num((double)st.st_size));
#if defined(_WIN32)
  double mod = (double)st.st_mtime * 1000.0, cre = (double)st.st_ctime * 1000.0;
#elif defined(__APPLE__)
  double mod = (double)st.st_mtimespec.tv_sec * 1000.0 + (double)st.st_mtimespec.tv_nsec / 1e6, cre = (double)st.st_birthtimespec.tv_sec * 1000.0 + (double)st.st_birthtimespec.tv_nsec / 1e6;
#else
  double mod = (double)st.st_mtim.tv_sec * 1000.0 + (double)st.st_mtim.tv_nsec / 1e6;
  double cre = (double)st.st_ctim.tv_sec * 1000.0 + (double)st.st_ctim.tv_nsec / 1e6;   /* Linux no da la fecha de creación por stat(): como Node sin statx, la del último cambio */
#endif
  dic_pon(d, "modificado", n_fecha(mod));
  dic_pon(d, "creado", n_fecha(cre));
  dic_pon(d, "esCarpeta", n_bool(SX_ISDIR(st.st_mode)));
  dic_pon(d, "esArchivo", n_bool(SX_ISREG(st.st_mode)));
  return d;
}
typedef struct { char** v; int n, cap; } SxLista;
static void sxl_agregar(SxLista* l, const char* s) { if (l->n == l->cap) { l->cap = l->cap ? l->cap * 2 : 16; l->v = (char**)n_remem(l->v, sizeof(char*) * (size_t)l->cap); } l->v[l->n++] = sx_dup(s); }
static void sxl_liberar(SxLista* l) { for (int i = 0; i < l->n; i++) free(l->v[i]); free(l->v); l->v = NULL; l->n = l->cap = 0; }
static int sxl_cmp(const void* a, const void* b) { return strcmp(*(char* const*)a, *(char* const*)b); }
/* los nombres de una carpeta (sin «.» ni «..»); 0 si no se pudo (errno puesto) */
static int sx_ls(const char* r, SxLista* l) {
#if defined(_WIN32)
  char pat[4200]; snprintf(pat, sizeof pat, "%s\\*", r);
  wchar_t w[4200]; MultiByteToWideChar(CP_UTF8, 0, pat, -1, w, 4200);
  WIN32_FIND_DATAW fd; HANDLE h = FindFirstFileW(w, &fd);
  if (h == INVALID_HANDLE_VALUE) { errno = ENOENT; return 0; }
  do { char u[1024]; WideCharToMultiByte(CP_UTF8, 0, fd.cFileName, -1, u, sizeof u, NULL, NULL); if (strcmp(u, ".") && strcmp(u, "..")) sxl_agregar(l, u); } while (FindNextFileW(h, &fd));
  FindClose(h);
#else
  DIR* d = opendir(r); if (!d) return 0;
  struct dirent* e;
  while ((e = readdir(d))) if (strcmp(e->d_name, ".") && strcmp(e->d_name, "..")) sxl_agregar(l, e->d_name);
  closedir(d);
#endif
  return 1;
}
NAT(sx_listar) {
  (void)n; (void)extra; TXT(a[0], 1, "listar");
  char* r = n_a_utf8(a[0], NULL); SxLista l = {0};
  if (!sx_ls(r, &l)) { int e = errno; NV x = err_arch_c("listar", "no se pudo listar", r, NULL, errno_nombre(e)); free(r); return x; }
  free(r);
  qsort(l.v, (size_t)l.n, sizeof(char*), sxl_cmp);   /* readdirSync de Node da el orden del sistema; ordenado es lo estable */
  NV out = n_lista_nueva(l.n);
  for (int i = 0; i < l.n; i++) n_lista_agregar(LS(out), n_texto_utf8(l.v[i]));
  sxl_liberar(&l);
  return out;
}
static int sx_mkdir1(const char* r) {
#if defined(_WIN32)
  wchar_t w[4096]; MultiByteToWideChar(CP_UTF8, 0, r, -1, w, 4096); return _wmkdir(w);
#else
  return mkdir(r, 0777);
#endif
}
/* mkdir -p */
static int sx_mkdirp(const char* r) {
  char* t = sx_dup(r); size_t l = strlen(t);
  while (l > 1 && (t[l - 1] == '/' || t[l - 1] == '\\')) t[--l] = 0;
  for (size_t i = 1; i <= l; i++) {
    if (t[i] == '/' || t[i] == '\\' || t[i] == 0) {
      char c = t[i]; t[i] = 0;
      if (!sx_es_carpeta(t) && sx_mkdir1(t) != 0 && errno != EEXIST) { int e = errno; free(t); errno = e; return 0; }
      t[i] = c;
      if (!c) break;
    }
  }
  int ok = sx_es_carpeta(t); int e = errno;
  free(t); errno = ok ? 0 : (e ? e : EEXIST);
  return ok;
}
NAT(sx_crearCarpeta) {
  (void)n; (void)extra; TXT(a[0], 1, "crearCarpeta");
  char* r = n_a_utf8(a[0], NULL);
  if (!sx_mkdirp(r)) { int e = errno; NV x = err_arch_c("crearCarpeta", "no se pudo crear", r, NULL, errno_nombre(e)); free(r); return x; }
  free(r); return n_nulo();
}
/* copiar un archivo: 0 bien, o el errno */
static int sx_copiar_archivo(const char* de, const char* a) {
  FILE* f = fopen(de, "rb"); if (!f) return errno;
  FILE* g = fopen(a, "wb"); if (!g) { int e = errno; fclose(f); return e; }
  char buf[65536]; size_t k; int rc = 0;
  while ((k = fread(buf, 1, sizeof buf, f)) > 0) if (fwrite(buf, 1, k, g) != k) { rc = errno ? errno : ENOSPC; break; }
  fclose(f); if (fclose(g) != 0 && !rc) rc = errno;
#if !defined(_WIN32)
  { SxStat st; if (stat(de, &st) == 0) (void)chmod(a, st.st_mode & 07777); }
#endif
  return rc;
}
/* fs.cpSync(de, a, { recursive: true }); devuelve el código de error (texto) o NULL */
static const char* sx_copiar(const char* de, const char* a) {
  SxStat s1, s2;
  if (sx_stat(de, &s1) != 0) return errno_nombre(errno);
  int dest = sx_stat(a, &s2) == 0;
  if (dest) {
    if (SX_ISDIR(s1.st_mode) && !SX_ISDIR(s2.st_mode)) return "ERR_FS_CP_DIR_TO_NON_DIR";
    if (!SX_ISDIR(s1.st_mode) && SX_ISDIR(s2.st_mode)) return "ERR_FS_CP_NON_DIR_TO_DIR";
  }
  if (SX_ISDIR(s1.st_mode)) {
    char* ra = sx_resolve(de); char* rb = sx_resolve(a);
    size_t la = strlen(ra); int dentro = strncmp(rb, ra, la) == 0 && (rb[la] == '/' || rb[la] == '\\' || rb[la] == 0);
    free(ra); free(rb);
    if (dentro) return "ERR_FS_CP_EINVAL";
    if (!dest && !sx_mkdirp(a)) return errno_nombre(errno);
    SxLista l = {0};
    if (!sx_ls(de, &l)) return errno_nombre(errno);
    const char* rc = NULL;
    for (int i = 0; i < l.n && !rc; i++) {
      char* d2 = sx_cat(de, "/"); char* d3 = sx_cat(d2, l.v[i]); free(d2);
      char* a2 = sx_cat(a, "/"); char* a3 = sx_cat(a2, l.v[i]); free(a2);
      rc = sx_copiar(d3, a3); free(d3); free(a3);
    }
    sxl_liberar(&l);
    return rc;
  }
  int e = sx_copiar_archivo(de, a);
  return e ? errno_nombre(e) : NULL;
}
NAT(sx_copiarArchivo) {
  (void)n; (void)extra; TXT(a[0], 1, "copiarArchivo"); TXT(a[1], 2, "copiarArchivo");
  char* de = n_a_utf8(a[0], NULL); char* aa = n_a_utf8(a[1], NULL);
  const char* c = sx_copiar(de, aa);
  NV r = c ? err_arch_c("copiarArchivo", "no se pudo copiar", de, aa, c) : n_nulo();
  free(de); free(aa); return r;
}
NAT(sx_moverArchivo) {
  (void)n; (void)extra; TXT(a[0], 1, "moverArchivo"); TXT(a[1], 2, "moverArchivo");
  char* de = n_a_utf8(a[0], NULL); char* aa = n_a_utf8(a[1], NULL);
  NV r = n_nulo();
#if defined(_WIN32)
  wchar_t w1[4096], w2[4096]; MultiByteToWideChar(CP_UTF8, 0, de, -1, w1, 4096); MultiByteToWideChar(CP_UTF8, 0, aa, -1, w2, 4096);
  int rc = MoveFileExW(w1, w2, MOVEFILE_REPLACE_EXISTING) ? 0 : -1; int e = rc ? ENOENT : 0;
#else
  int rc = rename(de, aa); int e = rc ? errno : 0;
#endif
  if (rc != 0) r = err_arch_c("moverArchivo", "no se pudo mover", de, aa, errno_nombre(e));
  free(de); free(aa); return r;
}

/* leerLineas: un generador hecho en C que lee de a 64 KB y suelta línea a línea (como archivos.lineas de n-node) */
typedef struct { FILE* f; unsigned char* buf; size_t ini, fin, cap; int eof, cerrado; } SxLineas;
static void sx_lineas_cerrar(void* e) { SxLineas* L = (SxLineas*)e; if (!L->cerrado) { L->cerrado = 1; if (L->f) fclose(L->f); L->f = NULL; } free(L->buf); free(L); }
static NV sx_lineas_sig(void* e, int* fin) {
  SxLineas* L = (SxLineas*)e;
  for (;;) {
    unsigned char* nl = L->ini < L->fin ? (unsigned char*)memchr(L->buf + L->ini, '\n', L->fin - L->ini) : NULL;
    if (nl) {
      size_t largo = (size_t)(nl - (L->buf + L->ini));
      if (largo && L->buf[L->ini + largo - 1] == '\r') largo--;
      NV r = n_texto_utf8n((const char*)(L->buf + L->ini), (int64_t)largo);
      L->ini = (size_t)(nl - L->buf) + 1;
      return r;
    }
    if (L->eof) {
      if (L->ini >= L->fin) { *fin = 1; return n_nulo(); }
      size_t largo = L->fin - L->ini;
      if (L->buf[L->ini + largo - 1] == '\r') largo--;
      NV r = n_texto_utf8n((const char*)(L->buf + L->ini), (int64_t)largo);
      L->ini = L->fin;
      return r;
    }
    if (L->ini > 0) { memmove(L->buf, L->buf + L->ini, L->fin - L->ini); L->fin -= L->ini; L->ini = 0; }
    if (L->fin + 65536 > L->cap) { L->cap = L->fin + 65536 + 4096; L->buf = (unsigned char*)n_remem(L->buf, L->cap); }
    size_t k = fread(L->buf + L->fin, 1, 65536, L->f);
    if (k == 0) L->eof = 1; else L->fin += k;
  }
}
NAT(sx_leerLineas) {
  (void)n; (void)extra; TXT(a[0], 1, "leerLineas");
  FILE* f = abrir_ruta(a[0], "rb");
  if (!f) { int e = errno; char* r = n_a_utf8(a[0], NULL); NV x = err_arch_c("leerLineas", "no se pudo abrir", r, NULL, errno_nombre(e)); free(r); return x; }
  SxLineas* L = (SxLineas*)n_mem(sizeof(SxLineas));
  L->f = f; L->buf = (unsigned char*)n_mem(1); L->ini = L->fin = 0; L->cap = 1; L->eof = L->cerrado = 0;
  return co_gen_nativo("leerLineas", sx_lineas_sig, sx_lineas_cerrar, L);
}

/* ══════════════════════════════════════════════════════ procesos */
typedef struct {
  char* orden; char** args; int nargs;
  char* entrada; int hay_entrada;
  char* carpeta; char** env; int nenv;      /* env: «K=V» */
  int espera;                                /* ms; 0 = sin límite */
  /* resultado */
  int err_lanzar;      /* errno si no se pudo lanzar */
  int codigo;          /* código de salida, o -1 si no hubo (señal, tiempo) */
  int tiempo;          /* se pasó del tiempo */
  int por_senal;
  char* salida; size_t nsalida; char* error; size_t nerror;
  char fo[1100], fe[1100], fi[1100];   /* archivos temporales: sus nombres se eligen en el hilo principal (el contador no es atómico) */
} SxProc;
static void sxp_liberar(SxProc* p) {
  free(p->orden); for (int i = 0; i < p->nargs; i++) free(p->args[i]); free(p->args);
  free(p->entrada); free(p->carpeta); for (int i = 0; i < p->nenv; i++) free(p->env[i]); free(p->env);
  free(p->salida); free(p->error);
}
static char* sx_leer_todo(const char* ruta, size_t* n) {
  FILE* f = fopen(ruta, "rb"); char* b = (char*)n_mem(1); size_t len = 0, cap = 1;
  if (f) { char t[65536]; size_t k; while ((k = fread(t, 1, sizeof t, f)) > 0) { if (len + k + 1 > cap) { cap = (len + k + 1) * 2; b = (char*)n_remem(b, cap); } memcpy(b + len, t, k); len += k; } fclose(f); }
  b[len] = 0; *n = len; return b;
}
static void sx_ruta_tmp(char* out, size_t n, const char* sufijo) {
  static unsigned contador = 0;
  const char* d = getenv("TMPDIR"); if (!d || !*d) d = getenv("TEMP"); if (!d || !*d) d = "/tmp";
#if defined(_WIN32)
  snprintf(out, n, "%s\\n-proc-%lu-%u-%s", d, (unsigned long)GetCurrentProcessId(), contador++, sufijo);
#else
  snprintf(out, n, "%s/n-proc-%lu-%u-%s", d, (unsigned long)getpid(), contador++, sufijo);
#endif
}
/* Corre la orden (sin shell) y espera. La salida y el error van a archivos temporales: sin riesgo de bloqueo por tuberías llenas, y vale igual
   en hilos. No toca objetos de Ñ: se puede llamar desde otro hilo. */
static void sx_correr(SxProc* p) {
  char *fo = p->fo, *fe = p->fe, *fi = p->fi;
  p->err_lanzar = 0; p->codigo = -1; p->tiempo = 0; p->por_senal = 0; p->salida = p->error = NULL; p->nsalida = p->nerror = 0;
  if (p->hay_entrada) { FILE* f = fopen(fi, "wb"); if (f) { fwrite(p->entrada, 1, strlen(p->entrada), f); fclose(f); } }
#if defined(_WIN32)
  /* línea de órdenes con comillas */
  NBuf cl = {0};
  NV t0 = n_texto_utf8(p->orden);
  b_c(&cl, '"'); b_txt(&cl, t0); b_c(&cl, '"'); n_dec(t0);
  for (int i = 0; i < p->nargs; i++) { b_c(&cl, ' '); b_c(&cl, '"'); NV ta = n_texto_utf8(p->args[i]); b_txt(&cl, ta); n_dec(ta); b_c(&cl, '"'); }
  NV cv = b_texto(&cl);
  wchar_t* wcl = (wchar_t*)n_mem(sizeof(wchar_t) * (size_t)(TX(cv)->n + 1)); for (int64_t i = 0; i < TX(cv)->n; i++) wcl[i] = TX(cv)->s[i]; wcl[TX(cv)->n] = 0; n_dec(cv);
  SECURITY_ATTRIBUTES sa; sa.nLength = sizeof sa; sa.lpSecurityDescriptor = NULL; sa.bInheritHandle = TRUE;
  wchar_t w[1100];
  MultiByteToWideChar(CP_UTF8, 0, fo, -1, w, 1100); HANDLE ho = CreateFileW(w, GENERIC_WRITE, FILE_SHARE_READ, &sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  MultiByteToWideChar(CP_UTF8, 0, fe, -1, w, 1100); HANDLE he = CreateFileW(w, GENERIC_WRITE, FILE_SHARE_READ, &sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  HANDLE hi = INVALID_HANDLE_VALUE;
  if (p->hay_entrada) { MultiByteToWideChar(CP_UTF8, 0, fi, -1, w, 1100); hi = CreateFileW(w, GENERIC_READ, FILE_SHARE_READ, &sa, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL); }
  STARTUPINFOW si; memset(&si, 0, sizeof si); si.cb = sizeof si; si.dwFlags = STARTF_USESTDHANDLES; si.hStdOutput = ho; si.hStdError = he; si.hStdInput = hi;
  PROCESS_INFORMATION pi; wchar_t wd[4096]; const wchar_t* cwd = NULL;
  if (p->carpeta) { MultiByteToWideChar(CP_UTF8, 0, p->carpeta, -1, wd, 4096); cwd = wd; }
  wchar_t* envb = NULL;
  if (p->nenv) {
    size_t tam = 2; for (int i = 0; i < p->nenv; i++) tam += strlen(p->env[i]) + 1;
    LPWCH actual = GetEnvironmentStringsW(); size_t ta = 0; if (actual) { while (actual[ta] || actual[ta + 1]) ta++; ta += 2; }
    envb = (wchar_t*)n_mem(sizeof(wchar_t) * (tam + ta + 2)); size_t o = 0;
    for (int i = 0; i < p->nenv; i++) { int k = MultiByteToWideChar(CP_UTF8, 0, p->env[i], -1, envb + o, 32767); o += (size_t)(k > 0 ? k : 1); }
    if (actual) { memcpy(envb + o, actual, sizeof(wchar_t) * (ta - 1)); o += ta - 1; FreeEnvironmentStringsW(actual); }
    envb[o] = 0;
  }
  if (!CreateProcessW(NULL, wcl, NULL, NULL, TRUE, CREATE_UNICODE_ENVIRONMENT, envb, cwd, &si, &pi)) { p->err_lanzar = ENOENT; }
  else {
    DWORD r = WaitForSingleObject(pi.hProcess, p->espera ? (DWORD)p->espera : INFINITE);
    if (r == WAIT_TIMEOUT) { TerminateProcess(pi.hProcess, 1); p->tiempo = 1; WaitForSingleObject(pi.hProcess, 5000); }
    else { DWORD c = 0; GetExitCodeProcess(pi.hProcess, &c); p->codigo = (int)c; }
    CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
  }
  free(wcl); free(envb);
  if (ho != INVALID_HANDLE_VALUE) CloseHandle(ho);
  if (he != INVALID_HANDLE_VALUE) CloseHandle(he);
  if (hi != INVALID_HANDLE_VALUE) CloseHandle(hi);
#else
  int ep[2];
  if (pipe(ep) != 0) { p->err_lanzar = errno; return; }
  fcntl(ep[1], F_SETFD, FD_CLOEXEC);
  pid_t pid = fork();
  if (pid < 0) { p->err_lanzar = errno; close(ep[0]); close(ep[1]); return; }
  if (pid == 0) {
    close(ep[0]);
    int fdo = open(fo, O_WRONLY | O_CREAT | O_TRUNC, 0600), fde = open(fe, O_WRONLY | O_CREAT | O_TRUNC, 0600);
    int fdi = p->hay_entrada ? open(fi, O_RDONLY) : open("/dev/null", O_RDONLY);
    if (fdo >= 0) dup2(fdo, 1);
    if (fde >= 0) dup2(fde, 2);
    if (fdi >= 0) dup2(fdi, 0);
    if (p->carpeta && chdir(p->carpeta) != 0) { int e = errno; (void)!write(ep[1], &e, sizeof e); _exit(127); }
    for (int i = 0; i < p->nenv; i++) putenv(p->env[i]);
    char** av = (char**)n_mem(sizeof(char*) * (size_t)(p->nargs + 2));
    av[0] = p->orden; for (int i = 0; i < p->nargs; i++) av[i + 1] = p->args[i]; av[p->nargs + 1] = NULL;
    execvp(p->orden, av);
    int e = errno; (void)!write(ep[1], &e, sizeof e);
    _exit(127);
  }
  close(ep[1]);
  int e2 = 0; ssize_t k = read(ep[0], &e2, sizeof e2); close(ep[0]);
  int st = 0;
  if (k == (ssize_t)sizeof e2) { p->err_lanzar = e2; waitpid(pid, &st, 0); }
  else {
    double fin = p->espera ? reloj_ms() + p->espera : 0; int listo = 0;
    for (;;) {
      pid_t w = waitpid(pid, &st, WNOHANG);
      if (w == pid) { listo = 1; break; }
      if (fin && reloj_ms() >= fin) { kill(pid, SIGTERM); p->tiempo = 1; waitpid(pid, &st, 0); break; }
      struct timespec ts = { 0, 1000000 }; nanosleep(&ts, NULL);
    }
    if (listo) { if (WIFEXITED(st)) p->codigo = WEXITSTATUS(st); else { p->por_senal = 1; } }
  }
#endif
  p->salida = sx_leer_todo(fo, &p->nsalida); p->error = sx_leer_todo(fe, &p->nerror);
  remove(fo); remove(fe); if (p->hay_entrada) remove(fi);
}
static NV sx_resultado_proceso(const char* codigo_ok, int codigo, const char* salida, size_t ns, const char* error, size_t ne) {
  (void)codigo_ok;
  NV d = n_dic_nuevo();
  dic_pon(d, "codigo", n_num((double)codigo));
  dic_pon(d, "salida", n_texto_utf8n(salida, (int64_t)ns));
  dic_pon(d, "error", n_texto_utf8n(error, (int64_t)ne));
  return d;
}
/* las opciones de ejecutar/ejecutarEnFondo, comprobadas como opcionesProceso de la biblioteca; 0 si hay error (ya puesto en *err) */
static int sx_opciones(NV v, const char* quien, SxProc* p, NV* err) {
  if (v.t == N_NULO) return 1;
  if (!n_es(v, NC_DIC)) { *err = ERR("«%s»: las opciones van en un diccionario y es %s", quien, n_tipo_de(v)); return 0; }
  NDic* d = DC(v);
  for (int64_t i = 0; i < d->usados; i++) {
    if (!d->e[i].vivo) continue;
    NV k = d->e[i].k, x = d->e[i].v;
    NV kt = n_texto_de(k); char* ks = n_a_utf8(kt, NULL); n_dec(kt);
    int ok = 1;
    if (!strcmp(ks, "entrada")) { if (!n_es(x, NC_TEXTO)) { *err = ERR("«%s»: el argumento 3 debe ser texto y es %s", quien, n_tipo_de(x)); ok = 0; } else { p->entrada = n_a_utf8(x, NULL); p->hay_entrada = 1; } }
    else if (!strcmp(ks, "carpeta")) { if (!n_es(x, NC_TEXTO)) { *err = ERR("«%s»: el argumento 3 debe ser texto y es %s", quien, n_tipo_de(x)); ok = 0; } else p->carpeta = n_a_utf8(x, NULL); }
    else if (!strcmp(ks, "espera")) {
      if (x.t != N_NUM || x.u.n != trunc(x.u.n)) { *err = ERR("«%s»: el argumento 3 debe ser un entero y es %s", quien, n_tipo_de(x)); ok = 0; }
      else if (x.u.n <= 0) { *err = ERR("«%s»: «espera» son milisegundos, más de cero", quien); ok = 0; }
      else p->espera = (int)x.u.n;
    } else if (!strcmp(ks, "entorno")) {
      if (!n_es(x, NC_DIC)) { *err = ERR("«%s»: «entorno» es un diccionario {NOMBRE: valor}", quien); ok = 0; }
      else {
        NDic* e = DC(x);
        for (int64_t j = 0; j < e->usados; j++) if (e->e[j].vivo) {
          NV a1 = n_texto_de(e->e[j].k); NV b1 = n_repr(e->e[j].v, 0); NV eq = n_texto_utf8("="); NV z[3] = { a1, eq, b1 };
          NV s = n_concat(z, 3); char* kv = n_a_utf8(s, NULL); n_dec(s); n_dec(a1); n_dec(b1); n_dec(eq);
          p->env = (char**)n_remem(p->env, sizeof(char*) * (size_t)(p->nenv + 1)); p->env[p->nenv++] = kv;
        }
      }
    } else { *err = ERRP(n_texto_utf8("las opciones son entrada, carpeta, entorno y espera"), "«%s»: no conozco la opción «%s»", quien, ks); ok = 0; }
    free(ks);
    if (!ok) return 0;
  }
  return 1;
}
static int sx_leer_args(NV* a, int n, const char* quien, SxProc* p, NV* err) {
  sx_ruta_tmp(p->fo, sizeof p->fo, "o"); sx_ruta_tmp(p->fe, sizeof p->fe, "e"); sx_ruta_tmp(p->fi, sizeof p->fi, "i");
  if (!n_es(a[0], NC_TEXTO)) { *err = ERR("«%s»: el argumento 1 debe ser texto y es %s", quien, n_tipo_de(a[0])); return 0; }
  p->orden = n_a_utf8(a[0], NULL);
  if (n > 1 && a[1].t != N_NULO) {
    if (!n_es(a[1], NC_LISTA)) { *err = ERR("«%s»: el argumento 2 debe ser una lista y es %s", quien, n_tipo_de(a[1])); return 0; }
    NLista* l = LS(a[1]);
    p->args = (char**)n_mem(sizeof(char*) * (size_t)(l->n ? l->n : 1));
    for (int64_t i = 0; i < l->n; i++) { NV x = n_lista_leer(l, i); NV t = n_repr(x, 0); p->args[p->nargs++] = n_a_utf8(t, NULL); n_dec(t); n_dec(x); }
  }
  if (n > 2) return sx_opciones(a[2], quien, p, err);
  return 1;
}
NAT(sx_ejecutar) {
  (void)extra;
  if (n < 1) return n_error("«ejecutar»: el argumento 1 debe ser texto y es nulo", NULL);
  SxProc p; memset(&p, 0, sizeof p); NV err;
  if (!sx_leer_args(a, n, "ejecutar", &p, &err)) { sxp_liberar(&p); return err; }
  sx_correr(&p);
  NV r;
  if (p.err_lanzar) {
    char m[2048]; snprintf(m, sizeof m, "spawnSync %s %s", p.orden, errno_nombre(p.err_lanzar));
    r = sx_resultado_proceso(NULL, -1, "", 0, m, strlen(m));
  } else if (p.tiempo) {
    const char* m = "se pas\xC3\xB3 del tiempo de espera y se par\xC3\xB3";
    r = sx_resultado_proceso(NULL, -1, p.salida, p.nsalida, m, strlen(m));
  } else if (p.codigo == 0) {
    r = sx_resultado_proceso(NULL, 0, p.salida, p.nsalida, "", 0);
  } else {
    if (p.nerror) r = sx_resultado_proceso(NULL, p.codigo, p.salida, p.nsalida, p.error, p.nerror);
    else {
      NBuf b = {0}; b_utf8(&b, "Command failed: "); b_utf8(&b, p.orden);
      for (int i = 0; i < p.nargs; i++) { b_c(&b, ' '); b_utf8(&b, p.args[i]); }
      NV t = b_texto(&b); char* m = n_a_utf8(t, NULL); n_dec(t);
      r = sx_resultado_proceso(NULL, p.codigo, p.salida, p.nsalida, m, strlen(m)); free(m);
    }
  }
  sxp_liberar(&p);
  return r;
}

/* ══════════════════════════════════════ trabajos en otros hilos + bucle de eventos */
typedef struct NTrab { struct NTrab* sig; void (*trabajo)(void*); void (*acabar)(void*, int*); void* dato; } NTrab;
#if defined(_WIN32)
static CRITICAL_SECTION trab_m; static CONDITION_VARIABLE trab_c; static int trab_ini = 0;
static void trab_iniciar(void) { if (!trab_ini) { InitializeCriticalSection(&trab_m); InitializeConditionVariable(&trab_c); trab_ini = 1; } }
#define TRAB_LOCK() (trab_iniciar(), EnterCriticalSection(&trab_m))
#define TRAB_UNLOCK() LeaveCriticalSection(&trab_m)
#else
static pthread_mutex_t trab_m = PTHREAD_MUTEX_INITIALIZER; static pthread_cond_t trab_c = PTHREAD_COND_INITIALIZER;
#define TRAB_LOCK() pthread_mutex_lock(&trab_m)
#define TRAB_UNLOCK() pthread_mutex_unlock(&trab_m)
static void trab_iniciar(void) {}
#endif
static NTrab* trab_hechos = NULL; static NTrab** trab_cola_fin = &trab_hechos;
static int g_codigo_turnos = 0;    /* algún turno falló (lo ponen los que se entregan fuera del bucle, como una petición del servidor) */
static int trab_pend = 0;     /* trabajos lanzados que aún no se han entregado (y servidores activos) */
static void trab_publicar(NTrab* t) {
  TRAB_LOCK();
  t->sig = NULL; *trab_cola_fin = t; trab_cola_fin = &t->sig;
#if defined(_WIN32)
  WakeConditionVariable(&trab_c);
#else
  pthread_cond_signal(&trab_c);
#endif
  TRAB_UNLOCK();
}
#if defined(_WIN32)
static unsigned __stdcall trab_hilo(void* x) { NTrab* t = (NTrab*)x; t->trabajo(t->dato); trab_publicar(t); return 0; }
#else
static void* trab_hilo(void* x) { NTrab* t = (NTrab*)x; t->trabajo(t->dato); trab_publicar(t); return NULL; }
#endif
/* lanza «trabajo» en otro hilo (sin tocar objetos de Ñ); cuando acaba, el bucle de eventos llama a «acabar» en el hilo principal */
static int trab_lanzar(void (*trabajo)(void*), void (*acabar)(void*, int*), void* dato) {
  trab_iniciar();
  NTrab* t = (NTrab*)n_mem(sizeof(NTrab)); t->sig = NULL; t->trabajo = trabajo; t->acabar = acabar; t->dato = dato;
#if defined(_WIN32)
  uintptr_t h = _beginthreadex(NULL, 0, trab_hilo, t, 0, NULL);
  if (!h) { free(t); return 0; }
  CloseHandle((HANDLE)h);
#else
  pthread_t th; pthread_attr_t at; pthread_attr_init(&at); pthread_attr_setdetachstate(&at, PTHREAD_CREATE_DETACHED);
  int rc = pthread_create(&th, &at, trab_hilo, t); pthread_attr_destroy(&at);
  if (rc != 0) { free(t); return 0; }
#endif
  TRAB_LOCK(); trab_pend++; TRAB_UNLOCK();
  return 1;
}

typedef struct { SxProc p; NProm* prom; } SxFondo;
static void sx_fondo_trabajo(void* d) { sx_correr(&((SxFondo*)d)->p); }
static void sx_fondo_acabar(void* d, int* st) {
  SxFondo* f = (SxFondo*)d; SxProc* p = &f->p; NV r;
  if (p->err_lanzar) {
    char m[2200]; snprintf(m, sizeof m, "no se pudo lanzar \xC2\xAB%s\xC2\xBB (%s)", p->orden, errno_nombre(p->err_lanzar));
    r = sx_resultado_proceso(NULL, -1, "", 0, m, strlen(m));
  } else if (p->tiempo) {
    const char* m = "se pas\xC3\xB3 del tiempo de espera y se par\xC3\xB3";
    r = sx_resultado_proceso(NULL, -1, p->salida, p->nsalida, m, strlen(m));
  } else if (p->codigo == 0) r = sx_resultado_proceso(NULL, 0, p->salida, p->nsalida, p->error, p->nerror);
  else r = sx_resultado_proceso(NULL, p->codigo, p->salida, p->nsalida, p->error, p->nerror);
  *st = prom_cumplir(f->prom, r, 1);
  n_dec(r); n_dec(n_obj(f->prom)); sxp_liberar(p); free(f);
}
NAT(sx_ejecutarEnFondo) {
  (void)extra;
  if (n < 1 || n > 3) return n_error("«ejecutarEnFondo» es ejecutarEnFondo(orden, argumentos?, opciones?)", NULL);
  SxFondo* f = (SxFondo*)n_mem(sizeof(SxFondo)); memset(f, 0, sizeof *f); NV err;
  if (!sx_leer_args(a, n, "ejecutarEnFondo", &f->p, &err)) { sxp_liberar(&f->p); free(f); return err; }
  f->prom = prom_nueva(); N_RC_MAS(&f->prom->h);
  if (!trab_lanzar(sx_fondo_trabajo, sx_fondo_acabar, f)) { n_dec(n_obj(f->prom)); n_dec(n_obj(f->prom)); sxp_liberar(&f->p); free(f); return err_sis_c("ejecutarEnFondo", "no se pudo crear el hilo"); }
  return n_obj(f->prom);
}

/* ═══════════════════════════════════════════════════════ temporizadores */
/* luego/cada/detener. Se apuntan en la misma lista que dormir (nrt_corrutinas.inc), con un número y la función de Ñ. */
typedef struct NTempFn { double due, ms; uint64_t seq; int id, repite; NV fn; struct NTempFn* sig; } NTempFn;
static NTempFn* tempsfn = NULL; static int tempfn_id = 1; static NTempFn* tempfn_corriendo = NULL;
static void tempfn_insertar(NTempFn* t) {
  NTempFn** pp = &tempsfn;
  while (*pp && ((*pp)->due < t->due || ((*pp)->due == t->due && (*pp)->seq < t->seq))) pp = &(*pp)->sig;
  t->sig = *pp; *pp = t;
}
static NV sx_temporizador(NV* a, const char* quien, int repite) {
  if (!n_es(a[1], NC_CIERRE) && !n_es(a[1], NC_NATIVA)) return ERR("«%s»: el argumento 2 debe ser una función y es %s", quien, n_tipo_de(a[1]));
  NV e; if (!exige_num(a[0], 1, quien, &e)) return e;
  double ms = a[0].u.n;
  if (!isfinite(ms) || ms < 0) return ERR("«%s»: los milisegundos deben ser un número positivo", quien);
  NTempFn* t = (NTempFn*)n_mem(sizeof(NTempFn));
  double m = repite ? (ms >= 1 ? ms : 1) : (ms >= 1 ? ms : 1);
  if (m > 2147483647.0) m = 1;
  t->ms = floor(m); t->due = reloj_ms() + t->ms; t->seq = temp_seq++; t->id = tempfn_id++; t->repite = repite; t->fn = n_inc(a[1]);
  tempfn_insertar(t);
  return n_num((double)t->id);
}
NAT(sx_luego) { (void)n; (void)extra; return sx_temporizador(a, "luego", 0); }
NAT(sx_cada) { (void)n; (void)extra; return sx_temporizador(a, "cada", 1); }
NAT(sx_detener) {
  (void)n; (void)extra; NUM(a[0], 1, "detener");
  for (NTempFn** pp = &tempsfn; *pp; pp = &(*pp)->sig) if ((double)(*pp)->id == a[0].u.n) { NTempFn* t = *pp; *pp = t->sig; n_dec(t->fn); free(t); return n_bool(1); }
  if (tempfn_corriendo && (double)tempfn_corriendo->id == a[0].u.n) { tempfn_corriendo->id = -tempfn_corriendo->id; return n_bool(1); }   /* se para a sí mismo */
  return n_bool(0);
}

/* ── el bucle de eventos ─────────────────────────────────────────────────────
   Corre lo que quedó pendiente cuando el programa principal acabó: temporizadores (dormir, luego, cada), trabajos de otros hilos (ejecutarEnFondo, el
   servidor). Cada uno es un TURNO: si falla, se imprime como en la consola y el programa sigue; el código de salida queda en 1. */
static void bucle_esperar(double ms) {   /* hasta que acabe un trabajo o pasen «ms» (ms < 0: sin límite) */
  TRAB_LOCK(); int pend = trab_pend; TRAB_UNLOCK();
  if (!pend) { dormir_ms(ms); return; }
  trab_iniciar();
  TRAB_LOCK();
  if (!trab_hechos) {
#if defined(_WIN32)
    SleepConditionVariableCS(&trab_c, &trab_m, ms < 0 ? INFINITE : (DWORD)ceil(ms));
#else
    if (ms < 0) pthread_cond_wait(&trab_c, &trab_m);
    else {
      struct timespec ts; clock_gettime(CLOCK_REALTIME, &ts);
      double s = (double)ts.tv_sec + (double)ts.tv_nsec / 1e9 + ms / 1000.0;
      ts.tv_sec = (time_t)s; ts.tv_nsec = (long)((s - (double)ts.tv_sec) * 1e9);
      pthread_cond_timedwait(&trab_c, &trab_m, &ts);
    }
#endif
  }
  TRAB_UNLOCK();
}
int n_bucle_eventos(void) {
  int codigo = 0;
  for (;;) {
    NTrab* t;
    TRAB_LOCK(); t = trab_hechos; trab_hechos = NULL; trab_cola_fin = &trab_hechos; TRAB_UNLOCK();
    while (t) {
      NTrab* sig = t->sig; int st = 0;
      t->acabar(t->dato, &st); TRAB_LOCK(); trab_pend--; TRAB_UNLOCK(); free(t);
      if (st < 0) { n_imprimir_fallo(); err_limpiar(); codigo = 1; }
      t = sig;
    }
    double ahora = reloj_ms();
    NTemp* a = temps; NTempFn* b = tempsfn;
    int usar_a = a && (!b || a->due < b->due || (a->due == b->due && a->seq < b->seq));
    double due = usar_a ? a->due : b ? b->due : 0;
    if ((a || b) && due <= ahora) {
      if (usar_a) {
        temps = a->sig; NProm* p = a->p; void (*f)(void*) = a->f; void* d = a->d; free(a);
        int st = 0;
        if (p) { st = prom_cumplir(p, n_nulo(), 1); n_dec(n_obj(p)); } else if (f) f(d);
        if (st < 0) { n_imprimir_fallo(); err_limpiar(); codigo = 1; }
      } else {
        tempsfn = b->sig; b->sig = NULL;
        tempfn_corriendo = b;
        NV r = n_llamar(b->fn, NULL, 0);
        tempfn_corriendo = NULL;
        if (N_FALLO(r)) { n_imprimir_fallo(); err_limpiar(); codigo = 1; } else n_dec(r);
        if (b->repite && b->id > 0) { b->due = reloj_ms() + b->ms; b->seq = temp_seq++; tempfn_insertar(b); }
        else { n_dec(b->fn); free(b); }
      }
      continue;
    }
    TRAB_LOCK(); int pend = trab_pend; TRAB_UNLOCK();
    if (!a && !b && !pend) break;
    fflush(stdout);   /* nada que hacer hasta que algo ocurra: que lo ya impreso se vea (un servidor puede esperar horas) */
    bucle_esperar((a || b) ? due - ahora : -1);
  }
  return codigo | g_codigo_turnos;
}

/* ═══════════════════════ lo que solo existe con página, almacén o red: el mismo error que da la consola */
static NV sx_sin(const char* quien, const char* que, const char* pista) {
  return n_errorT(msg("«%s» necesita un anfitrión con %s", quien, que), n_texto_utf8(pista));
}
#define SX_SIN_PAGINA(nombre, quien) NAT(nombre) { SIN_USO; return sx_sin(quien, "p\xC3\xA1gina", "la p\xC3\xA1gina existe en el IDE y en una aplicaci\xC3\xB3n exportada; en la consola no hay d\xC3\xB3nde pintar"); }
#define SX_SIN_ALMACEN(nombre, quien) NAT(nombre) { SIN_USO; return sx_sin(quien, "almacenamiento", "en el IDE est\xC3\xA1 disponible; fuera del navegador, no"); }

/* ═════════════════════════════════════════════════════ JSON */
/* JSON.parse / JSON.stringify de V8, con el orden de claves de un objeto de JavaScript (las que son enteros, primero y de menor a mayor). */
/* Los mensajes de error son los de V8 (Node 22): hay que decir en qué posición y, si es un símbolo suelto, con un trozo de contexto. */
enum { JE_FIN = 1, JE_TOKEN, JE_CORTO, JE_PROP, JE_PROP2, JE_DOSP, JE_COMA_OBJ, JE_COMA_ARR, JE_NOWS, JE_UNTERM, JE_CTRL, JE_ESC, JE_UNI, JE_MENOS, JE_FRAC, JE_EXP, JE_NUM };
typedef struct { const char* s; size_t n, i; int ek; size_t ep; } JsP;
static int js_falla(JsP* p, int k, size_t pos) { p->ek = k; p->ep = pos; return 0; }
static int js_es_indice(const char* k, size_t l, double* v) {
  if (l == 0 || l > 10) return 0;
  if (l > 1 && k[0] == '0') return 0;
  double x = 0; for (size_t i = 0; i < l; i++) { if (k[i] < '0' || k[i] > '9') return 0; x = x * 10 + (k[i] - '0'); }
  if (x >= 4294967295.0) return 0;
  *v = x; return 1;
}
static NV js_ordenar_claves(NV d) {   /* un diccionario con el orden de claves de un objeto de JS */
  NDic* D0 = DC(d); int hay = 0;
  for (int64_t i = 0; i < D0->usados && !hay; i++) if (D0->e[i].vivo && n_es(D0->e[i].k, NC_TEXTO)) { char* s = n_a_utf8(D0->e[i].k, NULL); double v; hay = js_es_indice(s, strlen(s), &v); free(s); }
  if (!hay) return d;
  NV r = n_dic_nuevo();
  int64_t cnt = D0->n; double* ks = (double*)n_mem(sizeof(double) * (size_t)(cnt ? cnt : 1)); int64_t* ix = (int64_t*)n_mem(sizeof(int64_t) * (size_t)(cnt ? cnt : 1)); int64_t m = 0;
  for (int64_t i = 0; i < D0->usados; i++) if (D0->e[i].vivo && n_es(D0->e[i].k, NC_TEXTO)) { char* s = n_a_utf8(D0->e[i].k, NULL); double v; if (js_es_indice(s, strlen(s), &v)) { ks[m] = v; ix[m] = i; m++; } free(s); }
  for (int64_t i = 1; i < m; i++) { double kk = ks[i]; int64_t ii = ix[i]; int64_t j = i - 1; while (j >= 0 && ks[j] > kk) { ks[j + 1] = ks[j]; ix[j + 1] = ix[j]; j--; } ks[j + 1] = kk; ix[j + 1] = ii; }
  for (int64_t q = 0; q < m; q++) n_dic_poner(DC(r), D0->e[ix[q]].k, D0->e[ix[q]].v);
  for (int64_t i = 0; i < D0->usados; i++) if (D0->e[i].vivo) { int esidx = 0; for (int64_t q = 0; q < m; q++) if (ix[q] == i) esidx = 1; if (!esidx) n_dic_poner(DC(r), D0->e[i].k, D0->e[i].v); }
  free(ks); free(ix); n_dec(d);
  return r;
}
static size_t js_u16(const char* s, size_t bytes) {   /* posición en unidades UTF-16 de un desplazamiento en bytes */
  size_t u = 0;
  for (size_t i = 0; i < bytes; i++) { unsigned char c = (unsigned char)s[i]; if ((c & 0xC0) != 0x80) u += (c >= 0xF0) ? 2 : 1; }
  return u;
}
static void js_mensaje(JsP* p, char* out, size_t cap) {
  size_t pos = js_u16(p->s, p->ep < p->n ? p->ep : p->n);
  size_t linea = 1, col = 1;
  for (size_t i = 0; i < p->ep && i < p->n; i++) { if (p->s[i] == '\n') { linea++; col = 1; } else if (((unsigned char)p->s[i] & 0xC0) != 0x80) col++; }
  char at[160]; snprintf(at, sizeof at, "in JSON at position %zu (line %zu column %zu)", pos, linea, col);
  switch (p->ek) {
    case JE_FIN: snprintf(out, cap, "Unexpected end of JSON input"); return;
    case JE_CORTO: snprintf(out, cap, "\"%.100s\" is not valid JSON", p->s); return;
    case JE_TOKEN: {
      size_t l = 1; unsigned char c = (unsigned char)p->s[p->ep];
      if (c >= 0xF0) l = 4; else if (c >= 0xE0) l = 3; else if (c >= 0xC0) l = 2;
      char tok[8]; memcpy(tok, p->s + p->ep, l); tok[l] = 0;
      size_t total = js_u16(p->s, p->n);
      if (total < 21) { snprintf(out, cap, "Unexpected token '%s', \"%.100s\" is not valid JSON", tok, p->s); return; }
      size_t a = pos > 10 ? pos - 10 : 0, b = pos + 10 < total ? pos + 10 : total;
      /* a y b están en unidades UTF-16; se recorta en bytes caracter a caracter */
      size_t ba = 0, u = 0; while (ba < p->n && u < a) { unsigned char cc = (unsigned char)p->s[ba]; size_t w = cc >= 0xF0 ? 4 : cc >= 0xE0 ? 3 : cc >= 0xC0 ? 2 : 1; u += w == 4 ? 2 : 1; ba += w; }
      size_t bb = ba; while (bb < p->n && u < b) { unsigned char cc = (unsigned char)p->s[bb]; size_t w = cc >= 0xF0 ? 4 : cc >= 0xE0 ? 3 : cc >= 0xC0 ? 2 : 1; u += w == 4 ? 2 : 1; bb += w; }
      snprintf(out, cap, "Unexpected token '%s', %s\"%.*s\"%s is not valid JSON", tok, a > 0 ? "..." : "", (int)(bb - ba), p->s + ba, b < total ? "..." : "");
      return;
    }
    case JE_PROP: snprintf(out, cap, "Expected property name or '}' %s", at); return;
    case JE_PROP2: snprintf(out, cap, "Expected double-quoted property name %s", at); return;
    case JE_DOSP: snprintf(out, cap, "Expected ':' after property name %s", at); return;
    case JE_COMA_OBJ: snprintf(out, cap, "Expected ',' or '}' after property value %s", at); return;
    case JE_COMA_ARR: snprintf(out, cap, "Expected ',' or ']' after array element %s", at); return;
    case JE_NOWS: snprintf(out, cap, "Unexpected non-whitespace character after JSON at position %zu (line %zu column %zu)", pos, linea, col); return;
    case JE_UNTERM: snprintf(out, cap, "Unterminated string %s", at); return;
    case JE_CTRL: snprintf(out, cap, "Bad control character in string literal %s", at); return;
    case JE_ESC: snprintf(out, cap, "Bad escaped character %s", at); return;
    case JE_UNI: snprintf(out, cap, "Bad Unicode escape %s", at); return;
    case JE_MENOS: snprintf(out, cap, "No number after minus sign %s", at); return;
    case JE_FRAC: snprintf(out, cap, "Unterminated fractional number %s", at); return;
    case JE_EXP: snprintf(out, cap, "Exponent part is missing a number %s", at); return;
    case JE_NUM: snprintf(out, cap, "Unexpected number %s", at); return;
    default: snprintf(out, cap, "Unexpected token"); return;
  }
}
static void js_ws(JsP* p) { while (p->i < p->n && (p->s[p->i] == ' ' || p->s[p->i] == '\t' || p->s[p->i] == '\n' || p->s[p->i] == '\r')) p->i++; }
static int js_hex4(JsP* p, unsigned* v) {
  unsigned x = 0;
  for (int k = 0; k < 4; k++) {
    size_t q = p->i + (size_t)k;
    char c = q < p->n ? p->s[q] : 0;
    x <<= 4;
    if (c >= '0' && c <= '9') x |= (unsigned)(c - '0'); else if (c >= 'a' && c <= 'f') x |= (unsigned)(c - 'a' + 10); else if (c >= 'A' && c <= 'F') x |= (unsigned)(c - 'A' + 10);
    else return js_falla(p, JE_UNI, q);
  }
  p->i += 4; *v = x; return 1;
}
static int js_cadena(JsP* p, NV* out) {   /* p->s[p->i] == '"' */
  p->i++;
  NBuf b = {0};
  for (;;) {
    if (p->i >= p->n) { free(b.s); return js_falla(p, JE_UNTERM, p->n); }
    unsigned char c = (unsigned char)p->s[p->i];
    if (c == '"') { p->i++; break; }
    if (c < 0x20) { free(b.s); return js_falla(p, JE_CTRL, p->i); }
    if (c == '\\') {
      p->i++;
      if (p->i >= p->n) { free(b.s); return js_falla(p, JE_UNTERM, p->n); }
      char e = p->s[p->i++];
      switch (e) {
        case '"': b_c(&b, '"'); break; case '\\': b_c(&b, '\\'); break; case '/': b_c(&b, '/'); break;
        case 'b': b_c(&b, 8); break; case 'f': b_c(&b, 12); break; case 'n': b_c(&b, 10); break; case 'r': b_c(&b, 13); break; case 't': b_c(&b, 9); break;
        case 'u': { unsigned v; if (!js_hex4(p, &v)) { free(b.s); return 0; } b_c(&b, (uint16_t)v); break; }
        default: free(b.s); return js_falla(p, JE_ESC, p->i - 1);
      }
    } else {
      /* UTF-8 → UTF-16 */
      size_t l = 1; uint32_t cp = c;
      if (c >= 0xF0) { l = 4; cp = c & 7; } else if (c >= 0xE0) { l = 3; cp = c & 15; } else if (c >= 0xC0) { l = 2; cp = c & 31; }
      if (p->i + l > p->n) l = p->n - p->i;
      for (size_t k = 1; k < l; k++) cp = (cp << 6) | ((unsigned char)p->s[p->i + k] & 63);
      p->i += l;
      if (cp >= 0x10000) { cp -= 0x10000; b_c(&b, (uint16_t)(0xD800 + (cp >> 10))); b_c(&b, (uint16_t)(0xDC00 + (cp & 1023))); } else b_c(&b, (uint16_t)cp);
    }
  }
  *out = b_texto(&b);
  return 1;
}
/* → 1 bien, 0 fallo de sintaxis (p->ek), -1 fallo de profundidad (*err_prof) */
static int js_valor(JsP* p, NV* out, int prof, NV* err_prof) {
  js_ws(p);
  if (p->i >= p->n) return js_falla(p, JE_FIN, p->n);
  char c = p->s[p->i];
  if (prof > 64) { *err_prof = ERR("«deJson»: el texto está anidado demasiado hondo"); return -1; }
  if (c == '{') {
    p->i++; NV d = n_dic_nuevo(); js_ws(p);
    if (p->i < p->n && p->s[p->i] == '}') { p->i++; *out = d; return 1; }
    int primera = 1;
    for (;;) {
      js_ws(p);
      if (p->i >= p->n || p->s[p->i] != '"') { n_dec(d); return js_falla(p, primera ? JE_PROP : JE_PROP2, p->i); }
      primera = 0;
      NV k; if (!js_cadena(p, &k)) { n_dec(d); return 0; }
      js_ws(p);
      if (p->i >= p->n || p->s[p->i] != ':') { n_dec(k); n_dec(d); return js_falla(p, JE_DOSP, p->i); }
      p->i++;
      NV v; int r = js_valor(p, &v, prof + 1, err_prof);
      if (r <= 0) { n_dec(k); n_dec(d); return r; }
      n_dic_poner(DC(d), k, v); n_dec(k); n_dec(v);
      js_ws(p);
      if (p->i < p->n && p->s[p->i] == ',') { p->i++; continue; }
      if (p->i < p->n && p->s[p->i] == '}') { p->i++; break; }
      n_dec(d); return js_falla(p, JE_COMA_OBJ, p->i);
    }
    *out = js_ordenar_claves(d); return 1;
  }
  if (c == '[') {
    p->i++; NV l = n_lista_nueva(0); js_ws(p);
    if (p->i < p->n && p->s[p->i] == ']') { p->i++; *out = l; return 1; }
    for (;;) {
      NV v; int r = js_valor(p, &v, prof + 1, err_prof);
      if (r <= 0) { n_dec(l); return r; }
      n_lista_agregar(LS(l), v);
      js_ws(p);
      if (p->i < p->n && p->s[p->i] == ',') { p->i++; continue; }
      if (p->i < p->n && p->s[p->i] == ']') { p->i++; break; }
      n_dec(l); return js_falla(p, JE_COMA_ARR, p->i);
    }
    *out = l; return 1;
  }
  if (c == '"') return js_cadena(p, out);
  if (c == 't' || c == 'f' || c == 'n') {
    const char* lit = c == 't' ? "true" : c == 'f' ? "false" : "null"; size_t ll = strlen(lit);
    for (size_t k = 0; k < ll; k++) {
      if (p->i + k >= p->n) return js_falla(p, JE_FIN, p->n);
      if (p->s[p->i + k] != lit[k]) return js_falla(p, JE_TOKEN, p->i + k);
    }
    p->i += ll; *out = c == 'n' ? n_nulo() : n_bool(c == 't'); return 1;
  }
  if (c == '-' || (c >= '0' && c <= '9')) {
    size_t ini = p->i, q = p->i;
    if (p->s[q] == '-') { q++; if (q >= p->n || p->s[q] < '0' || p->s[q] > '9') return js_falla(p, JE_MENOS, q); }
    if (p->s[q] == '0') { q++; if (q < p->n && p->s[q] >= '0' && p->s[q] <= '9') return js_falla(p, JE_NUM, q); }
    else while (q < p->n && p->s[q] >= '0' && p->s[q] <= '9') q++;
    if (q < p->n && p->s[q] == '.') { q++; if (q >= p->n || p->s[q] < '0' || p->s[q] > '9') return js_falla(p, JE_FRAC, q); while (q < p->n && p->s[q] >= '0' && p->s[q] <= '9') q++; }
    if (q < p->n && (p->s[q] == 'e' || p->s[q] == 'E')) {
      q++; if (q < p->n && (p->s[q] == '+' || p->s[q] == '-')) q++;
      if (q >= p->n || p->s[q] < '0' || p->s[q] > '9') return js_falla(p, JE_EXP, q);
      while (q < p->n && p->s[q] >= '0' && p->s[q] <= '9') q++;
    }
    char tmp[512]; size_t l = q - ini; if (l >= sizeof tmp) l = sizeof tmp - 1; memcpy(tmp, p->s + ini, l); tmp[l] = 0;
    *out = n_num(strtod(tmp, NULL)); p->i = q; return 1;
  }
  if ((p->n == 3 && !memcmp(p->s, "NaN", 3)) || (p->n == 8 && !memcmp(p->s, "Infinity", 8)) || (p->n == 9 && !memcmp(p->s, "undefined", 9))) return js_falla(p, JE_CORTO, 0);
  return js_falla(p, JE_TOKEN, p->i);
}
NAT(sx_deJson) {
  (void)n; (void)extra; TXT(a[0], 1, "deJson");
  char* s = n_a_utf8(a[0], NULL);
  JsP p = { s, strlen(s), 0, 0, 0 }; NV v = n_nulo(), ep = n_nulo();
  int r = js_valor(&p, &v, 0, &ep);
  if (r == -1) { free(s); return ep; }
  if (r == 1) { js_ws(&p); if (p.i < p.n) { n_dec(v); r = js_falla(&p, JE_NOWS, p.i); } }
  if (r != 1) {
    char m[600]; js_mensaje(&p, m, sizeof m);
    /* .slice(0, 120) sobre unidades UTF-16: se corta a 120 caracteres */
    { size_t u = 0, i = 0; while (m[i] && u < 120) { unsigned char c = (unsigned char)m[i]; size_t w = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : c >= 0xC0 ? 2 : 1; u += w == 4 ? 2 : 1; i += w; } m[i] = 0; }
    free(s);
    return n_errorT(n_texto_utf8("«deJson»: el texto no es JSON válido"), n_texto_utf8(m));
  }
  free(s);
  return v;
}
static void js_escribir_cadena(NBuf* b, NV t) {
  NTexto* x = (NTexto*)t.u.o;
  b_c(b, '"');
  for (int64_t i = 0; i < x->n; i++) {
    uint16_t c = x->s[i];
    switch (c) {
      case '"': b_utf8(b, "\\\""); break; case '\\': b_utf8(b, "\\\\"); break; case 8: b_utf8(b, "\\b"); break; case 12: b_utf8(b, "\\f"); break;
      case 10: b_utf8(b, "\\n"); break; case 13: b_utf8(b, "\\r"); break; case 9: b_utf8(b, "\\t"); break;
      default:
        if (c < 0x20) { char e[8]; snprintf(e, sizeof e, "\\u%04x", c); b_utf8(b, e); }
        else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < x->n && x->s[i + 1] >= 0xDC00 && x->s[i + 1] <= 0xDFFF) { b_c(b, c); b_c(b, x->s[++i]); }
        else if (c >= 0xD800 && c <= 0xDFFF) { char e[8]; snprintf(e, sizeof e, "\\u%04x", c); b_utf8(b, e); }
        else b_c(b, c);
    }
  }
  b_c(b, '"');
}
static int js_escribir(NBuf* b, NV v, int prof, int bonito, int nivel, NV* err) {
  if (prof > 32) { *err = ERR("«aJson»: el valor está anidado demasiado hondo"); return 0; }
  if (v.t == N_NULO) { b_utf8(b, "null"); return 1; }
  if (v.t == N_BOOL) { b_utf8(b, v.u.b ? "true" : "false"); return 1; }
  if (v.t == N_NUM) { if (!isfinite(v.u.n)) { b_utf8(b, "null"); return 1; } char nb[64]; num_js(v.u.n == 0 ? 0.0 : v.u.n, nb); b_utf8(b, nb); return 1; }
  if (n_es(v, NC_TEXTO)) { js_escribir_cadena(b, v); return 1; }
  if (n_es(v, NC_LISTA)) {
    NLista* l = LS(v);
    if (l->n == 0) { b_utf8(b, "[]"); return 1; }
    b_c(b, '[');
    for (int64_t i = 0; i < l->n; i++) {
      if (i) b_c(b, ',');
      if (bonito) { b_c(b, '\n'); for (int k = 0; k < (nivel + 1) * 2; k++) b_c(b, ' '); }
      NV x = n_lista_leer(l, i); int ok = js_escribir(b, x, prof + 1, bonito, nivel + 1, err); n_dec(x);
      if (!ok) return 0;
    }
    if (bonito) { b_c(b, '\n'); for (int k = 0; k < nivel * 2; k++) b_c(b, ' '); }
    b_c(b, ']'); return 1;
  }
  if (n_es(v, NC_DIC)) {
    /* o[String(k)] = …: el objeto de JS reordena las claves que son índices y junta las repetidas */
    NDic* d = DC(v);
    NV o = n_dic_nuevo();
    for (int64_t i = 0; i < d->usados; i++) if (d->e[i].vivo) { NV k = n_texto_de(d->e[i].k); n_dic_poner(DC(o), k, d->e[i].v); n_dec(k); }
    o = js_ordenar_claves(o);
    NDic* od = DC(o);
    if (od->n == 0) { b_utf8(b, "{}"); n_dec(o); return 1; }
    b_c(b, '{'); int primero = 1;
    for (int64_t i = 0; i < od->usados; i++) if (od->e[i].vivo) {
      if (!primero) b_c(b, ',');
      primero = 0;
      if (bonito) { b_c(b, '\n'); for (int k = 0; k < (nivel + 1) * 2; k++) b_c(b, ' '); }
      js_escribir_cadena(b, od->e[i].k); b_c(b, ':'); if (bonito) b_c(b, ' ');
      if (!js_escribir(b, od->e[i].v, prof + 1, bonito, nivel + 1, err)) { n_dec(o); return 0; }
    }
    if (bonito) { b_c(b, '\n'); for (int k = 0; k < nivel * 2; k++) b_c(b, ' '); }
    b_c(b, '}'); n_dec(o); return 1;
  }
  *err = n_errorT(msg("«aJson» no puede convertir %s", n_tipo_de(v)), n_texto_utf8("se convierten números, textos, booleanos, nulo, listas y diccionarios"));
  return 0;
}
NAT(sx_aJson) {
  (void)extra;
  int bonito = n > 1 && a[1].t == N_BOOL && a[1].u.b;
  NBuf b = {0}; NV err;
  if (!js_escribir(&b, a[0], 0, bonito, 0, &err)) { free(b.s); return err; }
  return b_texto(&b);
}

/* ═════════════════════════════════════════════ introspección */
NAT(sx_memoria) {
  SIN_USO;
  NV d = n_dic_nuevo();
  dic_pon(d, "objetos", n_num(0)); dic_pon(d, "recolecciones", n_num(0)); dic_pon(d, "liberados", n_num(0)); dic_pon(d, "pico", n_num(0));
  return d;
}
NAT(sx_recolectar) { SIN_USO; return n_nulo(); }
/* no hay bytecode que contar: un número que crece con el tiempo, para que «instrucciones() > 0» y las diferencias entre dos lecturas sigan teniendo sentido */
NAT(sx_instrucciones) { SIN_USO; return n_num(floor(reloj_ms() * 20000.0) + 1.0); }

SX_SIN_ALMACEN(sx_guardar, "guardar") SX_SIN_ALMACEN(sx_recuperar, "recuperar") SX_SIN_ALMACEN(sx_olvidar, "olvidar") SX_SIN_ALMACEN(sx_guardados, "guardados")

#define NAT_SISTEMA \
  { "sistema/unirRuta", -1, sx_unirRuta }, { "sistema/nombreArchivo", 1, sx_nombreArchivo }, { "sistema/extension", 1, sx_extension }, \
  { "sistema/sinExtension", 1, sx_sinExtension }, { "sistema/carpetaDe", 1, sx_carpetaDe }, { "sistema/esRutaAbsoluta", 1, sx_esRutaAbsoluta }, \
  { "sistema/normalizarRuta", 1, sx_normalizarRuta }, { "sistema/rutaAbsoluta", 1, sx_rutaAbsoluta }, { "sistema/rutaRelativa", 2, sx_rutaRelativa }, \
  { "sistema/carpetaActual", 0, sx_carpetaActual }, { "sistema/cambiarCarpeta", 1, sx_cambiarCarpeta }, { "sistema/infoSistema", 0, sx_infoSistema }, \
  { "sistema/infoArchivo", 1, sx_infoArchivo }, { "sistema/copiarArchivo", 2, sx_copiarArchivo }, { "sistema/moverArchivo", 2, sx_moverArchivo }, \
  { "sistema/leerLineas", 1, sx_leerLineas }, { "sistema/ejecutarEnFondo", -1, sx_ejecutarEnFondo }, \
  { "esCarpeta", 1, sx_esCarpeta }, { "listar", 1, sx_listar }, { "crearCarpeta", 1, sx_crearCarpeta }, { "tamanoArchivo", 1, sx_tamanoArchivo }, \
  { "ejecutar", -1, sx_ejecutar }, { "deJson", 1, sx_deJson }, { "aJson", -1, sx_aJson }, \
  { "luego", 2, sx_luego }, { "cada", 2, sx_cada }, { "detener", 1, sx_detener }, \
  { "memoria", 0, sx_memoria }, { "recolectar", 0, sx_recolectar }, { "instrucciones", 0, sx_instrucciones }, \
  { "guardar", 2, sx_guardar }, { "recuperar", -1, sx_recuperar }, { "olvidar", 1, sx_olvidar }, { "guardados", 0, sx_guardados },
