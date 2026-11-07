import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { Badge, BadgeDe } from '../components/Badge';
import { CabecalhoObjeto, FatoChave } from '../components/Cabecalhos';
import { CodigoLink } from '../components/Codigos';
import { Aviso, Carregando, Erro, Vazio } from '../components/Estados';
import { LinhaTempo } from '../components/LinhaTempo';
import { ConfirmModal, Modal } from '../components/Modal';
import { RodapeAcoes } from '../components/RodapeAcoes';
import { SeparacaoAssistente } from '../components/SeparacaoAssistente';
import { useToast } from '../components/Toast';
import { TransferirFardo } from '../components/TransferirFardo';
import { useAuth } from '../contexts/AuthContext';
import { RE_RME } from '../dominio/identificacao';
import { SITUACAO_RME } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { useTelaPequena } from '../hooks/useTelaPequena';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { Rme } from '../types/models';
import { data, dataHora, numero } from '../utils/format';

type AbaRme = 'itens' | 'separacao' | 'historico';
const ABAS: AbaRme[] = ['itens', 'separacao', 'historico'];

/**
 * Página da RME (seção 9.17 do plano): itens pedidos e separados, a separação por fardo (com "Levar para a expedição"
 * quando o fardo inteiro está reservado) e o histórico. Ações pela situação: Separar, Entregar e Cancelar.
 */
export default function RmeDetalhe() {
  const { numero: bruto = '' } = useParams();
  const num = decodeURIComponent(bruto).trim().toUpperCase();
  const [params, setParams] = useSearchParams();
  const { pode, usuario } = useAuth();
  const notificar = useToast();
  const cad = useCadastros();
  const pequena = useTelaPequena();
  const [aba, setAba] = useAbaNoEndereco<AbaRme>(ABAS);
  const r = useAsync(() => servicos.rme.obter(num), [num]);
  const rme = r.dados;
  // Fardos da separação (local atual, saldo e disponível), para "fardo inteiro" e "na expedição".
  const fardos = useAsync(async () => (rme?.separacao ? Promise.all(rme.separacao.map((l) => servicos.fardos.obter(l.fardoId).catch(() => undefined))) : []), [rme]);
  const [separar, setSeparar] = useState(false);
  const [entregar, setEntregar] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erroMotivo, setErroMotivo] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const [levar, setLevar] = useState<string>();

  // Vindo da lista com "Separar" (?separar=1): o assistente já abre.
  useEffect(() => {
    if (!rme || !params.get('separar')) return;
    if ((rme.situacao === 'aberta' || rme.situacao === 'em_separacao') && pode('rme:separar')) setSeparar(true);
    setParams((p) => { p.delete('separar'); return p; }, { replace: true });
  }, [rme?.numero]); // eslint-disable-line react-hooks/exhaustive-deps

  if (r.carregando && !rme) return <section className="painel"><Carregando /></section>;
  if (r.erro instanceof ApiError && r.erro.status === 404) {
    return <section className="painel"><Vazio mensagem={`RME ${num} não encontrada.`} dica={RE_RME.test(num) ? 'Confira o número da requisição.' : 'O número tem o formato RME-ano-sequência (ex. RME-2026-0012).'} /></section>;
  }
  if (r.erro || !rme) return <section className="painel"><Erro erro={r.erro} aoTentar={r.recarregar} /></section>;

  const aberta = rme.situacao === 'aberta' || rme.situacao === 'em_separacao';
  const podeSeparar = aberta && pode('rme:separar');
  const podeEntregar = rme.situacao === 'pronta' && pode('rme:separar');
  const podeCancelar = rme.situacao !== 'entregue' && rme.situacao !== 'cancelada' && (pode('rme:separar') || (pode('rme:abrir') && rme.solicitanteId === usuario?.id));
  const separados = (i: Rme['itens'][number]) => (rme.separacao ?? []).filter((l) => {
    const f = fardos.dados?.find((x) => x?.fardo.id === l.fardoId);
    return f && f.item.especie.id === i.especieId && f.item.tamanho.id === i.tamanhoId;
  }).reduce((t, l) => t + l.dormentesIds.length, 0);
  const total = rme.itens.reduce((t, i) => t + i.quantidade, 0);

  const abas: Aba<AbaRme>[] = [
    { valor: 'itens', rotulo: 'Itens', total: rme.itens.length },
    { valor: 'separacao', rotulo: 'Separação', total: rme.separacao?.length },
    { valor: 'historico', rotulo: 'Histórico' },
  ];

  const acoes = (podeSeparar || podeEntregar || podeCancelar) ? <>
    {podeSeparar && <button type="button" className="btn btn-pri" onClick={() => setSeparar(true)}>Separar</button>}
    {podeEntregar && <button type="button" className="btn btn-pri" onClick={() => setEntregar(true)}>Entregar</button>}
    {podeCancelar && <button type="button" className="btn btn-sec" onClick={() => { setMotivo(''); setErroMotivo(undefined); setCancelar(true); }}>Cancelar RME</button>}
  </> : null;

  async function confirmarEntrega() {
    setEnviando(true);
    try {
      await servicos.rme.entregar(rme!.numero);
      notificar('sucesso', `${rme!.numero} entregue para ${rme!.destino}: ${numero(total)} dormentes baixados.`);
      setEntregar(false); r.recarregar(); cad.recarregar();
    } catch (e) { notificar('erro', mensagemSegura(e)); setEntregar(false); }
    finally { setEnviando(false); }
  }

  async function confirmarCancelamento() {
    if (!motivo.trim()) { setErroMotivo('Informe o motivo do cancelamento.'); return; }
    setEnviando(true);
    try {
      await servicos.rme.cancelar(rme!.numero, motivo.trim());
      notificar('sucesso', `${rme!.numero} cancelada${rme!.separacao?.length ? ': reservas liberadas' : ''}.`);
      setCancelar(false); r.recarregar(); cad.recarregar();
    } catch (e) { setErroMotivo(mensagemSegura(e)); }
    finally { setEnviando(false); }
  }

  return (
    <section className="painel">
      <CabecalhoObjeto
        tipo="RME" id={rme.numero} situacao={<BadgeDe mapa={SITUACAO_RME} valor={rme.situacao} />}
        migalhas={[{ rotulo: 'Requisições', para: '/saidas' }, { rotulo: rme.numero }]}
        acoes={!pequena && acoes}
        fatos={<>
          <FatoChave rotulo="Destino" valor={rme.destino} />
          <FatoChave rotulo="Necessidade em" valor={data(rme.necessidadeEm)} />
          <FatoChave rotulo="Solicitante" valor={rme.solicitanteNome} />
          <FatoChave rotulo="Dormentes" valor={`${numero(total)} em ${rme.itens.length} ${rme.itens.length === 1 ? 'item' : 'itens'}`} />
          <FatoChave rotulo="Aberta em" valor={dataHora(rme.criadoEm)} />
        </>}
      />
      {rme.situacao === 'cancelada' && <Aviso tom="critico">Cancelada: {rme.motivoCancelamento}</Aviso>}
      {rme.situacao === 'pronta' && <Aviso tom="info">Dormentes reservados: continuam nos fardos (no saldo), fora do disponível. A entrega dá a baixa.</Aviso>}

      <AbasSecao abas={abas} ativa={aba} aoEscolher={setAba} rotulo="Seções da RME">
        {aba === 'itens' && (
          <div className="tabela-wrap">
            <table className="tabela tabela-cartoes">
              <thead><tr><th scope="col">Item</th><th scope="col" className="al-right">Pedida</th><th scope="col" className="al-right">Separada</th></tr></thead>
              <tbody>
                {rme.itens.map((i) => (
                  <tr key={`${i.especieId}|${i.tamanhoId}`}>
                    <td>{cad.descreverItem(i)}</td>
                    <td className="al-right" data-rotulo="Pedida">{numero(i.quantidade)}</td>
                    <td className="al-right" data-rotulo="Separada">{rme.separacao ? numero(separados(i)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {aba === 'separacao' && (!rme.separacao?.length ? <Vazio mensagem="Ainda não separada." dica={podeSeparar ? 'Use "Separar" para seguir a sugestão de fardos.' : undefined} /> : (
          <ul className="separacao-resultado">
            {rme.separacao.map((l) => {
              const f = fardos.dados?.find((x) => x?.fardo.id === l.fardoId);
              const inteiro = !!f && f.fardo.disponivel === 0 && f.fardo.saldo === l.dormentesIds.length && rme.situacao === 'pronta';
              const naExpedicao = f?.local?.tipo === 'expedicao';
              return (
                <li key={l.fardoId} className="ficha-cartao">
                  <p className="separacao-fardo-titulo">
                    <CodigoLink codigo={l.fardoId} /> · {numero(l.dormentesIds.length)} dormente(s)
                    {f?.local && <> · <Link className="mono" to={`/locais/${f.local.codigo}`}>{f.local.codigo}</Link></>}
                    {inteiro && <Badge tom="azul">fardo inteiro</Badge>}
                    {naExpedicao && rme.situacao === 'pronta' && <Badge tom="verde">na expedição</Badge>}
                    {l.seguiuSugestao ? <Badge tom="cinza">como a sugestão</Badge> : <Badge tom="laranja">difere da sugestão</Badge>}
                  </p>
                  {l.justificativa && <p className="mudo">Justificativa: {l.justificativa}</p>}
                  <p className="lista-codigos">{l.dormentesIds.map((id) => <CodigoLink key={id} codigo={id} />)}</p>
                  {inteiro && !naExpedicao && pode('estoque:movimentar') && (
                    <button type="button" className="btn btn-acao" onClick={() => setLevar(l.fardoId)}>Levar para a expedição</button>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
        {aba === 'historico' && <LinhaTempo eventos={[...rme.historico].reverse().map((e) => ({ quando: e.quando, quem: e.quem, titulo: e.descricao, referencia: e.referencia }))} />}
      </AbasSecao>

      {pequena && acoes && <RodapeAcoes>{acoes}</RodapeAcoes>}

      <SeparacaoAssistente
        aberto={separar} rme={rme} cad={cad} aoFechar={() => { setSeparar(false); r.recarregar(); }}
        aoSeparar={(nova) => {
          setSeparar(false); setAba('separacao'); r.recarregar(); cad.recarregar();
          notificar('sucesso', `${nova.numero} pronta: ${numero(total)} dormentes reservados.`);
        }}
      />
      <TransferirFardo
        aberto={!!levar} cad={cad} fardoId={levar} soExpedicao aoFechar={() => setLevar(undefined)}
        aoTransferir={(f, de, para) => { setLevar(undefined); notificar('sucesso', `Fardo ${f.id} levado de ${de} para a expedição ${para}.`); fardos.recarregar(); cad.recarregar(); r.recarregar(); }}
      />
      <ConfirmModal
        titulo={`Entregar ${rme.numero}`} aberto={entregar} carregando={enviando} rotuloConfirmar="Confirmar entrega"
        mensagem={`Confirma a entrega de ${numero(total)} dormentes para ${rme.destino}? Os dormentes reservados são baixados; o fardo com sobra continua em estoque como aberto e o que zerar fica baixado.`}
        aoConfirmar={() => void confirmarEntrega()} aoCancelar={() => setEntregar(false)}
      />
      <Modal
        titulo={`Cancelar ${rme.numero}`} aberto={cancelar} aoFechar={() => setCancelar(false)}
        rodape={<>
          <button type="button" className="btn btn-sec" onClick={() => setCancelar(false)} disabled={enviando}>Voltar</button>
          <button type="button" className="btn btn-perigo" onClick={() => void confirmarCancelamento()} disabled={enviando}>{enviando ? 'Cancelando…' : 'Cancelar RME'}</button>
        </>}
      >
        <p>{rme.separacao?.length ? 'As reservas são liberadas e o fardo que estiver na expedição volta para o local de onde saiu.' : 'A RME deixa de valer.'}</p>
        <div className="campo">
          <label htmlFor="rme-motivo">Motivo<span className="obrig" aria-hidden="true"> *</span></label>
          <textarea id="rme-motivo" rows={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          {erroMotivo && <span className="erro-campo" role="alert">{erroMotivo}</span>}
        </div>
      </Modal>
    </section>
  );
}
