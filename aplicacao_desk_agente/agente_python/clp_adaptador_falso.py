"""Equipamento EtherNet/IP SIMULADO, só para testes (nada a ver com um CLP real). Não entra no executável.
  python clp_adaptador_falso.py [porta_tcp] [porta_udp]      (padrão 24818 e 24819, em 127.0.0.1)
Aceita ListIdentity, RegisterSession, Forward Open/Close e troca I/O por UDP. A entrada que devolve ao PC é a
saída que o PC mandou (espelho) OU-ada com `forcadas` (bits que "o equipamento" liga sozinho).
"""
import socket
import struct
import sys
import threading

HOST = "127.0.0.1"


class AdaptadorFalso:
    def __init__(self, porta_tcp=24818, porta_udp=24819, forcadas=b""):
        self.porta_tcp, self.porta_udp = porta_tcp, porta_udp
        self.forcadas = bytearray(forcadas)
        self.recebido = b""            # último dado O->T (saída do PC)
        self.pacotes = 0
        self.forward_opens = 0
        self.forward_closes = 0
        self.recusar = None            # (geral, [estendidos]): faz o próximo Forward Open falhar
        self._parar = threading.Event()
        self._to_id = 0x22222222
        self._ot_id = 0x11111111
        self._to_size = 32

    def iniciar(self):
        self._srv = socket.socket(); self._srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._srv.bind((HOST, self.porta_tcp)); self._srv.listen(5); self._srv.settimeout(0.2)
        self._udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); self._udp.bind((HOST, self.porta_udp)); self._udp.settimeout(0.2)
        threading.Thread(target=self._aceitar, daemon=True).start()
        threading.Thread(target=self._laco_udp, daemon=True).start()
        return self

    def parar(self):
        self._parar.set()
        for s in (self._srv, self._udp):
            try:
                s.close()
            except OSError:
                pass

    # ---- TCP ----
    def _aceitar(self):
        while not self._parar.is_set():
            try:
                c, _ = self._srv.accept()
            except (socket.timeout, OSError):
                continue
            threading.Thread(target=self._cliente, args=(c,), daemon=True).start()

    @staticmethod
    def _ler(c, n):
        b = b""
        while len(b) < n:
            p = c.recv(n - len(b))
            if not p:
                raise OSError("fechou")
            b += p
        return b

    @staticmethod
    def _resp(cmd, sessao, dados):
        return struct.pack("<HHII8sI", cmd, len(dados), sessao, 0, b"\0" * 8, 0) + dados

    def _cliente(self, c):
        sessao = 0x1234ABCD
        try:
            while True:
                h = self._ler(c, 24)
                cmd, tam, _, _ = struct.unpack_from("<HHII", h, 0)
                d = self._ler(c, tam) if tam else b""
                if cmd == 0x0063:      # ListIdentity
                    nome = b"SIMULADOR EtherNet/IP"
                    ident = struct.pack("<H", 1) + b"\0" * 16 + struct.pack("<HHHBBHI", 1, 12, 99, 1, 2, 0, 0xCAFE0001) + bytes([len(nome)]) + nome + b"\x03"
                    c.sendall(self._resp(0x0063, 0, struct.pack("<H", 1) + struct.pack("<HH", 0x000C, len(ident)) + ident))
                elif cmd == 0x0065:
                    c.sendall(self._resp(0x0065, sessao, struct.pack("<HH", 1, 0)))
                elif cmd == 0x0066:
                    return
                elif cmd == 0x006F:
                    c.sendall(self._resp(0x006F, sessao, self._rr(d)))
        except OSError:
            pass
        finally:
            c.close()

    def _rr(self, d):
        cip = None
        p = 8
        for _ in range(struct.unpack_from("<H", d, 6)[0]):
            tipo, tam = struct.unpack_from("<HH", d, p); p += 4
            if tipo == 0x00B2:
                cip = d[p:p + tam]
            p += tam
        cabeca = struct.pack("<IHH", 0, 0, 2) + struct.pack("<HH", 0, 0)
        if cip[0] == 0x54:
            self.forward_opens += 1
            if self.recusar:
                geral, ext = self.recusar
                self.recusar = None
                r = bytes([0xD4, 0, geral, len(ext)]) + b"".join(struct.pack("<H", e) for e in ext)
                return cabeca + struct.pack("<HH", 0x00B2, len(r)) + r
            conn_serie, vendor, serie_orig = struct.unpack_from("<HHI", cip, 16)
            (rpi,) = struct.unpack_from("<I", cip, 28)
            (to_par,) = struct.unpack_from("<H", cip, 38)
            self._to_size = (to_par & 0x1FF) - 2
            r = bytes([0xD4, 0, 0, 0]) + struct.pack("<IIHHIIIBB", self._ot_id, self._to_id, conn_serie, vendor, serie_orig, rpi, rpi, 0, 0)
            sock = struct.pack(">hHI8x", 2, self.porta_udp, 0)
            return (struct.pack("<IHH", 0, 0, 3) + struct.pack("<HH", 0, 0) + struct.pack("<HH", 0x00B2, len(r)) + r
                    + struct.pack("<HH", 0x8000, len(sock)) + sock)
        if cip[0] == 0x4E:
            self.forward_closes += 1
            r = bytes([0xCE, 0, 0, 0]) + cip[8:16] + bytes([0, 0])
            return cabeca + struct.pack("<HH", 0x00B2, len(r)) + r
        r = bytes([cip[0] | 0x80, 0, 0x08, 0])
        return cabeca + struct.pack("<HH", 0x00B2, len(r)) + r

    # ---- UDP ----
    def _laco_udp(self):
        seq = 0
        while not self._parar.is_set():
            try:
                pkt, quem = self._udp.recvfrom(2048)
            except (socket.timeout, OSError):
                continue
            try:
                p = 2
                dados, cip_seq = None, 0
                for _ in range(struct.unpack_from("<H", pkt, 0)[0]):
                    tipo, tam = struct.unpack_from("<HH", pkt, p); p += 4
                    if tipo == 0x00B1:
                        (cip_seq,) = struct.unpack_from("<H", pkt, p)
                        dados = pkt[p + 2 + 4:p + tam]
                    p += tam
                if dados is None:
                    continue
                self.recebido = bytes(dados)
                self.pacotes += 1
                espelho = bytearray(self._to_size)
                for i in range(min(len(espelho), len(dados))):
                    espelho[i] = dados[i]
                for i in range(min(len(espelho), len(self.forcadas))):
                    espelho[i] |= self.forcadas[i]
                seq = (seq + 1) & 0xFFFFFFFF
                out = struct.pack("<HHHIIHHH", 2, 0x8002, 8, self._to_id, seq, 0x00B1, 2 + len(espelho), cip_seq) + bytes(espelho)
                self._udp.sendto(out, quem)
            except Exception:  # noqa: BLE001
                continue


if __name__ == "__main__":
    a = AdaptadorFalso(int(sys.argv[1]) if len(sys.argv) > 1 else 24818, int(sys.argv[2]) if len(sys.argv) > 2 else 24819,
                       forcadas=bytes([0x00, 0x08])).iniciar()      # "o equipamento" liga o bit 515+... (byte 1, bit 3 = bit 523)
    print("adaptador falso em", HOST, a.porta_tcp, a.porta_udp, flush=True)
    threading.Event().wait()
