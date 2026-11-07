import { useEffect, useState } from 'react';
import { RE_FARDO, type CodigoLido } from '../dominio/identificacao';
import { TIPO_LOCAL } from '../dominio/rotulos';
import type { Cadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { Fardo, FardoDetalhe } from '../types/models';
import { numero } from '../utils/format';
import { BadgeDe } from './Badge';
import { Carregando } from './Estados';
import { Icone } from './Icone';
import { LeitorQr, type RetornoLeitura } from './LeitorQr';
import { Modal } from './Modal';
import { ProgressoPassos } from './Passos';

const PASSOS = ['Fardo', 'Local de destino', 'Revisar e confirmar'];

interface Props {
  aberto: boolean;
  cad: Cadastros;
  /** Vindo da página do fardo: começa no passo do local. */
  fardoId?: string;
  aoFechar: () => void;
  aoTransferir: (f: Fardo, de: string, para: string) => void;
}

/**
 * Transferir fardo (seções 9.11 e 11.1 do plano), tela de campo: ler o QR do fardo e, em seguida, o QR do local (o
 * leitor do local abre sozinho depois de um fardo válido); escolher o local na lista ou digitar o ID ficam como
 * alternativa. A confirmação ocupa a tela no celular. Só fardo em estoque ou aberto vai para local ativo de
 * armazenagem ou expedição diferente do atual (a mesma regra vale no serviço).
 */
export function TransferirFardo({ aberto, cad, fardoId, aoFechar, aoTransferir }: Props) {
  const [passo, setPasso] = useState(0);
  const [lendo, setLendo] = useState<'fardo' | 'local' | null>(null);
  const [digitado, setDigitado] = useState('');
  const [fardo, setFardo] = useState<FardoDetalhe>();
  const [carregando, setCarregando] = useState(false);
  const [localId, setLocalId] = useState('');
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  const atualId = fardo?.fardo.localId;
  const destinos = (cad.listas?.locais ?? []).filter((l) => l.ativo && (l.tipo === 'armazenagem' || l.tipo === 'expedicao') && l.id !== atualId);
  const destino = destinos.find((l) => l.id === localId);

  useEffect(() => {
    if (!aberto) return;
    setPasso(0); setFardo(undefined); setLocalId(''); setErro(undefined); setDigitado('');
    if (fardoId) void carregar(fardoId, false);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  /** `lido`: veio do leitor; com fardo válido, o leitor do local abre sozinho (dois toques de leitura). */
  async function carregar(id: string, lido: boolean) {
    setCarregando(true); setErro(undefined); setFardo(undefined); setLocalId('');
    try {
      const d = await servicos.fardos.obter(id);
      setFardo(d);
      if (d.fardo.situacao !== 'em_estoque' && d.fardo.situacao !== 'aberto') {
        setErro(`O fardo ${d.fardo.id} não está em estoque: só fardo em estoque ou aberto pode ser transferido.`);
        setPasso(0);
        return;
      }
      setPasso(1);
      if (lido) setLendo('local');
    } catch (e) {
      setErro(e instanceof ApiError && e.status === 404 ? `Fardo ${id} não encontrado. Confira a etiqueta.` : mensagemSegura(e));
    } finally {
      setCarregando(false);
    }
  }

  function aoLerFardo(c: CodigoLido): RetornoLeitura {
    if (c.tipo !== 'fardo') return { ok: false, mensagem: 'Este QR não é de fardo. Leia a etiqueta do fardo.' };
    void carregar(c.id, true);
    return { ok: true, mensagem: `Fardo ${c.id} lido.` };
  }

  function aoLerLocal(c: CodigoLido): RetornoLeitura {
    if (c.tipo !== 'local') return { ok: false, mensagem: 'Este QR não é de local. Leia a etiqueta do local de destino.' };
    const codigo = c.id.replace(/^LOC-/, '');
    if (cad.listas?.locais.find((l) => l.id === atualId)?.codigo === codigo) return { ok: false, mensagem: `O fardo já está em ${codigo}. Leia outro local.` };
    const l = destinos.find((x) => x.codigo === codigo);
    if (!l) return { ok: false, mensagem: `O local ${codigo} não recebe fardos (precisa ser ativo, de armazenagem ou expedição).` };
    setLocalId(l.id); setPasso(2); setErro(undefined);
    return { ok: true, mensagem: `Destino ${codigo}.` };
  }

  function usarDigitado(e: React.FormEvent) {
    e.preventDefault();
    const id = digitado.trim().toUpperCase();
    if (!RE_FARDO.test(id)) { setErro('Digite o ID do fardo (ex. AR00224-01-F012).'); return; }
    void carregar(id, false);
  }

  async function confirmar() {
    if (!fardo || !destino) return;
    setEnviando(true); setErro(undefined);
    try {
      const f = await servicos.fardos.transferir(fardo.fardo.id, destino.id);
      aoTransferir(f, cad.codigoLocal(atualId), destino.codigo);
    } catch (e) {
      setErro(mensagemSegura(e));
      if (e instanceof ApiError && e.detalhes?.localId) setPasso(1);
    } finally {
      setEnviando(false);
    }
  }

  const avancar = () => {
    if (passo === 1 && !destino) { setErro('Leia o QR do local ou escolha o destino.'); return; }
    setErro(undefined); setPasso((p) => p + 1);
  };

  const resumoFardo = fardo && (
    <div className="transferir-fardo">
      <span className="mono transferir-id">{fardo.fardo.id}</span>
      <span>{fardo.item.especie.nomePopular} · {fardo.item.tamanho.codigo} · {numero(fardo.fardo.saldo)} dormentes</span>
      <span className="mudo">Está em <strong className="mono">{cad.codigoLocal(atualId)}</strong></span>
    </div>
  );

  return (
    <>
      <Modal
        largo titulo="Transferir fardo" aberto={aberto && !lendo} aoFechar={aoFechar}
        rodape={<>
          {passo > (fardoId ? 1 : 0)
            ? <button type="button" className="btn btn-sec" onClick={() => { setErro(undefined); setPasso((p) => p - 1); }} disabled={enviando}>Voltar</button>
            : <button type="button" className="btn btn-sec" onClick={aoFechar}>Cancelar</button>}
          {passo === 1 && <button type="button" className="btn btn-pri" onClick={avancar}>Avançar</button>}
          {passo === 2 && <button type="button" className="btn btn-pri" onClick={() => void confirmar()} disabled={enviando}>{enviando ? 'Transferindo…' : 'Confirmar transferência'}</button>}
        </>}
      >
        <ProgressoPassos passos={PASSOS} atual={passo} />
        {erro && <div className="aviso aviso-critico" role="alert">{erro}</div>}

        {passo === 0 && (
          <div className="assistente-passo">
            <button type="button" className="btn btn-acao btn-grande botao-ler" onClick={() => setLendo('fardo')}><Icone nome="qr" /> Ler QR do fardo</button>
            <p className="mudo">Depois do fardo, o leitor pede o QR do local de destino.</p>
            <form className="campo" onSubmit={usarDigitado} noValidate>
              <label htmlFor="tr-fardo">Ou digite o ID do fardo</label>
              <div className="linha-com-botao">
                <input id="tr-fardo" className="mono" value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder="AR00224-01-F012" autoCapitalize="characters" spellCheck={false} maxLength={40} />
                <button type="submit" className="btn btn-sec">Usar</button>
              </div>
            </form>
            {carregando && <Carregando linhas={2} />}
            {resumoFardo}
          </div>
        )}

        {passo === 1 && fardo && (
          <div className="assistente-passo">
            {resumoFardo}
            <button type="button" className="btn btn-acao btn-grande botao-ler" onClick={() => setLendo('local')}><Icone nome="qr" /> Ler QR do local</button>
            <p className="mudo">Ou escolha o destino (locais ativos de armazenagem ou expedição):</p>
            <ul className="escolha-entregas" role="radiogroup" aria-label="Local de destino">
              {destinos.map((l) => (
                <li key={l.id}>
                  <label className={`cartao-escolha${localId === l.id ? ' escolhido' : ''}`}>
                    <input type="radio" name="tr-local" checked={localId === l.id} onChange={() => setLocalId(l.id)} />
                    <span className="cartao-escolha-titulo"><span className="mono">{l.codigo}</span> <BadgeDe mapa={TIPO_LOCAL} valor={l.tipo} /></span>
                    <span className="mudo">{l.descricao} · {numero(Math.max(0, l.capacidade - l.ocupacao))} livres de {numero(l.capacidade)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {passo === 2 && fardo && destino && (
          <div className="transferir-confirmacao">
            <p className="mudo">Transferir o fardo</p>
            <p className="mono transferir-id">{fardo.fardo.id}</p>
            <p>{fardo.item.especie.nomePopular} · {fardo.item.tamanho.codigo} · {numero(fardo.fardo.saldo)} dormentes</p>
            <p className="transferir-rota">
              <span className="mono">{cad.codigoLocal(atualId)}</span>
              <Icone nome="seta-direita" />
              <span className="mono">{destino.codigo}</span>
            </p>
            <p className="mudo">{destino.descricao}. A movimentação fica registrada e a ficha de cada dormente passa a mostrar o novo local.</p>
          </div>
        )}
      </Modal>
      <LeitorQr aberto={lendo === 'fardo'} aoFechar={() => setLendo((l) => (l === 'fardo' ? null : l))} modo="capturar" aoLer={aoLerFardo} titulo="Ler QR do fardo" />
      <LeitorQr aberto={lendo === 'local'} aoFechar={() => setLendo((l) => (l === 'local' ? null : l))} modo="capturar" aoLer={aoLerLocal} titulo="Ler QR do local de destino" />
    </>
  );
}
