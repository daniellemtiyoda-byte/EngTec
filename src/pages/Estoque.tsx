import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { Badge, BadgeDe } from '../components/Badge';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { CodigoLink } from '../components/Codigos';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { DisponivelFardo, SituacaoFardo } from '../components/SituacaoFardo';
import { TransferirFardo } from '../components/TransferirFardo';
import { useAuth } from '../contexts/AuthContext';
import { CLASSE_OPCOES, SITUACAO_SALDO_OPCOES, USO_TAMANHO_OPCOES } from '../dominio/opcoes';
import { ordinalClasse, SITUACAO_SALDO, USO_TAMANHO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { Fardo, SaldoItem } from '../types/models';
import { data, dias, numero } from '../utils/format';

type Visao = 'item' | 'fardo';
const VISOES: Visao[] = ['item', 'fardo'];


/**
 * Estoque (seção 9.11 do plano) em duas visões. Por item: disponível, aguardando inspeção, reservado e não localizado
 * por espécie e tamanho, com mínimo, máximo e a situação (falta e excesso pelo disponível); "Ver fardos" abre a visão
 * por fardo filtrada pelo item. Por fardo: os fardos com saldo, do mais antigo ao mais novo, com a idade e o alerta
 * acima do limite. Ação principal: Transferir fardo (ler o QR do fardo e depois o do local).
 */
export default function Estoque() {
  const { pode } = useAuth();
  const notificar = useToast();
  const cad = useCadastros();
  const [, setParams] = useSearchParams();
  const [visao, setVisao] = useAbaNoEndereco<Visao>(VISOES, 'visao');
  const contratos = useAsync(() => servicos.contratos.listar({ pageSize: 500 }), []);
  const parametros = useAsync(() => servicos.parametros.obter(), []);
  const [transferir, setTransferir] = useState<{ fardoId?: string } | null>(null);
  const [rec, setRec] = useState(0);
  const itens = new Map((contratos.dados?.items ?? []).flatMap((c) => c.itens.map((i) => [i.id, { ...i, contrato: c.numero }] as const)));
  const movimentar = pode('estoque:movimentar');
  // Sem operacao:consultar (requisitante), só o saldo por item: fardos, locais e contratos são da operação.
  const operacao = pode('operacao:consultar');
  const visaoAtual: Visao = operacao ? visao : 'item';

  const tamanhos = (cad.listas?.tamanhos ?? []).map((t) => ({ valor: t.id, rotulo: cad.descreverTamanho(t.id) }));
  const locais = (cad.listas?.locais ?? []).filter((l) => l.tipo === 'armazenagem' || l.tipo === 'expedicao').map((l) => ({ valor: l.id, rotulo: l.codigo }));

  const abas: Aba<Visao>[] = operacao ? [{ valor: 'item', rotulo: 'Por item' }, { valor: 'fardo', rotulo: 'Por fardo' }] : [{ valor: 'item', rotulo: 'Por item' }];

  const colunasItem: Coluna<SaldoItem>[] = [
    { chave: 'tamanhoId', titulo: 'Tamanho', render: (s) => cad.descreverTamanho(s.tamanhoId) },
    { chave: 'classe', titulo: 'Classe', render: (s) => `${ordinalClasse(s.classe)}` },
    { chave: 'uso', titulo: 'Uso', opcional: true, render: (s) => <BadgeDe mapa={USO_TAMANHO} valor={s.uso} /> },
    { chave: 'emEstoque', titulo: 'Em estoque', alinhar: 'right', ordenavel: true, render: (s) => <strong>{numero(s.emEstoque)}</strong> },
    {
      chave: 'emCura', titulo: 'Em cura', alinhar: 'right', ordenavel: true,
      render: (s) => (s.emCura ? <span className="disponivel-fardo">{numero(s.emCura)}<span className="detalhe-linha">libera em {data(s.liberacaoCura)}</span></span> : '0'),
    },
    { chave: 'aguardandoInspecao', titulo: 'Aguardando inspeção', alinhar: 'right', ordenavel: true, render: (s) => numero(s.aguardandoInspecao) },
    { chave: 'reservado', titulo: 'Reservado', alinhar: 'right', ordenavel: true, render: (s) => numero(s.reservado) },
    { chave: 'naoLocalizado', titulo: 'Não localizado', alinhar: 'right', opcional: true, render: (s) => numero(s.naoLocalizado) },
    { chave: 'minimo', titulo: 'Mínimo', alinhar: 'right', render: (s) => (s.minimo || s.maximo ? numero(s.minimo) : '—') },
    { chave: 'maximo', titulo: 'Máximo', alinhar: 'right', render: (s) => (s.minimo || s.maximo ? numero(s.maximo) : '—') },
    { chave: 'situacao', titulo: 'Situação', render: (s) => <BadgeDe mapa={SITUACAO_SALDO} valor={s.situacao} /> },
    {
      chave: 'especies', titulo: 'Espécies (disponível)', quebrar: true, opcional: true,
      render: (s) => (s.especies.length ? s.especies.map((x) => `${cad.nomeEspecie(x.especieId)} ${numero(x.emEstoque)}`).join(' · ') : '—'),
    },
  ];

  const colunasFardo: Coluna<Fardo>[] = [
    { chave: 'id', titulo: 'Fardo', render: (f) => <CodigoLink codigo={f.id} /> },
    { chave: 'itemContratoId', titulo: 'Item', render: (f) => { const i = itens.get(f.itemContratoId); return i ? cad.descreverItem({ tamanhoId: i.tamanhoId, classe: f.classe }) : '—'; } },
    { chave: 'especieId', titulo: 'Espécie', render: (f) => cad.nomeEspecie(f.especieId) },
    { chave: 'contratoId', titulo: 'Contrato', opcional: true, render: (f) => { const n = itens.get(f.itemContratoId)?.contrato; return n ? <Link className="mono" to={`/contratos/${n}`}>{n}</Link> : '—'; } },
    { chave: 'localId', titulo: 'Local', render: (f) => { const c = cad.codigoLocal(f.localId); return c !== '—' ? <Link className="mono" to={`/locais/${c}`}>{c}</Link> : c; } },
    { chave: 'saldo', titulo: 'Saldo', alinhar: 'right', ordenavel: true, render: (f) => `${numero(f.saldo)}/${numero(f.quantidadeInicial)}` },
    { chave: 'disponivel', titulo: 'Disponível', alinhar: 'right', ordenavel: true, render: (f) => <DisponivelFardo fardo={f} /> },
    {
      chave: 'idadeDias', titulo: 'Idade', alinhar: 'right', ordenavel: true,
      render: (f) => <>{f.idadeDias !== undefined ? dias(f.idadeDias) : '—'}{f.acimaLimiteDias && <> <Badge tom="laranja">acima do limite</Badge></>}</>,
    },
    { chave: 'situacao', titulo: 'Situação', render: (f) => <SituacaoFardo fardo={f} /> },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Estoque"
        subtitulo="Saldo por classe e tamanho (via corrente e AMV) e os fardos guardados. Falta e excesso comparam o disponível com o mínimo e o máximo de Configurações."
        acoes={movimentar && <button className="btn btn-pri" onClick={() => setTransferir({})}>Transferir fardo</button>}
      />
      <AbasSecao abas={abas} ativa={visaoAtual} aoEscolher={setVisao} rotulo="Visão do estoque">
        {visaoAtual === 'item' && (
          <ListPage<SaldoItem>
            key="item" titulo="Saldo por item" subnivel colunas={colunasItem} recarregar={rec}
            descricao="Por classe (NBR 7511) e tamanho, com a espécie como detalhe. Em estoque é o disponível para nova saída; em cura (CCA ou CCB, 15 dias após o tratamento) só fica disponível na data de liberação; os reservados ainda estão nos fardos."
            filtros={[
              { chave: 'uso', rotulo: 'Uso', opcoes: USO_TAMANHO_OPCOES },
              { chave: 'tamanhoId', rotulo: 'Tamanho', opcoes: tamanhos },
              { chave: 'classe', rotulo: 'Classe', opcoes: CLASSE_OPCOES },
              { chave: 'situacao', rotulo: 'Situação', opcoes: SITUACAO_SALDO_OPCOES },
            ]}
            listar={(q) => servicos.estoque.porItem(q)}
            acoesLinha={operacao ? [{ rotulo: 'Ver fardos', principal: true, aoClicar: (s) => setParams({ visao: 'fardo', tamanhoId: s.tamanhoId, classe: String(s.classe) }) }] : undefined}
          />
        )}
        {visaoAtual === 'fardo' && (
          <ListPage<Fardo>
            key="fardo" titulo="Fardos em estoque" subnivel colunas={colunasFardo} recarregar={rec}
            descricao={`Fardos em estoque, do mais antigo ao mais novo; aberto é o fardo de que já saíram dormentes numa RME. Acima de ${numero(parametros.dados?.limiteDiasEstoque ?? 120)} dias o fardo fica em alerta. Pesquise pelo ID do fardo, pelo contrato ou pela espécie.`}
            abasSituacao={{ chave: 'aberto', rotulo: 'Fardos completos ou abertos', abas: [{ valor: '', rotulo: 'Todos' }, { valor: 'false', rotulo: 'Completos' }, { valor: 'true', rotulo: 'Abertos' }] }}
            filtros={[
              { chave: 'uso', rotulo: 'Uso', opcoes: USO_TAMANHO_OPCOES },
              { chave: 'tamanhoId', rotulo: 'Tamanho', opcoes: tamanhos },
              { chave: 'classe', rotulo: 'Classe', opcoes: CLASSE_OPCOES },
              { chave: 'localId', rotulo: 'Local', opcoes: locais },
              { chave: 'acimaLimite', rotulo: 'Idade', opcoes: [{ valor: 'sim', rotulo: 'Acima do limite de dias' }] },
            ]}
            listar={(q) => servicos.estoque.porFardo(q)}
            acoesLinha={movimentar ? [{ rotulo: 'Transferir', principal: true, aoClicar: (f) => setTransferir({ fardoId: f.id }) }] : undefined}
          />
        )}
      </AbasSecao>
      <TransferirFardo
        aberto={!!transferir} cad={cad} fardoId={transferir?.fardoId} aoFechar={() => setTransferir(null)}
        aoTransferir={(f, de, para) => { setTransferir(null); notificar('sucesso', `Fardo ${f.id} transferido de ${de} para ${para}.`); setRec((x) => x + 1); cad.recarregar(); }}
      />
    </>
  );
}
