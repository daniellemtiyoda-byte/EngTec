import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BadgeDe } from '../components/Badge';
import { DeclararDofModal, type AlvoDeclaracao } from '../components/DeclararDofModal';
import { Aviso, ComoFunciona, PageHeader } from '../components/Estados';
import { Etapas } from '../components/Etapas';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { Modal } from '../components/Modal';
import { NfModal } from '../components/NfModal';
import { AlternarVisao, Cartao, Quadro, type ColunaQuadro } from '../components/Quadro';
import { mensagemRecebimento, RecebimentoModal } from '../components/RecebimentoModal';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAlertas } from '../contexts/AlertasContext';
import { useAuth } from '../contexts/AuthContext';
import { ETAPA_ENTRADA_OPCOES } from '../dominio/opcoes';
import { DECLARACAO_DOF, ETAPA_ENTRADA, NIVEL_PRAZO_DOF, ORIGEM_NF } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { EtapaEntrada, NotaFiscal } from '../types/models';
import { data, dataHora, m3, paraNumero, prazoTexto, un } from '../utils/format';

const ETAPAS_NF = ['NF', 'DOF', 'Recebimento', 'Declaração no Sinaflor'];
const POSICAO: Record<EtapaEntrada, number> = { aguardando_dof: 1, aguardando_recebimento: 2, declarar: 3, concluida: 4 };

export default function NotasFiscais() {
  const { pode } = useAuth();
  const notificar = useToast();
  const alertas = useAlertas();
  const [rec, setRec] = useState(0);
  const [novaNf, setNovaNf] = useState(false);
  const [dofDe, setDofDe] = useState<NotaFiscal | null>(null);
  const [ver, setVer] = useState<NotaFiscal | null>(null);
  const [receber, setReceber] = useState<NotaFiscal | null>(null);
  const [declarar, setDeclarar] = useState<AlvoDeclaracao | null>(null);
  const tam = useAsync(() => servicos.tamanhos.listar({ pageSize: 50 }), []);

  const recarregar = () => { setRec((x) => x + 1); alertas.recarregar(); };

  const colunas: Coluna<NotaFiscal>[] = [
    { chave: 'numero', titulo: 'NF', ordenavel: true, render: (n) => `${n.numero} / ${n.serie}` },
    { chave: 'fornecedor', titulo: 'Fornecedor', ordenavel: true },
    { chave: 'emissao', titulo: 'Emissão', ordenavel: true, render: (n) => data(n.emissao) },
    { chave: 'quantidadeTotal', titulo: 'Quantidade', alinhar: 'right', ordenavel: true, render: (n) => `${un(n.quantidadeTotal)} em ${n.itens.length} item(ns)` },
    { chave: 'origem', titulo: 'Origem', opcional: true, render: (n) => <BadgeDe mapa={ORIGEM_NF} valor={n.origem} /> },
    { chave: 'dof', titulo: 'DOF', render: (n) => (n.dof ? n.dof.numero : <span className="mudo">Sem DOF</span>) },
    { chave: 'etapa', titulo: 'Etapa', render: (n) => <BadgeDe mapa={ETAPA_ENTRADA} valor={n.etapa} /> },
  ];

  // Quadro por padrão; filtro ou busca no endereço (atalhos da tela inicial, busca global) abre a lista.
  const [params, setParams] = useSearchParams();
  const visao = params.get('visao') === 'lista' || (!params.get('visao') && (params.get('etapa') || params.get('q'))) ? 'lista' : 'quadro';
  const mudarVisao = (v: 'quadro' | 'lista') => setParams(v === 'quadro' ? {} : { visao: 'lista' });
  const alvoDeclaracao = (n: NotaFiscal): AlvoDeclaracao => ({ nfId: n.id, nfNumero: n.numero, dofNumero: n.dof!.numero, prazoDeclaracao: n.dof!.prazoDeclaracao });
  const proximaAcao = (n: NotaFiscal) => (
    n.etapa === 'aguardando_dof' && pode('nf:cadastrar') ? <button className="btn btn-acao btn-peq" onClick={() => setDofDe(n)}>Cadastrar DOF</button>
      : n.etapa === 'aguardando_recebimento' && pode('recebimento:registrar') ? <button className="btn btn-acao btn-peq" onClick={() => setReceber(n)}>Receber</button>
        : n.etapa === 'declarar' && pode('dof:declarar') ? <button className="btn btn-acao btn-peq" onClick={() => setDeclarar(alvoDeclaracao(n))}>Marcar como declarado</button>
          : null
  );
  const coluna = (etapa: EtapaEntrada, tom: ColunaQuadro<NotaFiscal>['tom'], vazio: string, extra: Partial<ColunaQuadro<NotaFiscal>> = {}): ColunaQuadro<NotaFiscal> => ({
    chave: etapa, titulo: ETAPA_ENTRADA[etapa][1], tom, vazio, carregar: () => servicos.notas.listar({ filters: { etapa }, sortBy: 'emissao', pageSize: 50 }), ...extra,
  });
  const colunasQuadro: ColunaQuadro<NotaFiscal>[] = [
    coluna('aguardando_dof', 'vermelho', 'Nenhuma NF sem DOF.'),
    coluna('aguardando_recebimento', 'laranja', 'Nenhuma NF esperando a carga.'),
    coluna('declarar', 'azul', 'Nenhum DOF pendente no Sinaflor.', { ordenar: (a, b) => (a.diasParaPrazo ?? 0) - (b.diasParaPrazo ?? 0) }),
  ];
  const cartaoNf = (n: NotaFiscal) => (
    <Cartao
      destaque={n.etapa === 'declarar' ? (n.nivelPrazo === 'critico' ? 'critico' : n.nivelPrazo === 'atencao' ? 'atencao' : undefined) : undefined}
      acoes={<>{proximaAcao(n)}<button className="btn btn-sec btn-peq" onClick={() => setVer(n)}>Ver</button></>}
    >
      <div className="cartao-topo"><strong>NF {n.numero}</strong><BadgeDe mapa={ORIGEM_NF} valor={n.origem} /></div>
      <div>{n.fornecedor}</div>
      <div className="mudo">{un(n.quantidadeTotal)} em {n.itens.length} item(ns) · emitida em {data(n.emissao)}</div>
      {n.dof && <div className="mudo">DOF {n.dof.numero}</div>}
      {n.etapa === 'declarar' && n.diasParaPrazo !== undefined && (
        <div><BadgeDe mapa={NIVEL_PRAZO_DOF} valor={n.nivelPrazo ?? 'no_prazo'} /> <span className={n.nivelPrazo === 'critico' ? 'val-erro' : 'mudo'}>prazo {data(n.dof!.prazoDeclaracao)} · {prazoTexto(n.diasParaPrazo)}</span></div>
      )}
    </Cartao>
  );

  // Um campo de volume por espécie da NF: o DOF traz o volume por espécie, não por tamanho.
  const especiesDe = (nf: NotaFiscal) => [...new Map(nf.itens.map((i) => [i.especieId, i.especie]))];
  const volumeNf = (nf: NotaFiscal, especieId: string) => nf.itens.filter((i) => i.especieId === especieId)
    .reduce((a, i) => a + i.quantidade * (tam.dados?.items.find((t) => t.id === i.tamanhoId)?.volumeM3 ?? 0), 0);
  const camposDof = (nf: NotaFiscal): Campo[] => [
    { nome: 'numero', rotulo: 'Número do DOF', obrigatorio: true, maxLength: 20, ajuda: nf.dofSugerido ? 'Sugerido a partir das informações complementares do XML.' : undefined },
    { nome: 'codigoControle', rotulo: 'Código de controle', obrigatorio: true, maxLength: 40 },
    { nome: 'validade', rotulo: 'Validade', tipo: 'date', obrigatorio: true },
    ...especiesDe(nf).map(([id, especie]): Campo => ({
      nome: `vol_${id}`, rotulo: `Volume do DOF: ${especie} (m³)`, tipo: 'number', obrigatorio: true, min: 0.001,
      ajuda: `Volume da NF calculado pelos tamanhos: ${m3(volumeNf(nf, id))}.`,
    })),
    { nome: 'pdf', rotulo: 'PDF do DOF', tipo: 'arquivo', obrigatorio: true, extensoes: ['pdf'] },
  ];

  const acoesTopo = (
    <>
      <AlternarVisao visao={visao} aoMudar={mudarVisao} />
      {pode('nf:cadastrar') && <button className="btn btn-pri" onClick={() => setNovaNf(true)}>Cadastrar NF</button>}
    </>
  );
  const titulo = 'Entrada: NF e DOF';
  const descricao = 'Da nota fiscal à declaração do DOF no Sinaflor.';
  const aviso = (
    <ComoFunciona>
      A NF é cadastrada à mão ou pelo XML da NF-e. O recebimento só avança com o DOF cadastrado: um DOF por NF, com o volume
      informado por espécie, como no documento, e comparado ao volume recebido.
    </ComoFunciona>
  );

  // Visão Lista: tudo, em andamento primeiro, concluídas depois (mais recentes antes). Embaixo do quadro vão só as concluídas (sem o que já está no quadro).
  const lista = {
    listar: (q: Parameters<typeof servicos.notas.listar>[0]) => servicos.notas.listar(q),
    recarregar: rec,
    colunas,
    filtros: [{ chave: 'etapa', rotulo: 'Etapa', opcoes: ETAPA_ENTRADA_OPCOES }],
    ordemPadrao: [{ campo: 'emAndamento', dir: 'desc' as const }, { campo: 'emissao', dir: 'desc' as const }],
    acoesLinha: [
      { rotulo: 'Ver', aoClicar: setVer },
      { rotulo: 'Cadastrar DOF', principal: true, aoClicar: setDofDe, visivel: (n: NotaFiscal) => n.etapa === 'aguardando_dof' && pode('nf:cadastrar') },
      { rotulo: 'Receber', principal: true, aoClicar: setReceber, visivel: (n: NotaFiscal) => n.etapa === 'aguardando_recebimento' && pode('recebimento:registrar') },
      { rotulo: 'Marcar como declarado', principal: true, aoClicar: (n: NotaFiscal) => setDeclarar(alvoDeclaracao(n)), visivel: (n: NotaFiscal) => n.etapa === 'declarar' && pode('dof:declarar') },
    ],
  };

  return (
    <>
      {visao === 'quadro' ? (
        <>
          <section className="painel">
            <PageHeader titulo={titulo} descricao={descricao} acoes={acoesTopo} />
            {aviso}
            <Quadro rotulo="Etapas da entrada" colunas={colunasQuadro} cartao={cartaoNf} recarregar={rec} />
          </section>
          <ListPage<NotaFiscal>
            {...lista} secao titulo="Entradas concluídas" descricao="Só as que já saíram do quadro (DOF declarado), mais recentes primeiro."
            listar={(q) => servicos.notas.listar({ ...q, filters: { ...q.filters, emAndamento: 'false' } })}
            filtros={[]}
            ordemPadrao={[{ campo: 'emissao', dir: 'desc' }]}
          />
        </>
      ) : (
        <ListPage<NotaFiscal> {...lista} titulo={titulo} descricao={descricao} aviso={aviso} acoes={acoesTopo} />
      )}
      <NfModal
        aberto={novaNf} aoFechar={() => setNovaNf(false)}
        aoSalvar={(nf) => { notificar('sucesso', `NF ${nf.numero} cadastrada; cadastre o DOF para liberar o recebimento${SUFIXO_SIMULADO}.`); recarregar(); }}
      />
      <FormModal
        titulo={dofDe ? `DOF da NF ${dofDe.numero}` : 'DOF'} aberto={!!dofDe} aoFechar={() => setDofDe(null)} rotuloEnviar="Cadastrar DOF"
        campos={dofDe ? camposDof(dofDe) : []} iniciais={dofDe?.dofSugerido ? { numero: dofDe.dofSugerido } : undefined}
        aoEnviar={async (v, arquivos) => {
          const nf = dofDe!;
          await servicos.notas.cadastrarDof(nf.id, {
            numero: v.numero.trim(), codigoControle: v.codigoControle.trim(), validade: v.validade,
            volumes: especiesDe(nf).map(([id]) => ({ especieId: id, volumeM3: paraNumero(v[`vol_${id}`]) })),
          }, arquivos.pdf[0]);
          notificar('sucesso', `DOF cadastrado; a NF ${nf.numero} está pronta para o recebimento${SUFIXO_SIMULADO}.`);
          recarregar();
        }}
      />
      <DeclararDofModal alvo={declarar} aoFechar={() => setDeclarar(null)} aoConcluir={recarregar} />
      <RecebimentoModal nf={receber} aoFechar={() => setReceber(null)} aoConcluir={(r) => { notificar('sucesso', mensagemRecebimento(r)); recarregar(); }} />
      <Modal titulo={ver ? `NF ${ver.numero} / ${ver.serie}` : 'NF'} aberto={!!ver} aoFechar={() => setVer(null)} largo rodape={<button className="btn btn-sec" onClick={() => setVer(null)}>Fechar</button>}>
        {ver && (
          <>
            <Etapas etapas={ETAPAS_NF} atual={POSICAO[ver.etapa]} />
            <dl className="detalhes">
              <dt>Fornecedor</dt><dd>{ver.fornecedor}</dd><dt>Emissão</dt><dd>{data(ver.emissao)}</dd>
              <dt>Chave de acesso</dt><dd>{ver.chaveAcesso ?? '—'}</dd>
              <dt>Origem</dt><dd><BadgeDe mapa={ORIGEM_NF} valor={ver.origem} />{ver.xmlAnexado && ' · XML guardado'}</dd>
              <dt>Etapa</dt><dd><BadgeDe mapa={ETAPA_ENTRADA} valor={ver.etapa} /></dd>
            </dl>
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th>Descrição</th><th>Espécie</th><th>Tamanho</th><th className="al-right">Quantidade</th></tr></thead>
                <tbody>{ver.itens.map((i) => <tr key={i.id}><td>{i.descricao}</td><td><em>{i.especie}</em></td><td>{i.tamanho}</td><td className="al-right">{un(i.quantidade)}</td></tr>)}</tbody>
              </table>
            </div>
            {ver.dof ? (
              <>
                <h3>DOF {ver.dof.numero}</h3>
                <dl className="detalhes">
                  <dt>Código de controle</dt><dd>{ver.dof.codigoControle}</dd><dt>Validade</dt><dd>{data(ver.dof.validade)}</dd>
                  <dt>Prazo de declaração</dt><dd>{data(ver.dof.prazoDeclaracao)} (dia seguinte ao fim da validade)</dd>
                  <dt>Sinaflor</dt><dd><BadgeDe mapa={DECLARACAO_DOF} valor={ver.dof.declaracao} />{ver.dof.declaradoPor && ` por ${ver.dof.declaradoPor} em ${dataHora(ver.dof.declaradoEm)}`}</dd><dt>PDF</dt><dd>{ver.dof.arquivoPdf}</dd>
                  {ver.dof.volumes.map((v) => <Fragment key={v.especieId}><dt>Volume: <em>{v.especie}</em></dt><dd>{m3(v.volumeM3)}</dd></Fragment>)}
                </dl>
              </>
            ) : <Aviso tom="alerta">Sem DOF: o recebimento desta NF está bloqueado.</Aviso>}
          </>
        )}
      </Modal>
    </>
  );
}
