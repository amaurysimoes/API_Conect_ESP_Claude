"""CLP SIMULADO falando Modbus TCP (memórias/bobinas), só para testes. Não entra no executável.
  python clp_modbus_falso.py [porta]        (padrão 5020, em 127.0.0.1)
Tem 4096 bobinas a partir do endereço `inicio` (padrão 2048 = 0x0800, como as memórias M de um Delta DVP).
Fora disso responde exceção 2 (endereço inexistente). A bobina `inicio+20` já começa ligada.
"""
import socket
import struct
import sys
import threading


class ModbusFalso:
    def __init__(self, porta=5020, inicio=2048, total=4096):
        self.porta, self.inicio, self.total = porta, inicio, total
        self.bobinas = {}
        self.bobinas[inicio + 20] = True
        self.escritas = []
        self._clientes = []
        self._parar = threading.Event()

    def iniciar(self):
        self._srv = socket.socket()
        self._srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._srv.bind(("127.0.0.1", self.porta))
        self._srv.listen(5)
        self._srv.settimeout(0.2)
        threading.Thread(target=self._aceitar, daemon=True).start()
        return self

    def parar(self):
        self._parar.set()
        for c in [self._srv] + self._clientes:      # derruba também as conexões já abertas (CLP "desligou")
            try:
                c.close()
            except OSError:
                pass

    def _aceitar(self):
        while not self._parar.is_set():
            try:
                c, _ = self._srv.accept()
            except (socket.timeout, OSError):
                continue
            self._clientes.append(c)
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

    def _cliente(self, c):
        try:
            while True:
                tid, proto, comp, unidade = struct.unpack(">HHHB", self._ler(c, 7))
                pdu = self._ler(c, comp - 1)
                resp = self._tratar(pdu)
                c.sendall(struct.pack(">HHHB", tid, 0, len(resp) + 1, unidade) + resp)
        except OSError:
            pass
        finally:
            c.close()

    def _tratar(self, pdu):
        f = pdu[0]
        if f == 0x01:
            ender, qtd = struct.unpack(">HH", pdu[1:5])
            if ender < self.inicio or ender + qtd > self.inicio + self.total:
                return bytes([0x81, 0x02])
            n = (qtd + 7) // 8
            dados = bytearray(n)
            for i in range(qtd):
                if self.bobinas.get(ender + i):
                    dados[i >> 3] |= 1 << (i & 7)
            return bytes([0x01, n]) + bytes(dados)
        if f == 0x05:
            ender, valor = struct.unpack(">HH", pdu[1:5])
            if ender < self.inicio or ender >= self.inicio + self.total:
                return bytes([0x85, 0x02])
            self.bobinas[ender] = valor == 0xFF00
            self.escritas.append((ender, valor == 0xFF00))
            return pdu
        return bytes([f | 0x80, 0x01])


if __name__ == "__main__":
    s = ModbusFalso(int(sys.argv[1]) if len(sys.argv) > 1 else 5020).iniciar()
    print("modbus falso em 127.0.0.1", s.porta, flush=True)
    threading.Event().wait()
