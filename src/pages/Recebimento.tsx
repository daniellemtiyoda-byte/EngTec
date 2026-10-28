import { useState } from 'react';
import { Badge } from '../components/Badge';
import { CodigoLink, CodigosLink } from '../components/Codigos';
import { Aviso } from '../components/Estados';
import { ListPage, type Coluna } from '../components/ListPage';
import { Modal } from '../components/Modal';
import { mensagemRecebimento, RecebimentoModal } from '../components/RecebimentoModal';
import { useToast } from '../components/Toast';
import { useAlertas } from '../contexts/AlertasContext';
import { useAuth } from '../contexts/AuthContext';
import { foraDaTolerancia, TOLERANCIA_VOLUME_PCT } from '../dominio/parametros';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { NotaFiscal, Recebimento } from '../types/models';
import { data, m3, pct, un } from '../utils/format';

const sinal = (v: number) => (v > 0 ? '+' : '');

export default function RecebimentoPage() {
  const { pode } = useAuth();
  const notificar = useToast();
  const alertas = useAlertas();
  const [rec, setRec] = useState(0);
  const [escolher, setEscolher] = useState(false);
  const [nfId, setNfId] = useState('');
  const [receber, setReceber] = useState<NotaFiscal | null>(null);
  const [ver, setVer] = useState<Recebimento | null>(null);
  const notas = useAsync(() => servicos.notas.listar({ pageSize: 200, sortBy: 'emissao' }), [rec]);
  const aReceber = notas.dados?.items.filter((n) => n.situacao === 'aguardando_recebimento') ?? [];
  const semDof = notas.dados?.items.filter((n) => n.situacao === 'aguardando_dof') ?? [];

  const colunas: Coluna<Recebimento>[] = [
    { chave: 'nfNumero', titulo: 'NF', ordenavel: true, render: (r) => <CodigoLink codigo={`NF ${r.nfNumero}`} /> },
    { chave: 'dofNumero', titulo: 'DOF', ordenavel: true },
    { chave: 'fornecedor', titulo: 'Fornecedor', ordenavel: true },
    { chave: 'recebidoEm', titulo: 'Recebido em', ordenavel: true, render: (r) => data(r.recebidoEm) },
    { chave: 'quantidadeDocumental', titulo: 'Qtd. NF', alinhar: 'right', render: (r) => un(r.quantidadeDocumental) },
    { chave: 'quantidadeConferida', titulo: 'Qtd. conferida', alinhar: 'right', render: (r) => un(r.quantidadeConferida) },
    {
      chave: 'divergencia', titulo: 'Divergência', alinhar: 'right', ordenavel: true,
      render: (r) => (r.divergenciaQuantidade ? <span className="val-erro">{sinal(r.divergencia)}{un(r.divergencia)}</span> : <span>Sem divergência</span>),
    },
    {
      chave: 'divergenciaVolumePct', titulo: 'Volume x DOF', alinhar: 'right', ordenavel: true,
      render: (r) => <Badge tom={r.acimaTolerancia ? 'vermelho' : 'verde'}>{sinal(r.divergenciaVolumePct)}{pct(r.divergenciaVolumePct)}</Badge>,
    },
    { chave: 'lotes', titulo: 'Lotes criados', render: (r) => <CodigosLink codigos={r.lotes} /> },
    { chave: 'fardos', titulo: 'Fardos', alinhar: 'right', ordenavel: true },
    { chave: 'conferente', titulo: 'Conferente', ordenavel: true },
  ];

  return (
    <>
      <ListPage<Recebimento>
        titulo="Recebimento"
        descricao="Conferência da carga contra a NF e o DOF. Ao confirmar, o sistema cria um lote por espécie e tamanho e os fardos, todos aguardando inspeção."
        aviso={<Aviso>Sem DOF não há recebimento. Divergência de quantidade ou avaria exige fotos; divergência de volume acima de {TOLERANCIA_VOLUME_PCT}% exige justificativa e deixa os lotes "Com divergência".</Aviso>}
        listar={(q) => servicos.recebimentos.listar(q)}
        recarregar={rec}
        colunas={colunas}
        acoes={pode('recebimento:registrar') ? <button className="btn btn-pri" onClick={() => { setNfId(''); setEscolher(true); }}>Registrar recebimento</button> : undefined}
        acoesLinha={[{ rotulo: 'Detalhes', aoClicar: setVer }]}
      />
      <Modal
        titulo="Registrar recebimento" aberto={escolher} aoFechar={() => setEscolher(false)}
        rodape={<>
          <button className="btn btn-sec" onClick={() => setEscolher(false)}>Cancelar</button>
          <button className="btn btn-pri" disabled={!nfId} onClick={() => { setReceber(aReceber.find((n) => n.id === nfId) ?? null); setEscolher(false); }}>Continuar</button>
        </>}
      >
        {notas.erro && <Aviso tom="critico">Não foi possível carregar as notas fiscais.</Aviso>}
        <div className="campo">
          <label htmlFor="rec-nf">Nota fiscal com DOF</label>
          <select id="rec-nf" value={nfId} onChange={(e) => setNfId(e.target.value)}>
            <option value="">Selecione…</option>
            {aReceber.map((n) => <option key={n.id} value={n.id}>NF {n.numero} · {n.fornecedor} · DOF {n.dof?.numero}</option>)}
          </select>
          {!notas.carregando && !aReceber.length && <span className="ajuda">Nenhuma NF com DOF aguardando recebimento.</span>}
        </div>
        {semDof.length > 0 && (
          <Aviso tom="alerta">
            Bloqueadas por falta de DOF: {semDof.map((n) => `NF ${n.numero}`).join(', ')}. Cadastre o DOF em NF e DOF para liberar o recebimento.
          </Aviso>
        )}
      </Modal>
      <RecebimentoModal
        nf={receber} aoFechar={() => setReceber(null)}
        aoConcluir={(r) => { notificar('sucesso', mensagemRecebimento(r)); setRec((x) => x + 1); alertas.recarregar(); }}
      />
      <Modal titulo={ver ? `Recebimento da NF ${ver.nfNumero}` : 'Recebimento'} aberto={!!ver} aoFechar={() => setVer(null)} largo rodape={<button className="btn btn-sec" onClick={() => setVer(null)}>Fechar</button>}>
        {ver && (
          <>
            {ver.acimaTolerancia && <Aviso tom="critico">Divergência de volume acima de {TOLERANCIA_VOLUME_PCT}%: lotes "Com divergência", fora da separação até serem liberados.</Aviso>}
            <dl className="detalhes">
              <dt>Fornecedor</dt><dd>{ver.fornecedor}</dd><dt>NF / DOF</dt><dd>{ver.nfNumero} / {ver.dofNumero}</dd>
              <dt>Recebido em</dt><dd>{data(ver.recebidoEm)} por {ver.conferente}</dd>
              <dt>Quantidade</dt><dd>NF {un(ver.quantidadeDocumental)} · conferida {un(ver.quantidadeConferida)}</dd>
              <dt>Avaria</dt><dd>{ver.avaria ? 'Sim' : 'Não'}</dd><dt>Fotos</dt><dd>{ver.fotos}</dd>
              <dt>Lotes</dt><dd><CodigosLink codigos={ver.lotes} /> ({ver.fardos} fardos)</dd>
              {ver.justificativa && <><dt>Justificativa</dt><dd>{ver.justificativa}</dd></>}
              {ver.observacao && <><dt>Observação</dt><dd>{ver.observacao}</dd></>}
            </dl>
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th>Espécie</th><th className="al-right">DOF</th><th className="al-right">Recebido (calculado)</th><th className="al-right">Diferença</th></tr></thead>
                <tbody>
                  {ver.volumes.map((v) => (
                    <tr key={v.especie}>
                      <td><em>{v.especie}</em></td><td className="al-right">{m3(v.volumeDofM3)}</td><td className="al-right">{m3(v.volumeRecebidoM3)}</td>
                      <td className={`al-right${foraDaTolerancia(v.diferencaPct) ? ' val-erro' : ''}`}>{sinal(v.diferencaPct)}{pct(v.diferencaPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
