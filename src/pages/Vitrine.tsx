import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { Badge, SeloDemo, type Tom } from '../components/Badge';
import { CabecalhoObjeto, CabecalhoPagina, FatoChave } from '../components/Cabecalhos';
import { Etapas } from '../components/Etapas';
import { IdCodigo } from '../components/IdCodigo';
import { BarraProgresso, CartaoIndicador } from '../components/Indicadores';
import { LinhaTempo, type EventoLinhaTempo } from '../components/LinhaTempo';
import { ListPage, type Coluna } from '../components/ListPage';
import { MenuAcoes } from '../components/MenuAcoes';
import { ProgressoPassos } from '../components/Passos';
import { Relacionados } from '../components/Relacionados';
import { RodapeAcoes } from '../components/RodapeAcoes';
import { useToast } from '../components/Toast';
import type { ListQuery, Paginado } from '../types/models';
import { dias, numero } from '../utils/format';

/*
 * Vitrine interna (seção 9.20 do docs/PLANO-V2.md): só administrador, fora do menu, dados FIXOS neste arquivo,
 * sem serviço. Serve para validar os padrões de lista e de objeto; não é uma tela do produto. Por isso a situação
 * vem pronta em cada linha (rótulo e tom): os mapas de situação de verdade entram em dominio/rotulos.ts na Etapa 2.
 */

interface FardoExemplo {
  id: string;
  item: string;
  especie: string;
  contrato: string;
  local: string;
  saldo: number;
  inicial: number;
  idadeDias: number;
  situacao: string;
  situacaoRotulo: string;
  tom: Tom;
}

const SITUACOES: Record<string, [Tom, string]> = {
  em_estoque: ['verde', 'Em estoque'],
  aberto: ['azul', 'Aberto'],
  aguardando_inspecao: ['laranja', 'Aguardando inspeção'],
  baixado: ['cinza', 'Baixado'],
};

const ITENS = [
  { especie: 'Dialium guianense', item: 'Dialium guianense · 2,80 m' },
  { especie: 'Manilkara huberi', item: 'Manilkara huberi · 2,00 m' },
];
const LOCAIS = ['A-01', 'A-02', 'A-03', 'B-01', 'INSP-01'];
const ORDEM_SITUACAO = ['em_estoque', 'em_estoque', 'aberto', 'em_estoque', 'aguardando_inspecao', 'baixado', 'em_estoque'];

// 18 fardos determinísticos (sem Math.random), como pede o plano para os dados de demonstração.
const FARDOS: FardoExemplo[] = Array.from({ length: 18 }, (_, i) => {
  const situacao = ORDEM_SITUACAO[i % ORDEM_SITUACAO.length];
  const { especie, item } = ITENS[i % 2];
  const contrato = i < 12 ? 'AR00224-01' : 'AR00311-02';
  const saldo = situacao === 'baixado' ? 0 : situacao === 'aberto' ? 6 : 14 - (i % 3 === 0 ? 1 : 0);
  return {
    id: `${contrato}-F${String(i + 1).padStart(3, '0')}`, item, especie, contrato,
    local: situacao === 'aguardando_inspecao' ? 'INSP-01' : situacao === 'baixado' ? '—' : LOCAIS[i % 4],
    saldo, inicial: 14, idadeDias: 130 - i * 7, situacao,
    situacaoRotulo: SITUACOES[situacao][1], tom: SITUACOES[situacao][0],
  };
});

const contar = (s: string) => FARDOS.filter((f) => f.situacao === s).length;
const ABAS_SITUACAO: Aba[] = [
  { valor: '', rotulo: 'Todos', total: FARDOS.length },
  ...Object.entries(SITUACOES).map(([valor, [, rotulo]]) => ({ valor, rotulo, total: contar(valor) })),
];

/** Filtra, ordena e pagina os dados fixos, como o serviço fará. */
async function listarExemplo(q: ListQuery): Promise<Paginado<FardoExemplo>> {
  let r = FARDOS.filter((f) => Object.entries(q.filters ?? {}).every(([k, v]) => !v || String(f[k as keyof FardoExemplo]) === v));
  if (q.search) {
    const s = q.search.toLowerCase();
    r = r.filter((f) => [f.id, f.item, f.contrato, f.local].some((v) => v.toLowerCase().includes(s)));
  }
  if (q.sortBy) {
    const k = q.sortBy as keyof FardoExemplo;
    r = [...r].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (q.sortDir === 'desc' ? -1 : 1));
  } else {
    r = [...r].sort((a, b) => b.idadeDias - a.idadeDias); // padrão do Estoque por fardo: mais antigos primeiro
  }
  const pageSize = q.pageSize ?? 10;
  const page = q.page ?? 1;
  return { items: r.slice((page - 1) * pageSize, page * pageSize), total: r.length, page, pageSize, origem: 'simulado' };
}

const LIMITE_DIAS = 120;

function ExemploLista() {
  const notificar = useToast();
  const exemplo = () => notificar('info', 'Exemplo da vitrine: nada foi alterado.');
  const colunas: Coluna<FardoExemplo>[] = [
    { chave: 'id', titulo: 'Fardo', ordenavel: true, render: (f) => <IdCodigo id={f.id} para="/vitrine?aba=objeto" /> },
    { chave: 'item', titulo: 'Item', quebrar: true },
    { chave: 'contrato', titulo: 'Contrato', opcional: true, render: (f) => <IdCodigo id={f.contrato} /> },
    { chave: 'local', titulo: 'Local', ordenavel: true },
    { chave: 'saldo', titulo: 'Saldo', alinhar: 'right', ordenavel: true, render: (f) => `${numero(f.saldo)}/${numero(f.inicial)}` },
    { chave: 'idadeDias', titulo: 'Idade', alinhar: 'right', ordenavel: true, render: (f) => (f.idadeDias > LIMITE_DIAS ? <span className="texto-critico" title={`Acima do limite de ${LIMITE_DIAS} dias`}>{dias(f.idadeDias)} · acima</span> : dias(f.idadeDias)) },
    { chave: 'situacao', titulo: 'Situação', render: (f) => <Badge tom={f.tom}>{f.situacaoRotulo}</Badge> },
    { chave: 'especie', titulo: 'Espécie', opcional: true },
  ];
  return (
    <ListPage<FardoExemplo>
      titulo="Estoque por fardo (exemplo)"
      subnivel
      migalhas={[{ rotulo: 'Estoque', para: '/vitrine' }, { rotulo: 'Por fardo' }]}
      acoes={<>
        <button className="btn btn-sec" onClick={exemplo}>Imprimir QR</button>
        <button className="btn btn-pri" onClick={exemplo}>Transferir fardo</button>
      </>}
      abasSituacao={{ chave: 'situacao', rotulo: 'Situação do fardo', abas: ABAS_SITUACAO }}
      filtros={[
        { chave: 'especie', rotulo: 'Espécie', opcoes: ITENS.map((i) => ({ valor: i.especie, rotulo: i.especie })) },
        { chave: 'local', rotulo: 'Local', opcoes: LOCAIS.map((l) => ({ valor: l, rotulo: l })) },
      ]}
      listar={listarExemplo}
      colunas={colunas}
      acoesLinha={[
        { rotulo: 'Inspecionar', principal: true, visivel: (f) => f.situacao === 'aguardando_inspecao', aoClicar: exemplo },
        { rotulo: 'Transferir', principal: true, visivel: (f) => f.situacao === 'em_estoque' || f.situacao === 'aberto', aoClicar: exemplo },
        { rotulo: 'Imprimir etiqueta', aoClicar: exemplo },
        { rotulo: 'Ver histórico', aoClicar: exemplo },
      ]}
    />
  );
}

const DORMENTES = Array.from({ length: 14 }, (_, i) => ({
  id: `AR00224-01-${String(345 + i).padStart(6, '0')}`,
  reprovado: i === 9,
  categoria: i === 9 ? undefined : [1, 1, 2, 1, 3][i % 5],
  comprimentoCm: 280 + (i % 3) - 1,
}));

const EVENTOS: EventoLinhaTempo[] = [
  { quando: '2026-09-24T14:10:00-03:00', quem: 'Almoxarife 1', titulo: 'Guardado em A-03', marca: 'GUA', referencia: 'AR00224-01-F012' },
  { quando: '2026-09-24T11:02:00-03:00', quem: 'Inspector', titulo: 'Inspeção concluída: 13 aprovados, 1 reprovado', detalhe: 'O reprovado foi para a segregação.', marca: 'INS' },
  { quando: '2026-09-23T09:40:00-03:00', quem: 'Almoxarife 1', titulo: 'Recebido na NF 4512', marca: 'REC', tipo: 'recebimento' },
  { quando: '2026-09-20T16:00:00-03:00', quem: 'Fornecedor', titulo: 'Emitido pelo fornecedor', marca: 'EMI' },
];

type AbaObjeto = 'dormentes' | 'origem' | 'historico';
const ABAS_OBJETO: Aba<AbaObjeto>[] = [
  { valor: 'dormentes', rotulo: 'Dormentes', total: 14 },
  { valor: 'origem', rotulo: 'Origem' },
  { valor: 'historico', rotulo: 'Histórico' },
];

function ExemploObjeto() {
  const notificar = useToast();
  const exemplo = () => notificar('info', 'Exemplo da vitrine: nada foi alterado.');
  const [aba, setAba] = useAbaNoEndereco(ABAS_OBJETO.map((a) => a.valor), 'detalhe');
  return (
    <section className="painel">
      <CabecalhoObjeto
        nivel={2}
        tipo="Fardo"
        id="AR00224-01-F012"
        situacao={<Badge tom="verde">Em estoque</Badge>}
        migalhas={[{ rotulo: 'Estoque', para: '/vitrine' }, { rotulo: 'Fardo AR00224-01-F012' }]}
        acoes={<>
          <button className="btn btn-sec" onClick={exemplo}>Imprimir etiqueta</button>
          <button className="btn btn-pri" onClick={exemplo}>Transferir</button>
          <MenuAcoes itens={[{ rotulo: 'Ver movimentações', aoClicar: exemplo }]} />
        </>}
        fatos={<>
          <FatoChave rotulo="Saldo" valor="13 de 14" />
          <FatoChave rotulo="Disponível" valor="13" />
          <FatoChave rotulo="Local" valor="A-03" para="/vitrine?aba=lista&local=A-03" />
          <FatoChave rotulo="Idade" valor={dias(42)} />
          <FatoChave rotulo="Contrato" valor={<span className="mono">AR00224-01</span>} para="/vitrine?aba=lista" />
          <FatoChave rotulo="Item" valor="Dialium guianense · 2,80 m" />
        </>}
      />
      <div className="objeto-grade">
        <AbasSecao abas={ABAS_OBJETO} ativa={aba} aoEscolher={setAba} rotulo="Seções do fardo">
          {aba === 'dormentes' && (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th scope="col">Dormente</th><th scope="col">Situação</th><th scope="col">Categoria</th><th scope="col" className="al-right">Comprimento</th></tr></thead>
                <tbody>
                  {DORMENTES.map((d) => (
                    <tr key={d.id}>
                      <td><IdCodigo id={d.id} /></td>
                      <td>{d.reprovado ? <Badge tom="vermelho">Reprovado</Badge> : <Badge tom="verde">Em estoque</Badge>}</td>
                      <td>{d.categoria ? `Categoria ${d.categoria}` : '—'}</td>
                      <td className="al-right">{numero(d.comprimentoCm)} cm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {aba === 'origem' && (
            <dl className="detalhes">
              <dt>Contrato</dt><dd><IdCodigo id="AR00224-01" /></dd>
              <dt>Fornecedor</dt><dd>Madeireira Exemplo A Ltda. (fictício)</dd>
              <dt>NF</dt><dd>4512</dd>
              <dt>DOF</dt><dd>DOF 2026.000123 · declarado em 25/09/2026</dd>
              <dt>Recebimento</dt><dd>23/09/2026 · Almoxarife 1</dd>
            </dl>
          )}
          {aba === 'historico' && <LinhaTempo eventos={EVENTOS} />}
        </AbasSecao>
        <Relacionados itens={[
          { icone: 'contrato', tipo: 'Contrato', valor: <span className="mono">AR00224-01</span>, para: '/vitrine?aba=lista' },
          { icone: 'fabrica', tipo: 'Fornecedor', valor: 'Madeireira Exemplo A Ltda.' },
          { icone: 'file', tipo: 'NF e DOF', valor: 'NF 4512', detalhe: 'DOF declarado' },
          { icone: 'truck', tipo: 'Recebimento', valor: '23/09/2026' },
          { icone: 'local', tipo: 'Local', valor: 'A-03', detalhe: 'Armazenagem' },
        ]} />
      </div>
    </section>
  );
}

function ExemploComponentes() {
  const notificar = useToast();
  const exemplo = () => notificar('info', 'Exemplo da vitrine: nada foi alterado.');
  return (
    <section className="painel vitrine-componentes">
      <h2 className="subtitulo">Indicadores</h2>
      <div className="grade-indicadores">
        <CartaoIndicador rotulo="Em estoque" valor={1284} detalhe="dormentes" para="/vitrine?aba=lista&situacao=em_estoque" />
        <CartaoIndicador rotulo="Aguardando inspeção" valor={contar('aguardando_inspecao')} detalhe="fardos" tom="laranja" para="/vitrine?aba=lista&situacao=aguardando_inspecao" />
        <CartaoIndicador rotulo="Itens abaixo do mínimo" valor={1} detalhe="Dialium guianense · 2,80 m" tom="vermelho" />
        <CartaoIndicador rotulo="DOFs a declarar" valor={3} detalhe="1 vencido" tom="vermelho" />
      </div>

      <h2 className="subtitulo">Entregas do contrato</h2>
      <BarraProgresso rotulo="AR00224-01 · Dialium guianense · 2,80 m" total={1000} recebido={612} aprovado={583} />
      <BarraProgresso rotulo="AR00311-02 · Manilkara huberi · 2,00 m" total={400} recebido={56} aprovado={56} />

      <h2 className="subtitulo">Situações, selos e IDs</h2>
      <div className="vitrine-linha">
        <Badge tom="verde">Em estoque</Badge><Badge tom="azul">Em separação</Badge><Badge tom="laranja">Aguardando inspeção</Badge>
        <Badge tom="vermelho">Reprovado</Badge><Badge tom="cinza">Baixado</Badge><SeloDemo />
      </div>
      <div className="vitrine-linha">
        <IdCodigo id="AR00224-01-000357" /><IdCodigo id="AR00224-01-F012" /><IdCodigo id="RME-2026-0012" /><IdCodigo id="LOC-A03" />
      </div>

      <h2 className="subtitulo">Etapas e assistente</h2>
      <Etapas etapas={['Aberta', 'Em separação', 'Pronta', 'Entregue']} atual={1} />
      <ProgressoPassos passos={['Documentos', 'Leitura dos fardos', 'Conferência', 'Local de espera', 'Revisar e confirmar']} atual={1} />

      <h2 className="subtitulo">Rodapé de ações das telas de campo</h2>
      <p className="mudo">No celular, as telas de campo fixam estas ações no rodapé; aqui ele aparece no fluxo da página.</p>
      <RodapeAcoes fixo={false}>
        <button className="btn btn-sec" onClick={exemplo}>Reprovado</button>
        <button className="btn btn-pri" onClick={exemplo}>Aprovado</button>
      </RodapeAcoes>
    </section>
  );
}

type AbaVitrine = 'lista' | 'objeto' | 'componentes';
const ABAS_VITRINE: Aba<AbaVitrine>[] = [
  { valor: 'lista', rotulo: 'Padrão Lista' },
  { valor: 'objeto', rotulo: 'Padrão Objeto' },
  { valor: 'componentes', rotulo: 'Componentes' },
];

export default function Vitrine() {
  const [aba, setAba] = useAbaNoEndereco(ABAS_VITRINE.map((a) => a.valor));
  return (
    <>
      <CabecalhoPagina
        titulo="Vitrine de componentes"
        subtitulo="Interna: dados fixos para validar os padrões de página. Não é uma tela do produto."
        migalhas={[{ rotulo: 'Painel', para: '/' }, { rotulo: 'Vitrine' }]}
      />
      <AbasSecao abas={ABAS_VITRINE} ativa={aba} aoEscolher={setAba} rotulo="Padrões da vitrine">
        {aba === 'lista' && <ExemploLista />}
        {aba === 'objeto' && <ExemploObjeto />}
        {aba === 'componentes' && <ExemploComponentes />}
      </AbasSecao>
    </>
  );
}
