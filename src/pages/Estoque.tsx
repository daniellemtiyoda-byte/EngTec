import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Aviso, ComoFunciona } from '../components/Estados';
import { BadgeDe, StatusEstoqueBadge } from '../components/Badge';
import { CodigoLink } from '../components/Codigos';
import { FardosModal } from '../components/FardosModal';
import { StatCard } from '../components/Graficos';
import { ListPage, type Coluna } from '../components/ListPage';
import { AlternarVisao } from '../components/Quadro';
import {
  CATEGORIA_OPCOES, CLASSE_OPCOES, ESTADO_FARDO_OPCOES, ETAPA_INSPECAO_OPCOES, IDADE_LOTE_OPCOES, SITUACAO_FARDO_OPCOES, SITUACAO_LOTE_OPCOES,
} from '../dominio/opcoes';
import { ESTADO_FARDO, ETAPA_INSPECAO, SITUACAO_LOTE } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { FardoEstoque, Lote } from '../types/models';
import { classeCategoria, data, dias, m3, metros, numero, un } from '../utils/format';

const VISOES = { fardo: 'Por fardo', lote: 'Por lote' };
type Visao = keyof typeof VISOES;

const idade = (x: { idadeDias: number; acimaLimiteIdade: boolean }) =>
  (x.acimaLimiteIdade ? <span className="val-erro" title="Acima do limite de dias definido em Configurações">{dias(x.idadeDias)}</span> : dias(x.idadeDias));
const especie = (x: { especieDocumental: string; classe?: Lote['classe']; categoria?: Lote['categoria'] }) =>
  <><em>{x.especieDocumental}</em>{classeCategoria(x.classe, x.categoria) && <div className="mudo">{classeCategoria(x.classe, x.categoria)}</div>}</>;

const COLUNAS_FARDO: Coluna<FardoEstoque>[] = [
  { chave: 'codigo', titulo: 'Fardo', ordenavel: true, render: (f) => <CodigoLink codigo={f.codigo} /> },
  { chave: 'especieDocumental', titulo: 'Espécie', ordenavel: true, render: especie },
  { chave: 'tamanho', titulo: 'Tamanho', ordenavel: true },
  { chave: 'saldo', titulo: 'Saldo', alinhar: 'right', ordenavel: true, render: (f) => <>{un(f.saldo)}{f.saldo !== f.quantidadeInicial && <div className="mudo">de {un(f.quantidadeInicial)}</div>}</> },
  { chave: 'situacao', titulo: 'Situação', ordenavel: true, render: (f) => <BadgeDe mapa={SITUACAO_LOTE} valor={f.situacao} /> },
  { chave: 'local', titulo: 'Local', ordenavel: true },
  { chave: 'idadeDias', titulo: 'Idade', alinhar: 'right', ordenavel: true, render: idade },
  // Extras, ligados em "Colunas"
  { chave: 'loteCodigo', titulo: 'Lote', ordenavel: true, opcional: true, render: (f) => <CodigoLink codigo={f.loteCodigo} /> },
  { chave: 'estado', titulo: 'Fechado/aberto', ordenavel: true, opcional: true, render: (f) => <BadgeDe mapa={ESTADO_FARDO} valor={f.estado} /> },
  { chave: 'nfNumero', titulo: 'NF', ordenavel: true, opcional: true, render: (f) => <CodigoLink codigo={`NF ${f.nfNumero}`} /> },
  { chave: 'fornecedor', titulo: 'Fornecedor', ordenavel: true, opcional: true },
  { chave: 'recebidoEm', titulo: 'Entrada', ordenavel: true, opcional: true, render: (f) => data(f.recebidoEm) },
  { chave: 'volumeM3', titulo: 'Volume calculado', alinhar: 'right', ordenavel: true, opcional: true, render: (f) => m3(f.volumeM3) },
];

/** Lotes que ainda não viraram fardo (aguardando ou em inspeção): o que falta na lista de fardos. */
const COLUNAS_SEM_FARDO: Coluna<Lote>[] = [
  { chave: 'codigo', titulo: 'Lote', ordenavel: true, render: (l) => <CodigoLink codigo={l.codigo} /> },
  { chave: 'especieDocumental', titulo: 'Espécie', ordenavel: true, render: especie },
  { chave: 'tamanho', titulo: 'Tamanho', ordenavel: true },
  { chave: 'quantidade', titulo: 'Dormentes', alinhar: 'right', ordenavel: true, render: (l) => un(l.quantidade) },
  { chave: 'pecasInspecionadas', titulo: 'Inspecionadas', alinhar: 'right', ordenavel: true, render: (l) => `${numero(l.pecasInspecionadas)} de ${numero(l.quantidade)}` },
  { chave: 'etapaInspecao', titulo: 'Inspeção', ordenavel: true, render: (l) => <BadgeDe mapa={ETAPA_INSPECAO} valor={l.etapaInspecao} /> },
  { chave: 'local', titulo: 'Local', ordenavel: true },
  { chave: 'idadeDias', titulo: 'Idade', alinhar: 'right', ordenavel: true, render: idade },
  { chave: 'estoqueStatus', titulo: 'Estoque', opcional: true, render: (l) => <StatusEstoqueBadge s={l.estoqueStatus} /> },
];

const COLUNAS_LOTE: Coluna<Lote>[] = [
  { chave: 'codigo', titulo: 'Lote', ordenavel: true, render: (l) => <CodigoLink codigo={l.codigo} /> },
  { chave: 'especieDocumental', titulo: 'Espécie', ordenavel: true, render: especie },
  { chave: 'tamanho', titulo: 'Tamanho', ordenavel: true },
  { chave: 'saldo', titulo: 'Saldo', alinhar: 'right', ordenavel: true, render: (l) => <>{un(l.saldo)}{l.saldo !== l.quantidade && <div className="mudo">de {un(l.quantidade)}</div>}</> },
  { chave: 'situacao', titulo: 'Situação', ordenavel: true, render: (l) => <BadgeDe mapa={SITUACAO_LOTE} valor={l.situacao} /> },
  { chave: 'idadeDias', titulo: 'Idade', alinhar: 'right', ordenavel: true, render: idade },
  { chave: 'local', titulo: 'Local', ordenavel: true },
  // Extras, ligados em "Colunas"
  { chave: 'nfNumero', titulo: 'NF', ordenavel: true, opcional: true, render: (l) => <CodigoLink codigo={`NF ${l.nfNumero}`} /> },
  { chave: 'fornecedor', titulo: 'Fornecedor', ordenavel: true, opcional: true },
  { chave: 'fardos', titulo: 'Fardos', alinhar: 'right', ordenavel: true, opcional: true },
  { chave: 'recebidoEm', titulo: 'Recebido em', ordenavel: true, opcional: true, render: (l) => data(l.recebidoEm) },
  { chave: 'etapaInspecao', titulo: 'Inspeção', opcional: true, render: (l) => <BadgeDe mapa={ETAPA_INSPECAO} valor={l.etapaInspecao} /> },
  { chave: 'estoqueStatus', titulo: 'Estoque', opcional: true, render: (l) => <StatusEstoqueBadge s={l.estoqueStatus} /> },
  { chave: 'dimensoes', titulo: 'Dimensões (C × L × A)', opcional: true, render: (l) => `${metros(l.comprimentoM)} × ${metros(l.larguraM)} × ${metros(l.alturaM)}` },
  { chave: 'volumeDocumentalM3', titulo: 'Volume documental', alinhar: 'right', ordenavel: true, opcional: true, render: (l) => m3(l.volumeDocumentalM3) },
  { chave: 'volumeCalculadoM3', titulo: 'Volume calculado', alinhar: 'right', ordenavel: true, opcional: true, render: (l) => m3(l.volumeCalculadoM3) },
];

/**
 * Estoque por fardo (padrão: a unidade física do pátio, mais os lotes ainda sem fardo) ou por lote (situação e origem de cada lote).
 * A visão fica no endereço (?visao=lote). O saldo por lote separado por estado fica na tela Saldo de estoque.
 */
export default function Estoque() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const visao: Visao = params.get('visao') === 'lote' ? 'lote' : 'fardo';
  const mudarVisao = (v: Visao) => setParams(v === 'fardo' ? {} : { visao: v });
  const [fardosDe, setFardosDe] = useState<Lote | null>(null);
  const ind = useAsync(() => servicos.dashboard.indicadores(), []);
  const d = ind.dados;

  // Totais logo abaixo do título, iguais nas duas visões.
  const resumo = (
    <>
      {ind.erro && <Aviso tom="alerta">Não foi possível carregar os totais do estoque. A lista abaixo continua disponível.</Aviso>}
      {d && (
        <div className="grade-cards">
          <StatCard rotulo="Disponível" valor={un(d.disponivel)} tom="verde" />
          <StatCard rotulo="Bloqueado" valor={un(d.bloqueado)} tom="cinza" detalhe="Quarentena, reprovado ou espécie/tamanho divergente" />
          <StatCard rotulo="Com divergência" valor={un(d.divergente)} tom="vermelho" />
          <StatCard rotulo="Aguardando inspeção" valor={un(d.emAnalise)} tom="azul" detalhe="Ainda sem fardo" />
        </div>
      )}
    </>
  );
  const comum = {
    titulo: 'Estoque',
    resumo,
    acoes: <AlternarVisao visao={visao} aoMudar={mudarVisao} opcoes={VISOES} />,
    aviso: (
      <ComoFunciona>
        O estoque é controlado por fardo, e cada fardo sabe quais dormentes tem. Só fardos disponíveis vão para a separação da RME;
        quarentena, reprovado, espécie/tamanho divergente e lote com divergência de volume ficam segregados. Lotes aguardando inspeção ainda
        não têm fardo e aparecem à parte, embaixo dos fardos. Lotes não são cadastrados à mão: nascem do recebimento, em unidades. O saldo
        oficial é o informado pelo sistema responsável; contagens estimadas por imagem não alteram este saldo.
      </ComoFunciona>
    ),
  };

  if (visao === 'lote') {
    return (
      <>
        <ListPage<Lote>
          key="lote" {...comum}
          descricao="Um lote por NF, espécie e tamanho, criado ao confirmar o recebimento: situação, saldo e origem."
          listar={(q) => servicos.lotes.listar(q)}
          colunas={COLUNAS_LOTE}
          filtros={[
            { chave: 'situacao', rotulo: 'Situação', opcoes: SITUACAO_LOTE_OPCOES },
            { chave: 'acimaLimiteIdade', rotulo: 'Idade', opcoes: IDADE_LOTE_OPCOES },
            { chave: 'classe', rotulo: 'Classe', opcoes: CLASSE_OPCOES },
            { chave: 'categoria', rotulo: 'Categoria', opcoes: CATEGORIA_OPCOES },
          ]}
          acoesLinha={[
            { rotulo: 'Abrir', aoClicar: (l) => nav(`/lotes/${encodeURIComponent(l.codigo)}`) },
            { rotulo: 'Fardos e etiquetas', aoClicar: setFardosDe, visivel: (l) => l.fardos > 0 },
          ]}
        />
        <FardosModal lote={fardosDe} aoFechar={() => setFardosDe(null)} />
      </>
    );
  }

  return (
    <>
      <ListPage<FardoEstoque>
        key="fardo" {...comum}
        descricao="Fardos no pátio, os com saldo primeiro e do mais antigo ao mais novo (FIFO). Abra um fardo para ver os seus dormentes."
        listar={(q) => servicos.fardos.listar(q)}
        colunas={COLUNAS_FARDO}
        ordemPadrao={[{ campo: 'emEstoque', dir: 'desc' }, { campo: 'recebidoEm', dir: 'asc' }, { campo: 'codigo', dir: 'asc' }]}
        filtros={[
          { chave: 'situacao', rotulo: 'Situação', opcoes: SITUACAO_FARDO_OPCOES },
          { chave: 'estado', rotulo: 'Fechado/aberto', opcoes: ESTADO_FARDO_OPCOES },
          { chave: 'acimaLimiteIdade', rotulo: 'Idade', opcoes: IDADE_LOTE_OPCOES },
          { chave: 'classe', rotulo: 'Classe', opcoes: CLASSE_OPCOES },
          { chave: 'categoria', rotulo: 'Categoria', opcoes: CATEGORIA_OPCOES },
        ]}
        acoesLinha={[{ rotulo: 'Abrir', principal: true, aoClicar: (f) => nav(`/fardos/${encodeURIComponent(f.codigo)}`) }]}
      />
      <ListPage<Lote>
        secao titulo="Lotes ainda sem fardo"
        descricao="Recebidos e aguardando inspeção: os fardos são formados na tela Inspeção, quando todas as peças tiverem resultado."
        // Lote sem fardo = inspeção ainda não concluída (fardos são formados na conclusão).
        listar={(q) => servicos.lotes.listar({ ...q, filters: { ...q.filters, fardos: '0' } })}
        colunas={COLUNAS_SEM_FARDO}
        ordemPadrao={[{ campo: 'recebidoEm', dir: 'asc' }]}
        filtros={[{ chave: 'etapaInspecao', rotulo: 'Inspeção', opcoes: ETAPA_INSPECAO_OPCOES.filter((o) => o.valor !== 'concluida') }]}
        acoesLinha={[
          { rotulo: 'Ir para Inspeção', principal: true, aoClicar: () => nav('/inspecao') },
          { rotulo: 'Abrir lote', aoClicar: (l) => nav(`/lotes/${encodeURIComponent(l.codigo)}`) },
        ]}
      />
    </>
  );
}
