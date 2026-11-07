/* ============================================================================
 *  (motor-exp A7) Arreglos, séptima tanda: leerArregloBinario y escribirArregloBinario (bytes crudos, el formato de tofile/fromfile de NumPy).
 *  Mismos tipos, mismo orden de comprobaciones y mismos mensajes que src/04-stdlib.js. Los tipos i64 y u64 dan el error claro de siempre
 *  (el ejecutable todavía no los trae como arreglos).
 * ========================================================================== */
static int ar7_bin_ok(int t) { return t == AR_REAL || t == AR_ENTERO || t == AR_REAL32 || t == AR_REAL16 || (t >= AR_I8 && t <= AR_U64); }
static int ar7_bytes(int t) { switch (t) { case AR_REAL: case AR_I64: case AR_U64: return 8; case AR_ENTERO: case AR_REAL32: case AR_U32: return 4; case AR_REAL16: case AR_I16: case AR_U16: return 2; default: return 1; } }
static uint16_t ar7_bits16(double x) {   /* binary16 de un valor ya representable en media precisión (src/03-vm-jit.js: bitsDe16) */
  if (x != x) return 0x7e00;
  uint16_t sg = (x < 0 || (x == 0 && signbit(x))) ? 0x8000 : 0; double a = fabs(x);
  if (isinf(a)) return (uint16_t)(sg | 0x7c00);
  if (a == 0) return sg;
  if (a < 6.103515625e-05) return (uint16_t)(sg | (uint16_t)floor(a / 5.960464477539063e-08 + 0.5));
  int ex; frexp(a, &ex); int e = ex - 1;
  return (uint16_t)(sg | ((e + 15) << 10) | (int)floor((a / ldexp(1.0, e) - 1) * 1024 + 0.5));
}
static double ar7_de16(uint16_t h) {
  double sg = (h & 0x8000) ? -1 : 1; int e = (h >> 10) & 31, m = h & 1023;
  if (e == 0) return sg * m * 5.960464477539063e-08;
  if (e == 31) return m ? NAN : sg * INFINITY;
  return sg * (1 + m / 1024.0) * ldexp(1.0, e - 15);
}
NAT(ar7_leerArregloBinario) {
  (void)n; (void)extra; TXT(a[0], 1, "leerArregloBinario"); TXT(a[1], 2, "leerArregloBinario");
  int t = ar_tipo_de_nombre(a[1]);
  if (t < 0 || !ar7_bin_ok(t)) {
    NBuf b = {0}; int primero = 1;
    for (int i = 0; i < AR_NTIPOS; i++) if (ar7_bin_ok(i)) { if (!primero) b_utf8(&b, ", "); primero = 0; b_utf8(&b, "«"); b_utf8(&b, AR_NOMBRE[i]); b_utf8(&b, "»"); }
    NV ls = b_texto(&b); NV e = ERR("«leerArregloBinario»: el tipo es uno de %v, no «%v»", ls, a[1]); n_dec(ls); return e;
  }
  LST(a[2], 3, "leerArregloBinario");
  NLista* fl = LS(a[2]); int nd = (int)fl->n; int64_t forma[AR_MAXND];
  if (nd > AR_MAXND) return ERR("«leerArregloBinario»: demasiadas dimensiones (%d)", (long long)nd);
  for (int i = 0; i < nd; i++) { NV x = n_lv(fl)[i]; NV e_; if (!exige_num(x, 3, "leerArregloBinario", &e_)) return e_; forma[i] = (int32_t)ar_touint32(x.u.n); }
  FILE* f = abrir_ruta(a[0], "rb"); if (!f) return err_arch("leerArregloBinario", "no se pudo leer", a[0]);
  size_t cap = 4096, len = 0, k; unsigned char* bytes = (unsigned char*)n_mem(cap);
  while ((k = fread(bytes + len, 1, cap - len, f)) > 0) { len += k; if (len == cap) { cap *= 2; bytes = (unsigned char*)n_remem(bytes, cap); } }
  fclose(f);
  NV out = ar_nuevo(forma, nd, t); if (N_FALLO(out)) { free(bytes); return out; }
  int64_t cnt = ar_tam(AR(out)), esperado = cnt * ar7_bytes(t);
  if ((int64_t)len != esperado) {
    NV fx = ar_formas_txt(forma, nd); n_dec(out); free(bytes);
    NV e = ERR("«leerArregloBinario»: el archivo tiene %d bytes y la forma %v de %s pide %d", (long long)len, fx, AR_NOMBRE[t], (long long)esperado); n_dec(fx); return e;
  }
  for (int64_t i = 0; i < cnt; i++) {
    const unsigned char* p = bytes + i * ar7_bytes(t); double v = 0;
    switch (t) {
      case AR_REAL: { double d; memcpy(&d, p, 8); v = d; break; }
      case AR_ENTERO: { int32_t d; memcpy(&d, p, 4); v = d; break; }
      case AR_REAL32: { float d; memcpy(&d, p, 4); v = d; break; }
      case AR_REAL16: { uint16_t d; memcpy(&d, p, 2); v = ar7_de16(d); break; }
      case AR_I8: v = (int8_t)p[0]; break;
      case AR_U8: v = p[0]; break;
      case AR_I16: { int16_t d; memcpy(&d, p, 2); v = d; break; }
      case AR_U16: { uint16_t d; memcpy(&d, p, 2); v = d; break; }
      case AR_U32: { uint32_t d; memcpy(&d, p, 4); v = d; break; }
    }
    ar_escribir(AR(out), i, v);
  }
  free(bytes); return out;
}
NAT(ar7_escribirArregloBinario) {
  (void)n; (void)extra; TXT(a[0], 1, "escribirArregloBinario");
  if (!n_es(a[1], NC_ARREGLO)) return ERR("«escribirArregloBinario»: el argumento 2 debe ser un arreglo y es %s", n_tipo_de(a[1]));
  NArr* x = AR(a[1]);
  if (!ar7_bin_ok(x->tipo)) {
    NBuf b = {0}; int primero = 1;
    for (int i = 0; i < AR_NTIPOS; i++) if (ar7_bin_ok(i)) { if (!primero) b_utf8(&b, ", "); primero = 0; b_utf8(&b, AR_NOMBRE[i]); }
    NV ls = b_texto(&b); NV e = ERR("«escribirArregloBinario»: solo arreglos %v, no %s", ls, AR_NOMBRE[x->tipo]); n_dec(ls); return e;
  }
  int t = x->tipo, w = ar7_bytes(t); int64_t cnt = ar_tam(x);
  unsigned char* bytes = (unsigned char*)n_mem((size_t)(cnt * w + 1)); ArIt it; int64_t p, i = 0; ari_ini(&it, x);
  while (ari_sig(&it, &p)) {
    double v = ar_leer(x, p); unsigned char* q = bytes + i * w; i++;
    switch (t) {
      case AR_REAL: memcpy(q, &v, 8); break;
      case AR_ENTERO: { int32_t d = (int32_t)v; memcpy(q, &d, 4); break; }
      case AR_REAL32: { float d = (float)v; memcpy(q, &d, 4); break; }
      case AR_REAL16: { uint16_t d = ar7_bits16(v); memcpy(q, &d, 2); break; }
      case AR_I8: q[0] = (unsigned char)(int8_t)v; break;
      case AR_U8: q[0] = (unsigned char)v; break;
      case AR_I16: { int16_t d = (int16_t)v; memcpy(q, &d, 2); break; }
      case AR_U16: { uint16_t d = (uint16_t)v; memcpy(q, &d, 2); break; }
      case AR_U32: { uint32_t d = (uint32_t)v; memcpy(q, &d, 4); break; }
    }
  }
  FILE* f = abrir_ruta(a[0], "wb"); if (!f) { free(bytes); return err_arch("escribirArregloBinario", "no se pudo escribir", a[0]); }
  fwrite(bytes, 1, (size_t)(cnt * w), f); fclose(f); free(bytes);
  return n_nulo();
}

#define NAT_ARREGLO7 \
  { "leerArregloBinario", 3, ar7_leerArregloBinario }, { "escribirArregloBinario", 2, ar7_escribirArregloBinario },
