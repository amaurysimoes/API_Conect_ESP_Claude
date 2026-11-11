"""Cliente EtherNet/IP Class 1 (PC = scanner; CLP, robô ou outro equipamento = adapter). Sem dependências externas.
Porte do EipScanner do projeto Robo_conect (C#): TCP 44818 (sessão, ListIdentity, Forward Open/Close) + UDP 2222 (I/O cíclico).
Só um scanner por vez fala com o equipamento (Exclusive Owner).
"""
import socket
import struct
import sys
import threading
import time

PORTA_TCP = 44818
PORTA_UDP = 2222
CMD_LIST_IDENTITY, CMD_REGISTER_SESSION, CMD_UNREGISTER_SESSION, CMD_SEND_RR_DATA = 0x0063, 0x0065, 0x0066, 0x006F
VENDOR_ORIGINADOR = 0x0001

PADRAO = {
    "ip": "", "ip_local": "",
    "ot_size": 32, "to_size": 32,        # bytes PC->equipamento (O->T) e equipamento->PC (T->O)
    "rpi_ms": 20, "multicast": True,
    "inst_cfg": 1, "inst_ot": 150, "inst_to": 100,   # padrões do EDS Epson EPSN0901; o EDS do seu CLP define os dele
    "multiplicador": 2, "porta_udp": PORTA_UDP, "porta_tcp": PORTA_TCP,
}


class ErroEip(Exception):
    pass


# ---------------------------------------------------------------- erros CIP em português
_GERAL = {0x01: "Falha de conexão", 0x02: "Recurso indisponível", 0x04: "Erro de segmento no path", 0x05: "Destino do path desconhecido",
          0x08: "Serviço não suportado", 0x09: "Valor de atributo inválido", 0x0C: "Conflito de estado do objeto",
          0x10: "Conflito de estado do dispositivo", 0x13: "Dados insuficientes", 0x15: "Dados em excesso"}
_ESTENDIDO = {
    0x0100: "Conexão já em uso / Forward Open duplicado. Espere alguns segundos (a conexão anterior ainda não expirou) e tente de novo.",
    0x0103: "Combinação de transporte/trigger não suportada.",
    0x0106: "Conflito de propriedade: outro scanner está conectado ao equipamento, ou a conexão anterior deste PC ainda não expirou. Desconecte o outro scanner ou aguarde alguns segundos.",
    0x0107: "Conexão não encontrada no alvo.", 0x0108: "Parâmetro de conexão de rede inválido.",
    0x0109: "Tamanho de conexão inválido. Confira os bytes de entrada/saída configurados no equipamento.",
    0x0110: "Conexão não configurada no alvo.", 0x0111: "RPI não suportado. Tente outro valor (ex.: 10, 20 ou 50 ms).",
    0x0113: "O alvo não tem mais conexões disponíveis.", 0x0114: "Vendor ID ou código de produto não confere.",
    0x0115: "Tipo de dispositivo não confere.", 0x0116: "Revisão não confere.",
    0x0117: "Path de aplicação produzido/consumido inválido. Confira as instâncias de assembly (O→T e T→O) no EDS do equipamento.",
    0x0118: "Path de configuração inválido ou inconsistente. Confira a instância de configuração.",
    0x011A: "Objeto alvo sem conexões disponíveis.", 0x011B: "RPI menor que o production inhibit time.",
    0x0123: "Tipo de conexão O→T inválido.", 0x0124: "Tipo de conexão T→O inválido. Troque T→O entre Multicast e Ponto-a-ponto.",
    0x0127: "Tamanho O→T inválido. Os bytes PC→equipamento devem ser iguais aos bytes de ENTRADA configurados no equipamento.",
    0x0128: "Tamanho T→O inválido. Os bytes equipamento→PC devem ser iguais aos bytes de SAÍDA configurados no equipamento.",
    0x0129: "Path de configuração inválido.", 0x012A: "Path de consumo inválido (instância O→T).", 0x012B: "Path de produção inválido (instância T→O).",
    0x0203: "Conexão expirou (timeout).", 0x0204: "Requisição não conectada expirou.", 0x0315: "Segmento inválido no path de conexão.",
}


def descrever_erro(geral, ext):
    txt = f"{_GERAL.get(geral, 'Erro')} (status geral 0x{geral:02X}"
    if ext:
        txt += ", estendido " + " ".join(f"0x{e:04X}" for e in ext)
    txt += ")"
    if ext:
        if ext[0] in _ESTENDIDO:
            txt += " — " + _ESTENDIDO[ext[0]]
        if ext[0] == 0x0127 and len(ext) > 1:
            txt += f" O equipamento espera {ext[1] - 6} bytes de dados nesse sentido."
        elif ext[0] == 0x0128 and len(ext) > 1:
            txt += f" O equipamento espera {ext[1] - 2} bytes de dados nesse sentido."
        elif ext[0] == 0x0109 and len(ext) > 1:
            txt += f" Tamanho aceito pelo alvo (com cabeçalhos): {ext[1]} bytes."
    return txt


# ---------------------------------------------------------------- encapsulamento
def _encap(cmd, sessao, dados=b""):
    return struct.pack("<HHII8sI", cmd, len(dados), sessao, 0, b"\0" * 8, 0) + dados


def _ler_exato(s, n):
    buf = bytearray()
    while len(buf) < n:
        try:
            parte = s.recv(n - len(buf))
        except (socket.timeout, TimeoutError):
            raise ErroEip("Tempo esgotado esperando resposta do equipamento (TCP 44818).")
        if not parte:
            raise ErroEip("O equipamento fechou a conexão TCP.")
        buf += parte
    return bytes(buf)


def _ler_encap(s):
    h = _ler_exato(s, 24)
    comprimento, sessao, status = struct.unpack_from("<HII", h, 2)
    return status, sessao, _ler_exato(s, comprimento)


def _tcp(ip, porta, timeout_s, ip_local=""):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout_s)
    try:
        if ip_local:
            try:
                s.bind((ip_local, 0))
            except OSError:
                raise ErroEip(f"O IP {ip_local} não está configurado em nenhuma placa de rede deste PC. Corrija o campo 'IP deste PC' ou deixe vazio.")
        try:
            s.connect((ip, porta))
        except OSError:
            raise ErroEip(f"Sem resposta de {ip}:{porta} em {int(timeout_s * 1000)} ms. Verifique cabo, IP, máscara e se o EtherNet/IP está habilitado no equipamento.")
    except BaseException:
        s.close()
        raise
    s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    return s


def identificar(ip, porta=PORTA_TCP, timeout_s=2.0):
    """ListIdentity: devolve dict com o que o equipamento diz ser (não precisa de sessão)."""
    s = _tcp(ip, porta, timeout_s)
    try:
        s.sendall(_encap(CMD_LIST_IDENTITY, 0))
        status, _, d = _ler_encap(s)
    finally:
        s.close()
    if status != 0:
        raise ErroEip(f"ListIdentity: status de encapsulamento 0x{status:08X}")
    p = 0
    (n,) = struct.unpack_from("<H", d, p); p += 2
    for _ in range(n):
        tipo, tam = struct.unpack_from("<HH", d, p); p += 4
        prox = p + tam
        if tipo == 0x000C:
            q = p + 2 + 16
            vendor, tipo_disp, produto = struct.unpack_from("<HHH", d, q); q += 6
            rev_maior, rev_menor = d[q], d[q + 1]; q += 2
            status_id, serie = struct.unpack_from("<HI", d, q); q += 6
            tam_nome = d[q]; q += 1
            nome = d[q:q + tam_nome].decode("ascii", "replace")
            return {"nome": nome, "vendor": vendor, "tipo": tipo_disp, "codigo": produto, "rev": f"{rev_maior}.{rev_menor}",
                    "serie": f"0x{serie:08X}", "status": f"0x{status_id:04X}"}
        p = prox
    raise ErroEip("ListIdentity: resposta sem item de identidade.")


def texto_identidade(i):
    return f"{i['nome']} | Vendor {i['vendor']} | Tipo {i['tipo']} | Código {i['codigo']} | Rev {i['rev']} | Serial {i['serie']} | Status {i['status']}"


def _serie_estavel():
    h = 2166136261
    for ch in socket.gethostname().upper():
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h or 1


def _logico(seg8, valor):
    return bytes([seg8, valor]) if valor <= 0xFF else bytes([seg8 | 1, 0, valor & 0xFF, (valor >> 8) & 0xFF])


def _caminho(c):
    return bytes([0x20, 0x04]) + _logico(0x24, c["inst_cfg"]) + _logico(0x2C, c["inst_ot"]) + _logico(0x2C, c["inst_to"])


def _multicast(a):
    return 224 <= a[0] <= 239


class Scanner:
    def __init__(self, log=None, ao_perder=None):
        self._log = log or (lambda m: None)
        self._ao_perder = ao_perder or (lambda m: None)
        self._trava = threading.Lock()
        self._limpeza = threading.Lock()
        self.conectado = False
        self.run_mode = True
        self._saida, self._entrada = bytearray(), bytearray()
        self._tcp = self._udp = None
        self._sessao = 0
        self._rodando = False
        self._threads = []
        self._grupo = None
        self.tx = self.rx = self.descartados = 0
        self._ultimo_rx = 0.0

    # ---------- buffers ----------
    def saida(self):
        with self._trava:
            return bytes(self._saida)

    def entrada(self):
        with self._trava:
            return bytes(self._entrada)

    def definir_bit(self, byte, bit, valor):
        with self._trava:
            if byte >= len(self._saida):
                raise ErroEip("Bit fora da área de saída.")
            if valor:
                self._saida[byte] |= 1 << bit
            else:
                self._saida[byte] &= ~(1 << bit) & 0xFF

    def zerar(self):
        with self._trava:
            self._saida[:] = bytes(len(self._saida))

    def ms_sem_dados(self):
        return -1 if not self._ultimo_rx else (time.perf_counter() - self._ultimo_rx) * 1000.0

    # ---------- conexão ----------
    def conectar(self, cfg):
        if self.conectado:
            raise ErroEip("Já conectado.")
        c = {**PADRAO, **cfg}
        if not (0 <= c["ot_size"] <= 256 and 0 <= c["to_size"] <= 256):
            raise ErroEip("Tamanhos de I/O devem estar entre 0 e 256 bytes.")
        if not 1 <= c["rpi_ms"] <= 3200:
            raise ErroEip("RPI deve estar entre 1 e 3200 ms.")
        self._cfg = c
        with self._trava:
            nova = bytearray(c["ot_size"])
            nova[:min(len(nova), len(self._saida))] = self._saida[:len(nova)]
            self._saida = nova
            self._entrada = bytearray(c["to_size"])
        try:
            self._abrir_sessao()
            self._abrir_udp()          # antes do Forward Open, para não perder pacotes
            self._forward_open()
            self._iniciar_io()
            self.conectado = True
            self._log(f"Conectado. O→T API = {self._ot_api_us / 1000:.3g} ms, T→O API = {self._to_api_us / 1000:.3g} ms, timeout ≈ {self._timeout_ms():.0f} ms.")
        except BaseException:
            self._limpar(False)
            raise

    def desconectar(self):
        if not self.conectado and self._tcp is None:
            return
        self._limpar(True)
        self._log("Desconectado.")

    def _limpar(self, forward_close):
        with self._limpeza:
            self.conectado = False
            self._rodando = False
            for t in self._threads:
                if t is not threading.current_thread():
                    t.join(1.0)
            self._threads = []
            if forward_close and self._tcp is not None:
                try:
                    self._forward_close()
                except Exception as e:  # noqa: BLE001
                    self._log(f"Forward Close falhou: {e}")
            if self._udp is not None:
                try:
                    if self._grupo:
                        try:
                            self._udp.setsockopt(socket.IPPROTO_IP, socket.IP_DROP_MEMBERSHIP, self._mreq)
                        except OSError:
                            pass
                    self._udp.close()
                except OSError:
                    pass
            self._udp, self._grupo = None, None
            if self._tcp is not None:
                try:
                    if self._sessao:
                        self._tcp.sendall(_encap(CMD_UNREGISTER_SESSION, self._sessao))
                except OSError:
                    pass
                try:
                    self._tcp.close()
                except OSError:
                    pass
            self._tcp, self._sessao = None, 0
            _tempo_fino(False)

    def _abrir_sessao(self):
        c = self._cfg
        self._log(f"Abrindo TCP {c['ip']}:{c['porta_tcp']}...")
        self._tcp = _tcp(c["ip"], c["porta_tcp"], 3.0, c["ip_local"])
        self._tcp.sendall(_encap(CMD_REGISTER_SESSION, 0, struct.pack("<HH", 1, 0)))
        status, sessao, _ = _ler_encap(self._tcp)
        if status != 0:
            raise ErroEip(f"RegisterSession recusado, status 0x{status:08X}")
        self._sessao = sessao
        self._log(f"Sessão registrada: 0x{sessao:08X}")

    def _abrir_udp(self):
        # sem reutilizar a porta de propósito: se outro programa já usa a 2222, é melhor avisar do que perder pacotes sem perceber
        u = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            u.bind(("0.0.0.0", self._cfg["porta_udp"]))
        except OSError as e:
            u.close()
            raise ErroEip(f"Não foi possível abrir a porta UDP {self._cfg['porta_udp']} ({e}). Outro programa (RSLinx, Robo_conect, outra instância) pode estar usando.")
        u.settimeout(0.1)
        self._udp = u

    def _enviar_nao_conectado(self, cip):
        d = struct.pack("<IHH", 0, 5, 2) + struct.pack("<HH", 0, 0) + struct.pack("<HH", 0x00B2, len(cip)) + cip
        self._tcp.sendall(_encap(CMD_SEND_RR_DATA, self._sessao, d))
        status, _, dados = _ler_encap(self._tcp)
        if status != 0:
            raise ErroEip(f"SendRRData: status de encapsulamento 0x{status:08X}")
        p = 6
        (n,) = struct.unpack_from("<H", dados, p); p += 2
        itens, resp = [], None
        for _ in range(n):
            tipo, tam = struct.unpack_from("<HH", dados, p); p += 4
            item = dados[p:p + tam]; p += tam
            itens.append((tipo, item))
            if tipo == 0x00B2:
                resp = item
        if resp is None:
            raise ErroEip("Resposta sem item de dados CIP.")
        return resp, itens

    @staticmethod
    def _conferir(resp, servico, o_que):
        if len(resp) < 4 or resp[0] != (servico | 0x80):
            raise ErroEip(f"{o_que}: resposta CIP inesperada.")
        geral, palavras = resp[2], resp[3]
        if geral == 0:
            return
        ext = [resp[4 + i * 2] | (resp[5 + i * 2] << 8) for i in range(palavras)]
        raise ErroEip(f"{o_que} recusado: {descrever_erro(geral, ext)}")

    def _forward_open(self):
        import random
        c = self._cfg
        self._serie_conexao = random.randint(1, 0xFFFE)
        self._serie_orig = _serie_estavel()   # fixo por PC: o alvo libera a conexão "expirada" para o mesmo originador
        rpi_us = c["rpi_ms"] * 1000
        ot_bytes = c["ot_size"] + 2 + 4       # + sequence count + cabeçalho Run/Idle
        to_bytes = c["to_size"] + 2
        ot_par = 0x4000 | 0x0800 | ot_bytes
        to_par = (0x2000 if c["multicast"] else 0x4000) | 0x0800 | to_bytes
        caminho = _caminho(c)
        b = bytearray([0x54, 0x02, 0x20, 0x06, 0x24, 0x01, 0x0A, 0x0E])
        b += struct.pack("<II", random.randint(1, 2**31 - 1), random.randint(1, 2**31 - 1))
        b += struct.pack("<HHI", self._serie_conexao, VENDOR_ORIGINADOR, self._serie_orig)
        b += bytes([c["multiplicador"], 0, 0, 0])
        b += struct.pack("<IHIH", rpi_us, ot_par, rpi_us, to_par)
        b += bytes([0x01, len(caminho) // 2]) + caminho
        self._log(f"Forward Open: O→T {c['ot_size']} bytes, T→O {c['to_size']} bytes ({'multicast' if c['multicast'] else 'ponto-a-ponto'}), RPI {c['rpi_ms']} ms")
        resp, itens = self._enviar_nao_conectado(bytes(b))
        self._conferir(resp, 0x54, "Forward Open")
        p = 4 + resp[3] * 2
        self._ot_id, self._to_id = struct.unpack_from("<II", resp, p); p += 8 + 8
        self._ot_api_us, self._to_api_us = struct.unpack_from("<II", resp, p)
        self._log(f"Forward Open OK: ID O→T 0x{self._ot_id:08X}, ID T→O 0x{self._to_id:08X}")
        self._destino = (c["ip"], c["porta_udp"])
        for tipo, d in itens:
            if tipo == 0x8000 and len(d) >= 8:
                porta = (d[2] << 8) | d[3]
                if porta:
                    self._destino = (c["ip"], porta)
            elif tipo == 0x8001 and len(d) >= 8 and _multicast(d[4:8]):
                self._grupo = socket.inet_ntoa(bytes(d[4:8]))
        if c["multicast"]:
            if not self._grupo:
                self._log("Aviso: conexão multicast sem endereço de grupo na resposta; recebendo como unicast.")
            else:
                self._mreq = socket.inet_aton(self._grupo) + socket.inet_aton(c["ip_local"] or "0.0.0.0")
                self._udp.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, self._mreq)
                self._log(f"Entrou no grupo multicast {self._grupo}.")

    def _forward_close(self):
        caminho = _caminho(self._cfg)
        b = bytearray([0x4E, 0x02, 0x20, 0x06, 0x24, 0x01, 0x0A, 0x0E])
        b += struct.pack("<HHI", self._serie_conexao, VENDOR_ORIGINADOR, self._serie_orig)
        b += bytes([len(caminho) // 2, 0]) + caminho
        resp, _ = self._enviar_nao_conectado(bytes(b))
        self._conferir(resp, 0x4E, "Forward Close")
        self._log("Forward Close OK.")

    # ---------- I/O cíclico ----------
    def _timeout_ms(self):
        api = (self._to_api_us or self._cfg["rpi_ms"] * 1000) / 1000.0
        return max(api * (4 << self._cfg["multiplicador"]), 500.0)

    def _iniciar_io(self):
        self._seq_encap = 0
        self._seq_cip = 0
        self._primeiro_rx, self._ultimo_seq_rx = True, 0
        self.tx = self.rx = self.descartados = 0
        self._ultimo_rx = time.perf_counter()
        _tempo_fino(True)
        self._rodando = True
        self._threads = [threading.Thread(target=self._laco_rx, daemon=True, name="EIP-RX"),
                         threading.Thread(target=self._laco_tx, daemon=True, name="EIP-TX")]
        for t in self._threads:
            t.start()

    def _laco_tx(self):
        periodo = (self._ot_api_us or self._cfg["rpi_ms"] * 1000) / 1e6
        proximo = time.perf_counter()
        n = self._cfg["ot_size"]
        while self._rodando:
            try:
                self._seq_encap = (self._seq_encap + 1) & 0xFFFFFFFF
                self._seq_cip = (self._seq_cip + 1) & 0xFFFF
                with self._trava:
                    dados = bytes(self._saida[:n])
                pkt = struct.pack("<HHHIIHHHI", 2, 0x8002, 8, self._ot_id, self._seq_encap, 0x00B1, 2 + 4 + n, self._seq_cip,
                                  1 if self.run_mode else 0) + dados
                self._udp.sendto(pkt, self._destino)
                self.tx += 1
            except Exception as e:  # noqa: BLE001
                if self._rodando:
                    self._log(f"Erro ao enviar UDP: {e}")
            proximo += periodo
            agora = time.perf_counter()
            if agora - proximo > periodo * 10:
                proximo = agora                      # atrasou demais: ressincroniza
            while self._rodando:
                falta = proximo - time.perf_counter()
                if falta <= 0:
                    break
                time.sleep(0.001 if falta > 0.002 else 0)

    def _laco_rx(self):
        limite = self._timeout_ms()
        while self._rodando:
            pkt = None
            try:
                pkt, _ = self._udp.recvfrom(2048)
            except (socket.timeout, TimeoutError):
                pass
            except ConnectionResetError:
                pass
            except OSError as e:
                if self._rodando:
                    self._log(f"Erro UDP: {e}")
                break
            if pkt:
                self._tratar_rx(pkt)
            if self._rodando and self.ms_sem_dados() > limite:
                msg = f"Conexão perdida: nenhum dado do equipamento há {self.ms_sem_dados():.0f} ms (timeout {limite:.0f} ms)."
                self._log(msg)

                def perder():
                    self._ao_perder(msg)     # primeiro registra o motivo; só depois a conexão aparece como desconectada
                    self._limpar(True)
                threading.Thread(target=perder, daemon=True).start()
                break

    def _tratar_rx(self, pkt):
        try:
            p = 0
            (n,) = struct.unpack_from("<H", pkt, p); p += 2
            if n < 2:
                return
            conn, dados = 0, None
            for _ in range(n):
                tipo, tam = struct.unpack_from("<HH", pkt, p); p += 4
                if tipo == 0x8002 and tam >= 8:
                    (conn,) = struct.unpack_from("<I", pkt, p)
                elif tipo == 0x00B1 and tam >= 2:
                    (seq,) = struct.unpack_from("<H", pkt, p)
                    if not self._primeiro_rx and seq == self._ultimo_seq_rx:
                        p += tam
                        continue                      # dado repetido
                    self._ultimo_seq_rx, self._primeiro_rx = seq, False
                    dados = pkt[p + 2:p + tam]
                p += tam
            if conn != self._to_id:
                self.descartados += 1
                return
            self._ultimo_rx = time.perf_counter()
            self.rx += 1
            if dados is not None:
                with self._trava:
                    m = min(len(dados), len(self._entrada))
                    self._entrada[:m] = dados[:m]
        except Exception:  # noqa: BLE001
            self.descartados += 1


def _tempo_fino(ligar):
    """Windows: melhora a resolução do sleep (padrão ~15,6 ms) para o envio a cada 20 ms."""
    if sys.platform != "win32":
        return
    try:
        import ctypes
        (ctypes.windll.winmm.timeBeginPeriod if ligar else ctypes.windll.winmm.timeEndPeriod)(1)
    except Exception:  # noqa: BLE001
        pass


def testar_bit(dados, bit, primeiro):
    i = bit - primeiro
    return i >= 0 and (i >> 3) < len(dados) and bool(dados[i >> 3] & (1 << (i & 7)))
