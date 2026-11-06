/* ============================================================================
 *  (motor-exp A6) Red: el servidor HTTP del eDSL «sistema» (servir, respuesta, detenerServidor) y pedir.
 *
 *  servir: un hilo por servidor acepta conexiones, y un hilo por conexión lee la petición, la entrega al hilo principal (el bucle de eventos, nrt_sistema.inc)
 *  y espera la respuesta para escribirla. La función de Ñ siempre corre en el hilo principal. HTTP/1.1 con «Connection: close».
 *  pedir: usa curl (del sistema) desde otro hilo: sirve para http y https sin llevar una biblioteca de TLS dentro del ejecutable.
 * ========================================================================== */
#if defined(_WIN32)
typedef SOCKET sock_t;
#define SOCK_INVALIDO INVALID_SOCKET
#define sock_cerrar(s) closesocket(s)
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
typedef int sock_t;
#define SOCK_INVALIDO (-1)
#define sock_cerrar(s) close(s)
#endif

static void red_iniciar(void) {
#if defined(_WIN32)
  static int ini = 0; if (!ini) { WSADATA w; WSAStartup(MAKEWORD(2, 2), &w); ini = 1; }
#endif
}

/* ── respuestas (lo que devuelve «respuesta(estado, cuerpo, opciones?)» y lo que el manejador devuelve) ── */
typedef struct { int estado; char* tipo; char* cuerpo; size_t ncuerpo; char** cab; int ncab; } RsResp;   /* cab: «Nombre: valor» */
static void rs_liberar(RsResp* r) { free(r->tipo); free(r->cuerpo); for (int i = 0; i < r->ncab; i++) free(r->cab[i]); free(r->cab); memset(r, 0, sizeof *r); }
/* las respuestas hechas por respuesta(): el diccionario que ve el programa lleva una marca, y aquí los datos ya comprobados */
typedef struct RsEnt { NDic* d; RsResp r; struct RsEnt* sig; } RsEnt;
static RsEnt* rs_tabla = NULL;
static void rs_olvidar(NDic* d) {   /* lo llama liberar_uno al soltar un diccionario marcado */
  for (RsEnt** pp = &rs_tabla; *pp; pp = &(*pp)->sig) if ((*pp)->d == d) { RsEnt* e = *pp; *pp = e->sig; rs_liberar(&e->r); free(e); return; }
}
static RsEnt* rs_buscar(NDic* d) { for (RsEnt* e = rs_tabla; e; e = e->sig) if (e->d == d) return e; return NULL; }
static int rs_es_html(const char* s) { while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r') s++; return *s == '<'; }
static void rs_poner_texto(RsResp* r, const char* s, size_t n, const char* tipo) {
  r->cuerpo = (char*)n_mem(n + 1); memcpy(r->cuerpo, s, n); r->cuerpo[n] = 0; r->ncuerpo = n; r->tipo = sx_dup(tipo);
}
/* el manejador devolvió v → una respuesta HTTP (respuesta() de la biblioteca). 0 si falla (error pendiente). */
static int rs_de_valor(NV v, RsResp* r, NV* err) {
  memset(r, 0, sizeof *r); r->estado = 200;
  if (v.t == N_NULO) { r->estado = 204; rs_poner_texto(r, "", 0, "text/plain; charset=utf-8"); return 1; }
  if (n_es(v, NC_TEXTO)) {
    int64_t n; char* s = n_a_utf8(v, &n);
    rs_poner_texto(r, s, (size_t)n, rs_es_html(s) ? "text/html; charset=utf-8" : "text/plain; charset=utf-8"); free(s); return 1;
  }
  if (n_es(v, NC_DIC) && v.u.o->marca) {
    RsEnt* e = rs_buscar(DC(v));
    if (e) {
      r->estado = e->r.estado; r->tipo = sx_dup(e->r.tipo); r->cuerpo = (char*)n_mem(e->r.ncuerpo + 1); memcpy(r->cuerpo, e->r.cuerpo, e->r.ncuerpo + 1); r->ncuerpo = e->r.ncuerpo;
      r->ncab = e->r.ncab; r->cab = (char**)n_mem(sizeof(char*) * (size_t)(r->ncab ? r->ncab : 1)); for (int i = 0; i < r->ncab; i++) r->cab[i] = sx_dup(e->r.cab[i]);
      return 1;
    }
  }
  if (n_es(v, NC_LISTA) || n_es(v, NC_DIC)) {
    NBuf b = {0};
    if (!js_escribir(&b, v, 0, 0, 0, err)) { free(b.s); return 0; }
    NV t = b_texto(&b); int64_t n; char* s = n_a_utf8(t, &n); n_dec(t);
    rs_poner_texto(r, s, (size_t)n, "application/json; charset=utf-8"); free(s); return 1;
  }
  NV t = n_repr(v, 0); int64_t n; char* s = n_a_utf8(t, &n); n_dec(t);
  rs_poner_texto(r, s, (size_t)n, "text/plain; charset=utf-8"); free(s); return 1;
}
static int rs_nombre_valido(const char* s) {
  if (!((s[0] >= 'A' && s[0] <= 'Z') || (s[0] >= 'a' && s[0] <= 'z'))) return 0;
  for (const char* p = s; *p; p++) if (!((*p >= 'A' && *p <= 'Z') || (*p >= 'a' && *p <= 'z') || (*p >= '0' && *p <= '9') || *p == '-')) return 0;
  return 1;
}
NAT(rs_respuesta) {
  (void)extra;
  if (n < 2 || n > 3) return n_error("«respuesta» es respuesta(estado, cuerpo) o respuesta(estado, cuerpo, {\"tipo\": …, \"cabeceras\": {…}})", NULL);
  if (a[0].t != N_NUM || a[0].u.n != trunc(a[0].u.n)) return ERR("«respuesta»: el argumento 1 debe ser un entero y es %s", n_tipo_de(a[0]));
  int estado = (int)a[0].u.n;
  if (a[0].u.n < 100 || a[0].u.n > 599) return ERR("«respuesta»: %d no es un estado HTTP (van de 100 a 599)", (long long)a[0].u.n);
  RsEnt* e = (RsEnt*)n_mem(sizeof(RsEnt)); memset(e, 0, sizeof *e);
  NV err = n_nulo();
  if (!rs_de_valor(a[1], &e->r, &err)) { free(e); return err; }
  e->r.estado = estado;
  if (estado == 204) { free(e->r.cuerpo); e->r.cuerpo = sx_dup(""); e->r.ncuerpo = 0; }
  if (n > 2 && a[2].t != N_NULO) {
    if (!n_es(a[2], NC_DIC)) { rs_liberar(&e->r); free(e); return n_error("«respuesta»: las opciones van en un diccionario", NULL); }
    NDic* o = DC(a[2]);
    for (int64_t i = 0; i < o->usados; i++) {
      if (!o->e[i].vivo) continue;
      NV kt = n_texto_de(o->e[i].k); char* k = n_a_utf8(kt, NULL); n_dec(kt); NV x = o->e[i].v;
      if (!strcmp(k, "tipo")) {
        if (!n_es(x, NC_TEXTO)) { NV r = ERR("«respuesta»: el argumento 3 debe ser texto y es %s", n_tipo_de(x)); free(k); rs_liberar(&e->r); free(e); return r; }
        free(e->r.tipo); e->r.tipo = n_a_utf8(x, NULL);
      } else if (!strcmp(k, "cabeceras")) {
        if (!n_es(x, NC_DIC)) { free(k); rs_liberar(&e->r); free(e); return n_error("«respuesta»: «cabeceras» es un diccionario {Nombre: valor}", NULL); }
        NDic* c = DC(x);
        for (int64_t j = 0; j < c->usados; j++) {
          if (!c->e[j].vivo) continue;
          NV nt = n_texto_de(c->e[j].k); char* nm = n_a_utf8(nt, NULL); n_dec(nt);
          NV vt = n_repr(c->e[j].v, 0); char* val = n_a_utf8(vt, NULL); n_dec(vt);
          NV r = n_nulo(); int mal = 0;
          if (!rs_nombre_valido(nm)) { r = ERR("«respuesta»: «%s» no es un nombre de cabecera válido", nm); mal = 1; }
          else if (strchr(val, '\r') || strchr(val, '\n')) { r = ERR("«respuesta»: el valor de «%s» lleva un salto de línea", nm); mal = 1; }
          if (mal) { free(nm); free(val); free(k); rs_liberar(&e->r); free(e); return r; }
          char* h = sx_cat(nm, ": "); char* h2 = sx_cat(h, val); free(h);
          e->r.cab = (char**)n_remem(e->r.cab, sizeof(char*) * (size_t)(e->r.ncab + 1)); e->r.cab[e->r.ncab++] = h2;
          free(nm); free(val);
        }
      } else {
        NV r = ERRP(n_texto_utf8("las opciones son tipo y cabeceras"), "«respuesta»: no conozco la opción «%s»", k);
        free(k); rs_liberar(&e->r); free(e); return r;
      }
      free(k);
    }
  }
  NV d = n_dic_nuevo();
  dic_pon(d, "estado", n_num((double)estado));
  dic_pon(d, "cuerpo", n_inc(a[1]));
  d.u.o->marca = 1;
  e->d = DC(d); e->sig = rs_tabla; rs_tabla = e;
  return d;
}

/* ── el servidor ─────────────────────────────────────────────────────────── */
#define RED_MAX_CUERPO (8 * 1024 * 1024)
typedef struct RsServ { int id, puerto, activo; sock_t fd; NV fn; NProm* listo; NV dic; struct RsServ* sig; } RsServ;
static RsServ* rs_servs = NULL; static int rs_sig_id = 1;
typedef struct RsPet {
  int srv_id; sock_t cfd;
  char *metodo, *url, *cuerpo, ip[64]; size_t ncuerpo;
  char** cabn; char** cabv; int ncab;
  int hay_resp; RsResp resp;
#if defined(_WIN32)
  CRITICAL_SECTION m; CONDITION_VARIABLE c;
#else
  pthread_mutex_t m; pthread_cond_t c;
#endif
} RsPet;
static void pet_responder(RsPet* p, RsResp* r) {   /* hilo principal: entrega la respuesta al hilo de la conexión, que la escribe y libera p */
#if defined(_WIN32)
  EnterCriticalSection(&p->m); p->resp = *r; p->hay_resp = 1; WakeConditionVariable(&p->c); LeaveCriticalSection(&p->m);
#else
  pthread_mutex_lock(&p->m); p->resp = *r; p->hay_resp = 1; pthread_cond_signal(&p->c); pthread_mutex_unlock(&p->m);
#endif
  memset(r, 0, sizeof *r);
}
static const char* http_razon(int e) {
  switch (e) {
    case 100: return "Continue"; case 101: return "Switching Protocols"; case 200: return "OK"; case 201: return "Created"; case 202: return "Accepted"; case 204: return "No Content";
    case 206: return "Partial Content"; case 301: return "Moved Permanently"; case 302: return "Found"; case 303: return "See Other"; case 304: return "Not Modified";
    case 307: return "Temporary Redirect"; case 308: return "Permanent Redirect"; case 400: return "Bad Request"; case 401: return "Unauthorized"; case 403: return "Forbidden";
    case 404: return "Not Found"; case 405: return "Method Not Allowed"; case 406: return "Not Acceptable"; case 408: return "Request Timeout"; case 409: return "Conflict";
    case 410: return "Gone"; case 413: return "Payload Too Large"; case 415: return "Unsupported Media Type"; case 418: return "I'm a Teapot"; case 422: return "Unprocessable Entity";
    case 429: return "Too Many Requests"; case 500: return "Internal Server Error"; case 501: return "Not Implemented"; case 502: return "Bad Gateway";
    case 503: return "Service Unavailable"; case 504: return "Gateway Timeout"; default: return "unknown";
  }
}
static int sock_escribir(sock_t s, const char* b, size_t n) {
  while (n) {
#if defined(_WIN32)
    int k = send(s, b, (int)(n > 65536 ? 65536 : n), 0);
#else
    ssize_t k = send(s, b, n, MSG_NOSIGNAL);
#endif
    if (k <= 0) return 0;
    b += k; n -= (size_t)k;
  }
  return 1;
}
static void conexion_escribir(RsPet* p) {
  RsResp* r = &p->resp;
  NBuf h = {0}; char t[256];
  snprintf(t, sizeof t, "HTTP/1.1 %d %s\r\nContent-Type: %s\r\n", r->estado, http_razon(r->estado), r->tipo ? r->tipo : "text/plain; charset=utf-8");
  size_t cap = 512 + strlen(t); for (int i = 0; i < r->ncab; i++) cap += strlen(r->cab[i]) + 2;
  char* cab = (char*)n_mem(cap + 128); size_t o = 0;
  o += (size_t)snprintf(cab + o, cap + 128 - o, "%s", t);
  for (int i = 0; i < r->ncab; i++) o += (size_t)snprintf(cab + o, cap + 128 - o, "%s\r\n", r->cab[i]);
  if (r->estado != 204 && r->estado != 304) o += (size_t)snprintf(cab + o, cap + 128 - o, "Content-Length: %zu\r\n", r->ncuerpo);
  o += (size_t)snprintf(cab + o, cap + 128 - o, "Connection: close\r\n\r\n");
  (void)h;
  if (sock_escribir(p->cfd, cab, o) && r->estado != 204 && r->estado != 304 && strcmp(p->metodo, "HEAD")) sock_escribir(p->cfd, r->cuerpo, r->ncuerpo);
  free(cab);
}
static void pet_liberar(RsPet* p) {
  free(p->metodo); free(p->url); free(p->cuerpo);
  for (int i = 0; i < p->ncab; i++) { free(p->cabn[i]); free(p->cabv[i]); }
  free(p->cabn); free(p->cabv); rs_liberar(&p->resp);
#if defined(_WIN32)
  DeleteCriticalSection(&p->m);
#else
  pthread_mutex_destroy(&p->m); pthread_cond_destroy(&p->c);
#endif
  free(p);
}
static char* mem_buscar4(char* b, size_t n) { for (size_t i = 0; i + 4 <= n; i++) if (b[i] == 13 && b[i + 1] == 10 && b[i + 2] == 13 && b[i + 3] == 10) return b + i; return NULL; }
static int ci_igual(const char* a, const char* b, size_t n) {
  for (size_t i = 0; i < n; i++) { char x = a[i], y = b[i]; if (x >= 'A' && x <= 'Z') x = (char)(x + 32); if (y >= 'A' && y <= 'Z') y = (char)(y + 32); if (x != y) return 0; }
  return 1;
}
static int sock_recibir(sock_t s, char** buf, size_t* n, size_t* cap, size_t minimo) {   /* lee hasta tener «minimo» bytes */
  while (*n < minimo) {
    if (*cap - *n < 4096 || *cap < minimo + 1) { *cap = (*cap * 2 > minimo + 4096) ? *cap * 2 : minimo + 4096; *buf = (char*)n_remem(*buf, *cap); }
    size_t pide = *cap - *n; if (pide > 65536) pide = 65536;
    int k = (int)recv(s, *buf + *n, (int)pide, 0);
    if (k <= 0) return 0;
    *n += (size_t)k;
  }
  return 1;
}
/* ── descodificar ── */
static int hexv(char c) { return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1; }
/* %XX → bytes; si mas es 1, «+» es un espacio (formularios). → NULL si hay un % mal formado y estricto */
static char* url_descodificar(const char* s, size_t n, int mas, int estricto) {
  char* o = (char*)n_mem(n + 1); size_t k = 0;
  for (size_t i = 0; i < n; i++) {
    if (s[i] == '%') {
      if (i + 2 < n + 0 + 1 && i + 2 <= n - 1 && hexv(s[i + 1]) >= 0 && hexv(s[i + 2]) >= 0) { o[k++] = (char)(hexv(s[i + 1]) * 16 + hexv(s[i + 2])); i += 2; continue; }
      if (estricto) { free(o); return NULL; }
    }
    o[k++] = (mas && s[i] == '+') ? ' ' : s[i];
  }
  o[k] = 0; return o;
}
/* ── el hilo de una conexión ── */
#if defined(_WIN32)
#define HILO_FN(nombre) static unsigned __stdcall nombre(void* arg)
#define HILO_RET return 0
#else
#define HILO_FN(nombre) static void* nombre(void* arg)
#define HILO_RET return NULL
#endif
static void peticion_acabar(void* dato, int* st);
static void trab_publicar_nuevo(NTrab* t) {   /* desde otro hilo: un trabajo nuevo ya hecho, que el bucle entrega */
  TRAB_LOCK(); trab_pend++; TRAB_UNLOCK();
  trab_publicar(t);
}
static void conexion_mala(sock_t c, const char* linea) {
  char b[256]; snprintf(b, sizeof b, "HTTP/1.1 %s\r\nConnection: close\r\nContent-Length: 0\r\n\r\n", linea);
  sock_escribir(c, b, strlen(b)); sock_cerrar(c);
}
HILO_FN(hilo_conexion) {
  RsPet* p = (RsPet*)arg; sock_t c = p->cfd;
  size_t cap = 8192, n = 0; char* buf = (char*)n_mem(cap);
  size_t fin_cab = 0;
  char* cuerpo = NULL; size_t ncu = 0;
  for (;;) {   /* hasta el final de las cabeceras */
    char* z = n >= 4 ? mem_buscar4(buf, n) : NULL;
    if (z) { fin_cab = (size_t)(z - buf); break; }
    if (n > 65536 || !sock_recibir(c, &buf, &n, &cap, n + 1)) { free(buf); sock_cerrar(c); pet_liberar(p); HILO_RET; }
  }
  buf[fin_cab] = 0;
  /* línea de petición */
  char* eol = strstr(buf, "\r\n"); size_t ll = eol ? (size_t)(eol - buf) : fin_cab;
  char* sp1 = (char*)memchr(buf, ' ', ll); char* sp2 = sp1 ? (char*)memchr(sp1 + 1, ' ', ll - (size_t)(sp1 + 1 - buf)) : NULL;
  if (!sp1 || !sp2) { free(buf); conexion_mala(c, "400 Bad Request"); pet_liberar(p); HILO_RET; }
  p->metodo = (char*)n_mem((size_t)(sp1 - buf) + 1); memcpy(p->metodo, buf, (size_t)(sp1 - buf)); p->metodo[sp1 - buf] = 0;
  p->url = (char*)n_mem((size_t)(sp2 - sp1)); memcpy(p->url, sp1 + 1, (size_t)(sp2 - sp1 - 1)); p->url[sp2 - sp1 - 1] = 0;
  /* cabeceras */
  size_t clen = 0; int chunked = 0;
  for (char* ln = eol ? eol + 2 : buf + fin_cab; ln < buf + fin_cab; ) {
    char* e2 = strstr(ln, "\r\n"); size_t l2 = e2 ? (size_t)(e2 - ln) : (size_t)(buf + fin_cab - ln);
    char* dp = (char*)memchr(ln, ':', l2);
    if (dp) {
      size_t ln_n = (size_t)(dp - ln); char* v = dp + 1; size_t lv = l2 - ln_n - 1;
      while (lv && (*v == ' ' || *v == '\t')) { v++; lv--; }
      while (lv && (v[lv - 1] == ' ' || v[lv - 1] == '\t')) lv--;
      char* nm = (char*)n_mem(ln_n + 1); for (size_t i = 0; i < ln_n; i++) { char ch = ln[i]; nm[i] = (ch >= 'A' && ch <= 'Z') ? (char)(ch + 32) : ch; } nm[ln_n] = 0;
      int dup = -1; for (int i = 0; i < p->ncab; i++) if (!strcmp(p->cabn[i], nm)) dup = i;
      int idx;
      if (dup >= 0) { size_t a = strlen(p->cabv[dup]); p->cabv[dup] = (char*)n_remem(p->cabv[dup], a + lv + 3); memcpy(p->cabv[dup] + a, ", ", 2); memcpy(p->cabv[dup] + a + 2, v, lv); p->cabv[dup][a + 2 + lv] = 0; free(nm); idx = dup; }
      else {
        p->cabn = (char**)n_remem(p->cabn, sizeof(char*) * (size_t)(p->ncab + 1)); p->cabv = (char**)n_remem(p->cabv, sizeof(char*) * (size_t)(p->ncab + 1));
        p->cabn[p->ncab] = nm; p->cabv[p->ncab] = (char*)n_mem(lv + 1); memcpy(p->cabv[p->ncab], v, lv); p->cabv[p->ncab][lv] = 0; idx = p->ncab; p->ncab++;
      }
      if (ln_n == 14 && ci_igual(ln, "content-length", 14)) clen = (size_t)strtoull(p->cabv[idx], NULL, 10);
      if (ln_n == 17 && ci_igual(ln, "transfer-encoding", 17) && strstr(p->cabv[idx], "chunked")) chunked = 1;
    }
    if (!e2) break;
    ln = e2 + 2;
  }
  /* cuerpo */
  size_t ini = fin_cab + 4; cuerpo = (char*)n_mem(1);
  if (chunked) {
    size_t pos = ini;
    for (;;) {
      char* z;
      while (!(z = (char*)memchr(buf + pos, '\n', n > pos ? n - pos : 0))) { if (!sock_recibir(c, &buf, &n, &cap, n + 1)) goto malo; }
      size_t tam = (size_t)strtoull(buf + pos, NULL, 16); pos = (size_t)(z - buf) + 1;
      if (tam == 0) break;
      if (ncu + tam > RED_MAX_CUERPO) goto malo;
      if (!sock_recibir(c, &buf, &n, &cap, pos + tam + 2)) goto malo;
      cuerpo = (char*)n_remem(cuerpo, ncu + tam + 1); memcpy(cuerpo + ncu, buf + pos, tam); ncu += tam; pos += tam + 2;
    }
  } else if (clen) {
    if (clen > RED_MAX_CUERPO) goto malo;
    if (!sock_recibir(c, &buf, &n, &cap, ini + clen)) goto malo;
    cuerpo = (char*)n_remem(cuerpo, clen + 1); memcpy(cuerpo, buf + ini, clen); ncu = clen;
  }
  cuerpo[ncu] = 0; p->cuerpo = cuerpo; p->ncuerpo = ncu;
  free(buf);
  {  /* al hilo principal, y esperar la respuesta */
    NTrab* t = (NTrab*)n_mem(sizeof(NTrab)); t->sig = NULL; t->trabajo = NULL; t->acabar = peticion_acabar; t->dato = p;
    trab_publicar_nuevo(t);
  }
#if defined(_WIN32)
  EnterCriticalSection(&p->m); while (!p->hay_resp) SleepConditionVariableCS(&p->c, &p->m, INFINITE); LeaveCriticalSection(&p->m);
#else
  pthread_mutex_lock(&p->m); while (!p->hay_resp) pthread_cond_wait(&p->c, &p->m); pthread_mutex_unlock(&p->m);
#endif
  conexion_escribir(p);
  sock_cerrar(c); pet_liberar(p);
  HILO_RET;
malo:
  free(buf); free(cuerpo); conexion_mala(c, "400 Bad Request"); pet_liberar(p);
  HILO_RET;
}
typedef struct { sock_t fd; int id; } RsAcepta;
HILO_FN(hilo_acepta) {
  RsAcepta ac = *(RsAcepta*)arg; free(arg);
  for (;;) {
    struct sockaddr_in sa; socklen_t sl = sizeof sa;
    sock_t c = accept(ac.fd, (struct sockaddr*)&sa, &sl);
    if (c == SOCK_INVALIDO) break;
    RsPet* p = (RsPet*)n_mem(sizeof(RsPet)); memset(p, 0, sizeof *p);
    p->srv_id = ac.id; p->cfd = c;
    inet_ntop(AF_INET, &sa.sin_addr, p->ip, sizeof p->ip);
#if defined(_WIN32)
    InitializeCriticalSection(&p->m); InitializeConditionVariable(&p->c);
    { uintptr_t h = _beginthreadex(NULL, 0, hilo_conexion, p, 0, NULL); if (h) CloseHandle((HANDLE)h); else { sock_cerrar(c); pet_liberar(p); } }
#else
    pthread_mutex_init(&p->m, NULL); pthread_cond_init(&p->c, NULL);
    { pthread_t th; pthread_attr_t at; pthread_attr_init(&at); pthread_attr_setdetachstate(&at, PTHREAD_CREATE_DETACHED);
      if (pthread_create(&th, &at, hilo_conexion, p) != 0) { sock_cerrar(c); pet_liberar(p); }
      pthread_attr_destroy(&at); }
#endif
  }
  HILO_RET;
}
static RsServ* rs_servidor(int id) { for (RsServ* s = rs_servs; s; s = s->sig) if (s->id == id) return s; return NULL; }
/* la petición ya respondida con 500 y el error pendiente → lo ve el bucle */
static void pet_error500(RsPet* p) {
  RsResp r; memset(&r, 0, sizeof r); r.estado = 500; rs_poner_texto(&r, "error interno del servidor", 26, "text/plain; charset=utf-8");
  pet_responder(p, &r);
}
typedef struct { RsPet* p; char* ruta; } RsEspera;
static void peticion_promesa(int ok, NV v, void* d) {
  RsEspera* w = (RsEspera*)d; RsPet* p = w->p;
  if (!ok) {
    NV m = n_es(v, NC_ERROR) ? n_inc(((NError*)v.u.o)->mensaje) : n_repr(v, 0);
    char* ms = n_a_utf8(m, NULL); n_dec(m);
    pet_error500(p);
    NBuf b = {0}; b_utf8(&b, "[ejecuci\xC3\xB3n] una petici\xC3\xB3n a "); NV rt = n_texto_utf8(w->ruta); b_txt(&b, rt); n_dec(rt); b_utf8(&b, " fall\xC3\xB3: "); NV mt = n_texto_utf8(ms); b_txt(&b, mt); n_dec(mt);
    NV t = b_texto(&b); n_salida(t); n_dec(t); fflush(stdout); free(ms); g_codigo_turnos = 1;
  } else {
    RsResp r; NV err = n_nulo();
    if (rs_de_valor(v, &r, &err)) pet_responder(p, &r);
    else { pet_error500(p); n_imprimir_fallo(); err_limpiar(); g_codigo_turnos = 1; }
  }
  free(w->ruta); free(w);
}
static NV consulta_dic(const char* q) {
  NV d = n_dic_nuevo();
  while (q && *q) {
    const char* amp = strchr(q, '&'); size_t l = amp ? (size_t)(amp - q) : strlen(q);
    if (l) {
      const char* ig = (const char*)memchr(q, '=', l);
      size_t lk = ig ? (size_t)(ig - q) : l;
      char* k = url_descodificar(q, lk, 1, 0); char* v = ig ? url_descodificar(ig + 1, l - lk - 1, 1, 0) : sx_dup("");
      NV kt = n_texto_utf8(k), vt = n_texto_utf8(v); n_dic_poner(DC(d), kt, vt); n_dec(kt); n_dec(vt); free(k); free(v);
    }
    q = amp ? amp + 1 : NULL;
  }
  return js_ordenar_claves(d);
}
static void peticion_acabar(void* dato, int* st) {
  RsPet* p = (RsPet*)dato; RsServ* s = rs_servidor(p->srv_id);
  if (!s || !s->activo) { RsResp r; memset(&r, 0, sizeof r); r.estado = 503; rs_poner_texto(&r, "", 0, "text/plain"); pet_responder(p, &r); return; }
  /* ruta y consulta */
  char* url = p->url; char* qm = strchr(url, '?'); size_t lp = qm ? (size_t)(qm - url) : strlen(url);
  char* rutaraw = (char*)n_mem(lp + 1); memcpy(rutaraw, url, lp); rutaraw[lp] = 0;
  char* norm = sx_normalize_i(rutaraw[0] ? rutaraw : "/"); free(rutaraw);
  char* ruta = url_descodificar(norm, strlen(norm), 0, 1); free(norm);
  if (!ruta) { RsResp r; memset(&r, 0, sizeof r); r.estado = 400; rs_poner_texto(&r, "", 0, "text/plain"); pet_responder(p, &r); return; }
  NV pd = n_dic_nuevo();
  dic_pon(pd, "metodo", n_texto_utf8(p->metodo));
  dic_pon(pd, "ruta", n_texto_utf8(ruta));
  dic_pon(pd, "consulta", consulta_dic(qm ? qm + 1 : NULL));
  { NV c = n_dic_nuevo(); for (int i = 0; i < p->ncab; i++) dic_pon(c, p->cabn[i], n_texto_utf8(p->cabv[i])); dic_pon(pd, "cabeceras", c); }
  dic_pon(pd, "cuerpo", n_texto_utf8n(p->cuerpo, (int64_t)p->ncuerpo));
  dic_pon(pd, "ip", n_texto_utf8(p->ip));
  NV r = n_llamar(s->fn, &pd, 1);
  n_dec(pd);
  if (N_FALLO(r)) { pet_error500(p); *st = -1; free(ruta); return; }
  if (n_es(r, NC_PROMESA)) {
    NProm* pr = (NProm*)r.u.o; pr->vista = 1;
    RsEspera* w = (RsEspera*)n_mem(sizeof(RsEspera)); w->p = p; w->ruta = ruta;
    if (pr->estado == 0) { NEsp e; memset(&e, 0, sizeof e); e.tipo = CW_CB; e.f = peticion_promesa; e.d = w; prom_agregar(pr, e); }
    else peticion_promesa(pr->estado == 1, pr->valor, w);
    n_dec(r);
    return;
  }
  RsResp resp; NV err = n_nulo();
  if (rs_de_valor(r, &resp, &err)) pet_responder(p, &resp);
  else { pet_error500(p); *st = -1; }
  n_dec(r); free(ruta);
}
static void servir_listo(void* dato, int* st) {
  RsServ* s = (RsServ*)dato;
  NV k = n_texto_utf8("puerto"); n_dic_poner(DC(s->dic), k, n_num((double)s->puerto)); n_dec(k);
  *st = prom_cumplir(s->listo, s->dic, 1);
}
typedef struct { RsServ* s; char* error; } RsFallo;
static void servir_fallo(void* dato, int* st) {
  RsFallo* f = (RsFallo*)dato;
  char m[600]; snprintf(m, sizeof m, "\xC2\xAB" "servir\xC2\xBB: %s", f->error);
  NError* e = (NError*)n_objeto(sizeof(NError), NC_ERROR); e->tipo = n_texto_utf8("sistema"); e->mensaje = n_texto_utf8(m); e->linea = 0;
  NV er = n_obj(e);
  *st = prom_cumplir(f->s->listo, er, 0);
  n_dec(er); free(f->error); free(f);
}
static void trab_post(void (*acabar)(void*, int*), void* dato) {   /* un trabajo sin hilo: lo entrega el bucle en su próxima vuelta */
  NTrab* t = (NTrab*)n_mem(sizeof(NTrab)); t->sig = NULL; t->trabajo = NULL; t->acabar = acabar; t->dato = dato;
  trab_iniciar(); trab_publicar_nuevo(t);
}
NAT(rs_servir) {
  (void)extra;
  if (n < 2 || n > 3) return n_error("«servir» es servir(puerto, funcion) o servir(puerto, funcion, {\"anfitrion\": \"0.0.0.0\"})", NULL);
  if (a[0].t != N_NUM || a[0].u.n != trunc(a[0].u.n)) return ERR("«servir»: el argumento 1 debe ser un entero y es %s", n_tipo_de(a[0]));
  int puerto = (int)a[0].u.n;
  if (a[0].u.n < 0 || a[0].u.n > 65535) return ERR("«servir»: %d no es un puerto (van de 0 a 65535; 0 elige uno libre)", (long long)a[0].u.n);
  if (!n_es(a[1], NC_CIERRE) && !n_es(a[1], NC_NATIVA)) return ERR("«servir»: el argumento 2 debe ser una función y es %s", n_tipo_de(a[1]));
  char ip[64] = "127.0.0.1";
  if (n > 2 && a[2].t != N_NULO) {
    if (!n_es(a[2], NC_DIC)) return n_error("«servir»: las opciones van en un diccionario", NULL);
    NDic* o = DC(a[2]);
    for (int64_t i = 0; i < o->usados; i++) if (o->e[i].vivo) {
      NV kt = n_texto_de(o->e[i].k); char* k = n_a_utf8(kt, NULL); n_dec(kt);
      if (!strcmp(k, "anfitrion")) {
        if (!n_es(o->e[i].v, NC_TEXTO)) { NV r = ERR("«servir»: el argumento 3 debe ser texto y es %s", n_tipo_de(o->e[i].v)); free(k); return r; }
        char* v = n_a_utf8(o->e[i].v, NULL); snprintf(ip, sizeof ip, "%s", v); free(v);
      } else { NV r = ERRP(n_texto_utf8("la opción es anfitrion (\"0.0.0.0\" para abrirlo a la red)"), "«servir»: no conozco la opción «%s»", k); free(k); return r; }
      free(k);
    }
  }
  red_iniciar();
  RsServ* s = (RsServ*)n_mem(sizeof(RsServ)); memset(s, 0, sizeof *s);
  s->id = rs_sig_id++; s->fn = n_inc(a[1]); s->listo = prom_nueva(); s->dic = n_dic_nuevo();
  dic_pon(s->dic, "id", n_num((double)s->id));
  dic_pon(s->dic, "puerto", n_num((double)puerto));
  { NV pl = n_obj(s->listo); N_RC_MAS(&s->listo->h); dic_pon(s->dic, "listo", pl); }
  s->sig = rs_servs; rs_servs = s;
  /* abrir el puerto ya; el resultado (listo o error) llega como un turno, como el «listen» de Node */
  char* error = NULL;
  sock_t fd = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in sa; memset(&sa, 0, sizeof sa); sa.sin_family = AF_INET; sa.sin_port = htons((unsigned short)puerto);
  if (fd == SOCK_INVALIDO) error = sx_dup("no se pudo crear el socket");
  else {
    int uno = 1; setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, (const char*)&uno, sizeof uno);
    if (!strcmp(ip, "localhost")) snprintf(ip, sizeof ip, "127.0.0.1");
    if (inet_pton(AF_INET, ip, &sa.sin_addr) != 1) error = sx_cat("no se pudo usar la dirección ", ip);
    else if (bind(fd, (struct sockaddr*)&sa, sizeof sa) != 0) {
#if defined(_WIN32)
      int e = WSAGetLastError(); int usado = e == WSAEADDRINUSE;
#else
      int e = errno; int usado = e == EADDRINUSE;
#endif
      if (usado) { char m[64]; snprintf(m, sizeof m, "el puerto %d ya est\xC3\xA1 en uso", puerto); error = sx_dup(m); }
      else { char m[200]; snprintf(m, sizeof m, "listen %s: %s", errno_nombre(e), strerror(e)); error = sx_dup(m); }
    } else if (listen(fd, 511) != 0) error = sx_dup("listen fall\xC3\xB3");
  }
  if (error) {
    if (fd != SOCK_INVALIDO) sock_cerrar(fd);
    RsFallo* f = (RsFallo*)n_mem(sizeof(RsFallo)); f->s = s; f->error = error;
    trab_post(servir_fallo, f);
    return n_inc(s->dic);
  }
  socklen_t sl = sizeof sa; getsockname(fd, (struct sockaddr*)&sa, &sl);
  s->puerto = ntohs(sa.sin_port); s->fd = fd; s->activo = 1;
  RsAcepta* ac = (RsAcepta*)n_mem(sizeof(RsAcepta)); ac->fd = fd; ac->id = s->id;
#if defined(_WIN32)
  { uintptr_t h = _beginthreadex(NULL, 0, hilo_acepta, ac, 0, NULL); if (h) CloseHandle((HANDLE)h); }
#else
  { pthread_t th; pthread_attr_t at; pthread_attr_init(&at); pthread_attr_setdetachstate(&at, PTHREAD_CREATE_DETACHED); pthread_create(&th, &at, hilo_acepta, ac); pthread_attr_destroy(&at); }
#endif
  TRAB_LOCK(); trab_pend++; TRAB_UNLOCK();   /* un servidor activo mantiene vivo el programa */
  trab_post(servir_listo, s);
  return n_inc(s->dic);
}
NAT(rs_detenerServidor) {
  (void)n; (void)extra;
  if (!n_es(a[0], NC_DIC)) return n_error("«detenerServidor»: necesita lo que devolvió servir()", NULL);
  NV k = n_texto_utf8("id"), idv = n_nulo(); int hay = n_dic_buscar(DC(a[0]), k, &idv); n_dec(k);
  if (!hay) return n_error("«detenerServidor»: necesita lo que devolvió servir()", NULL);
  if (idv.t != N_NUM) return n_bool(0);
  RsServ* s = rs_servidor((int)idv.u.n);
  if (!s || !s->activo) return n_bool(0);
  s->activo = 0;
#if !defined(_WIN32)
  shutdown(s->fd, SHUT_RDWR);
#endif
  sock_cerrar(s->fd);
  TRAB_LOCK(); trab_pend--; TRAB_UNLOCK();
  return n_bool(1);
}

/* ── pedir: curl, en otro hilo ───────────────────────────────────────────── */
typedef struct {
  SxProc p; char fb[1100], fh[1100], fc[1100];
  char* url; char* metodo; int tiene_cuerpo;
  NProm* prom; NV fn;
  int ok, estado; char* tipo; char* cuerpo; size_t ncuerpo; char* error;
} RdPedir;
static void rd_trabajo(void* d) {
  RdPedir* r = (RdPedir*)d;
  sx_correr(&r->p);
  r->estado = 0; r->tipo = sx_dup(""); r->cuerpo = sx_dup(""); r->ncuerpo = 0; r->error = sx_dup(""); r->ok = 0;
  if (r->p.err_lanzar || r->p.codigo != 0 || r->p.tiempo) {
    free(r->error);
    int c = r->p.codigo;
    char m[800];
    if (r->p.err_lanzar) snprintf(m, sizeof m, "fetch failed: no se pudo lanzar curl (%s); pedir lo necesita para hablar con la red", errno_nombre(r->p.err_lanzar));
    else if (r->p.tiempo || c == 28) snprintf(m, sizeof m, "la petici\xC3\xB3n tard\xC3\xB3 m\xC3\xA1s de 15 s");
    else if (c == 6) { const char* h = strstr(r->url, "://"); h = h ? h + 3 : r->url; size_t l = strcspn(h, "/:?#"); snprintf(m, sizeof m, "fetch failed: getaddrinfo ENOTFOUND %.*s", (int)l, h); }
    else if (c == 7) {
      const char* h = strstr(r->url, "://"); int https = r->url[4] == 's'; h = h ? h + 3 : r->url; size_t l = strcspn(h, "/:?#"); const char* pt = h + l; int port = *pt == ':' ? atoi(pt + 1) : (https ? 443 : 80);
      snprintf(m, sizeof m, "fetch failed: connect ECONNREFUSED %.*s:%d", (int)l, h, port);
    } else snprintf(m, sizeof m, "fetch failed: curl termin\xC3\xB3 con el c\xC3\xB3" "digo %d", c);
    r->error = sx_dup(m);
    return;
  }
  size_t nh; char* h = sx_leer_todo(r->fh, &nh);
  /* el último bloque de cabeceras (puede haber redirecciones) */
  char* ult = h; for (char* q = h; (q = strstr(q, "HTTP/")) != NULL; q++) if (q == h || q[-1] == '\n') ult = q;
  { int est = 0; if (sscanf(ult, "HTTP/%*s %d", &est) == 1) r->estado = est; }
  for (char* ln = ult; *ln; ) {
    char* e2 = strstr(ln, "\r\n"); size_t l2 = e2 ? (size_t)(e2 - ln) : strlen(ln);
    if (l2 > 13 && ci_igual(ln, "content-type:", 13)) {
      char* v = ln + 13; size_t lv = l2 - 13; while (lv && *v == ' ') { v++; lv--; }
      size_t pc = 0; while (pc < lv && v[pc] != ';') pc++;
      while (pc && v[pc - 1] == ' ') pc--;
      free(r->tipo); r->tipo = (char*)n_mem(pc + 1); memcpy(r->tipo, v, pc); r->tipo[pc] = 0;
    }
    if (!e2) break;
    ln = e2 + 2;
  }
  free(h);
  free(r->cuerpo); r->cuerpo = sx_leer_todo(r->fb, &r->ncuerpo);
  r->ok = r->estado >= 200 && r->estado < 300;
}
static void rd_acabar(void* d, int* st) {
  RdPedir* r = (RdPedir*)d;
  NV t = n_nulo(); int64_t carac = 0;
  if (r->ncuerpo) { t = n_texto_utf8n(r->cuerpo, (int64_t)r->ncuerpo); carac = TX(t)->n; }
  NV dic = n_dic_nuevo();
  if (r->ncuerpo && carac > 2 * 1024 * 1024) {
    dic_pon(dic, "ok", n_bool(0)); dic_pon(dic, "estado", n_num((double)r->estado)); dic_pon(dic, "cuerpo", n_texto_utf8("")); dic_pon(dic, "tipo", n_texto_utf8(r->tipo));
    dic_pon(dic, "error", n_texto_utf8("la respuesta ocupa m\xC3\xA1s de 2097152 caracteres"));
    n_dec(t);
  } else {
    dic_pon(dic, "ok", n_bool(r->ok)); dic_pon(dic, "estado", n_num((double)r->estado));
    dic_pon(dic, "cuerpo", r->ncuerpo ? t : n_texto_utf8("")); dic_pon(dic, "tipo", n_texto_utf8(r->tipo)); dic_pon(dic, "error", n_texto_utf8(r->error));
  }
  if (r->prom) *st = prom_cumplir(r->prom, dic, 1);
  else {
    NV x = n_llamar(r->fn, &dic, 1);
    if (N_FALLO(x)) *st = -1; else n_dec(x);
  }
  n_dec(dic);
  if (r->prom) n_dec(n_obj(r->prom));
  n_dec(r->fn);
  remove(r->fb); remove(r->fh); if (r->tiene_cuerpo) remove(r->fc);
  free(r->url); free(r->metodo); free(r->tipo); free(r->cuerpo); free(r->error); sxp_liberar(&r->p); free(r);
}
NAT(rs_pedir) {
  (void)extra;
  if (n < 1) return n_error("«pedir»: el argumento 1 debe ser texto y es nulo", NULL);
  TXT(a[0], 1, "pedir");
  char* url = n_a_utf8(a[0], NULL);
  if (!ci_igual(url, "http://", 7) && !ci_igual(url, "https://", 8)) { free(url); return n_error("«pedir»: la dirección debe empezar por http:// o https://", NULL); }
  NV op = n_nulo(), fn = n_nulo();
  for (int i = 1; i < n; i++) {
    NV x = a[i];
    if (n_es(x, NC_CIERRE) || n_es(x, NC_NATIVA)) { fn = x; continue; }
    if (n_es(x, NC_DIC)) { op = x; continue; }
    if (x.t == N_NULO) continue;
    NV e = ERR("«pedir» no sabe qué hacer con %s en la posición %d", n_tipo_de(x), (long long)(i + 1)); free(url); return e;
  }
  char* metodo = sx_dup("GET"); char* cuerpo = NULL; char** cabs = NULL; int ncabs = 0; int hay_ct = 0;
#define RD_LIMPIAR() do { free(url); free(metodo); free(cuerpo); for (int q_ = 0; q_ < ncabs; q_++) free(cabs[q_]); free(cabs); } while (0)
  if (op.t == N_OBJ) {
    NDic* d = DC(op);
    for (int64_t i = 0; i < d->usados; i++) {
      if (!d->e[i].vivo) continue;
      NV kt = n_texto_de(d->e[i].k); char* k = n_a_utf8(kt, NULL); n_dec(kt); NV v = d->e[i].v;
      if (!strcmp(k, "metodo")) {
        NV m = n_repr(v, 0); char* ms = n_a_utf8(m, NULL); n_dec(m);
        for (char* q = ms; *q; q++) if (*q >= 'a' && *q <= 'z') *q = (char)(*q - 32);
        if (strcmp(ms, "GET") && strcmp(ms, "POST") && strcmp(ms, "PUT") && strcmp(ms, "PATCH") && strcmp(ms, "DELETE") && strcmp(ms, "HEAD")) {
          NV e = ERR("«pedir»: el método «%s» no está permitido", ms); free(ms); free(k); RD_LIMPIAR(); return e;
        }
        free(metodo); metodo = ms;
      } else if (!strcmp(k, "cuerpo")) {
        free(cuerpo); cuerpo = NULL;
        if (v.t != N_NULO) { NV m = n_repr(v, 0); cuerpo = n_a_utf8(m, NULL); n_dec(m); }
      } else if (!strcmp(k, "cabeceras")) {
        if (!n_es(v, NC_DIC)) { free(k); RD_LIMPIAR(); return n_error("«pedir»: «cabeceras» tiene que ser un diccionario", NULL); }
        NDic* c = DC(v);
        for (int64_t j = 0; j < c->usados; j++) {
          if (!c->e[j].vivo) continue;
          NV nt = n_texto_de(c->e[j].k); char* nm = n_a_utf8(nt, NULL); n_dec(nt);
          NV vt = n_repr(c->e[j].v, 0); char* val = n_a_utf8(vt, NULL); n_dec(vt);
          NV e = n_nulo(); int mal = 0;
          if (!rs_nombre_valido(nm)) { e = ERR("«pedir»: «%s» no es un nombre de cabecera válido", nm); mal = 1; }
          else if (strchr(val, '\r') || strchr(val, '\n')) { e = ERR("«pedir»: el valor de «%s» lleva un salto de línea", nm); mal = 1; }
          if (mal) { free(nm); free(val); free(k); RD_LIMPIAR(); return e; }
          if (strlen(nm) == 12 && ci_igual(nm, "content-type", 12)) hay_ct = 1;
          char* h = sx_cat(nm, ": "); char* h2 = sx_cat(h, val); free(h); free(nm); free(val);
          cabs = (char**)n_remem(cabs, sizeof(char*) * (size_t)(ncabs + 1)); cabs[ncabs++] = h2;
        }
      } else { NV e = ERRP(n_texto_utf8("las opciones son metodo, cuerpo y cabeceras"), "«pedir»: no conozco la opción «%s»", k); free(k); RD_LIMPIAR(); return e; }
      free(k);
    }
  }
  if (cuerpo && !hay_ct) { cabs = (char**)n_remem(cabs, sizeof(char*) * (size_t)(ncabs + 1)); cabs[ncabs++] = sx_dup("Content-Type: text/plain;charset=utf-8"); }
  red_iniciar();
  RdPedir* r = (RdPedir*)n_mem(sizeof(RdPedir)); memset(r, 0, sizeof *r);
  r->url = url; r->metodo = metodo; r->fn = n_inc(fn);
  sx_ruta_tmp(r->fb, sizeof r->fb, "b"); sx_ruta_tmp(r->fh, sizeof r->fh, "h"); sx_ruta_tmp(r->fc, sizeof r->fc, "c");
  sx_ruta_tmp(r->p.fo, sizeof r->p.fo, "o"); sx_ruta_tmp(r->p.fe, sizeof r->p.fe, "e"); sx_ruta_tmp(r->p.fi, sizeof r->p.fi, "i");
  SxProc* p = &r->p; p->orden = sx_dup("curl"); p->espera = 20000;
  int head = !strcmp(metodo, "HEAD");
#define RD_ARG(s) do { p->args = (char**)n_remem(p->args, sizeof(char*) * (size_t)(p->nargs + 1)); p->args[p->nargs++] = sx_dup(s); } while (0)
  RD_ARG("-sS"); RD_ARG("-L"); RD_ARG("--max-time"); RD_ARG("15");
  if (head) { RD_ARG("-I"); RD_ARG("-o"); RD_ARG(r->fh); }
  else { RD_ARG("-o"); RD_ARG(r->fb); RD_ARG("-D"); RD_ARG(r->fh); RD_ARG("-X"); RD_ARG(metodo); }
  for (int i = 0; i < ncabs; i++) { RD_ARG("-H"); RD_ARG(cabs[i]); free(cabs[i]); }
  free(cabs);
  if (cuerpo) {
    FILE* f = fopen(r->fc, "wb"); if (f) { fwrite(cuerpo, 1, strlen(cuerpo), f); fclose(f); }
    char arg[1110]; snprintf(arg, sizeof arg, "@%s", r->fc); RD_ARG("--data-binary"); RD_ARG(arg); r->tiene_cuerpo = 1; free(cuerpo);
  }
  RD_ARG(url);
  if (fn.t == N_NULO) { r->prom = prom_nueva(); N_RC_MAS(&r->prom->h); }
  NV res = fn.t == N_NULO ? n_obj(r->prom) : n_nulo();
  if (!trab_lanzar(rd_trabajo, rd_acabar, r)) {
    if (r->prom) { n_dec(res); n_dec(n_obj(r->prom)); }
    n_dec(r->fn); sxp_liberar(&r->p); free(r->url); free(r->metodo); free(r);
    return err_sis_c("pedir", "no se pudo crear el hilo");
  }
  return res;
}

#define NAT_RED \
  { "sistema/respuesta", -1, rs_respuesta }, { "sistema/servir", -1, rs_servir }, { "sistema/detenerServidor", 1, rs_detenerServidor }, { "pedir", -1, rs_pedir },
