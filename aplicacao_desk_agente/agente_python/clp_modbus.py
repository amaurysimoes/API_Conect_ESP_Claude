"""Cliente TCP/IP (Modbus TCP) para as MEMÓRIAS (M, bobinas) de um CLP. Sem dependências externas.
Função 01 (ler bobinas) e função 05 (escrever uma bobina); porta padrão 502. Não lê nem escreve registradores (D).
O endereço da bobina é: base + número da memória (ex.: Delta DVP: M0 = 0x0800 = 2048, então base 2048).
"""
import socket
import struct
import threading

PORTA = 502
MAX_BOBINAS = 2000       # limite do protocolo por leitura


class ErroModbus(Exception):
    pass


_EXCECOES = {
    1: "função não suportada pelo CLP",
    2: "endereço de memória inexistente no CLP (confira o 'Endereço base da memória M' e o número da memória)",
    3: "valor ou quantidade inválida",
    4: "falha interna do CLP ao executar",
    6: "CLP ocupado, tente de novo",
}


class ClienteModbus:
    def __init__(self, ip, porta=PORTA, unidade=1, ip_local="", timeout=3.0):
        self.ip, self.porta, self.unidade, self.ip_local, self.timeout = ip, porta, unidade, ip_local, timeout
        self._s = None
        self._id = 0
        self._trava = threading.Lock()

    @property
    def conectado(self):
        return self._s is not None

    def conectar(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(self.timeout)
        try:
            if self.ip_local:
                try:
                    s.bind((self.ip_local, 0))
                except OSError:
                    raise ErroModbus(f"O IP {self.ip_local} não está configurado em nenhuma placa de rede deste PC. Corrija o campo 'IP deste PC' ou deixe vazio.")
            try:
                s.connect((self.ip, self.porta))
            except OSError:
                raise ErroModbus(f"Sem resposta de {self.ip}:{self.porta}. Verifique cabo, IP, máscara e se o Modbus TCP está habilitado no CLP (porta {self.porta}).")
        except BaseException:
            s.close()
            raise
        s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self._s = s

    def fechar(self):
        s, self._s = self._s, None
        if s is not None:
            try:
                s.close()
            except OSError:
                pass

    def _ler(self, n):
        buf = bytearray()
        while len(buf) < n:
            try:
                p = self._s.recv(n - len(buf))
            except (socket.timeout, TimeoutError):
                raise ErroModbus("O CLP não respondeu a tempo (Modbus TCP).")
            if not p:
                raise ErroModbus("O CLP fechou a conexão.")
            buf += p
        return bytes(buf)

    def _pedido(self, funcao, dados):
        """Manda uma requisição e devolve os dados da resposta (sem o código da função)."""
        with self._trava:
            if self._s is None:
                raise ErroModbus("Não conectado.")
            self._id = (self._id + 1) & 0xFFFF
            pdu = bytes([funcao]) + dados
            try:
                self._s.sendall(struct.pack(">HHHB", self._id, 0, len(pdu) + 1, self.unidade) + pdu)
                cab = self._ler(7)
                _, proto, comp, _ = struct.unpack(">HHHB", cab)
                if proto != 0 or not 2 <= comp <= 260:
                    raise ErroModbus("Resposta inválida (o equipamento não parece falar Modbus TCP).")
                corpo = self._ler(comp - 1)
            except ErroModbus:
                self.fechar()
                raise
            except OSError as e:
                self.fechar()
                raise ErroModbus(f"Conexão perdida: {e}")
        if corpo[0] == (funcao | 0x80):
            codigo = corpo[1] if len(corpo) > 1 else 0
            raise ErroModbus(f"O CLP recusou (código {codigo}): {_EXCECOES.get(codigo, 'erro')}.")
        if corpo[0] != funcao:
            raise ErroModbus("Resposta inesperada do CLP.")
        return corpo[1:]

    def ler_bobinas(self, endereco, quantidade):
        """Devolve bytes com os bits (bit 0 do byte 0 = primeira bobina), no mesmo formato da área de I/O do EtherNet/IP."""
        if not 1 <= quantidade <= MAX_BOBINAS:
            raise ErroModbus(f"Quantidade de memórias deve estar entre 1 e {MAX_BOBINAS}.")
        if not 0 <= endereco <= 0xFFFF or endereco + quantidade > 0x10000:
            raise ErroModbus("Endereço fora do limite do Modbus (0 a 65535).")
        r = self._pedido(0x01, struct.pack(">HH", endereco, quantidade))
        esperado = (quantidade + 7) // 8
        if len(r) < 1 + esperado or r[0] != esperado:
            raise ErroModbus("Resposta de leitura incompleta.")
        return bytes(r[1:1 + esperado])

    def escrever_bobina(self, endereco, ligado):
        if not 0 <= endereco <= 0xFFFF:
            raise ErroModbus("Endereço fora do limite do Modbus (0 a 65535).")
        r = self._pedido(0x05, struct.pack(">HH", endereco, 0xFF00 if ligado else 0x0000))
        if len(r) != 4:
            raise ErroModbus("Resposta de escrita incompleta.")
