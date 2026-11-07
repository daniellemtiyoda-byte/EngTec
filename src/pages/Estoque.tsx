import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { Badge, BadgeDe } from '../components/Badge';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { CodigoLink } from '../components/Codigos';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { TransferirFardo } from '../components/TransferirFardo';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_SALDO_OPCOES } from '../dominio/opcoes';
import { SITUACAO_FARDO, SITUACAO_SALDO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { Fardo, SaldoItem } from '../types/models';
import { dias, numero } from '../utils/format';

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

  const especies = (cad.listas?.especies ?? []).map((e) => ({ valor: e.id, rotulo: e.nomePopular }));
  const tamanhos = (cad.listas?.tamanhos ?? []).map((t) => ({ valor: t.id, rotulo: t.codigo }));
  const locais = (cad.listas?.locais ?? []).filter((l) => l.tipo === 'armazenagem' || l.tipo === 'expedicao').map((l) => ({ valor: l.id, rotulo: l.codigo }));

  const abas: Aba<Visao>[] = operacao ? [{ valor: 'item', rotulo: 'Por item' }, { valor: 'fardo', rotulo: 'Por fardo' }] : [{ valor: 'item', rotulo: 'Por item' }];

  const colunasItem: Coluna<SaldoItem>[] = [
    { chave: 'especieId', titulo: 'Espécie', render: (s) => cad.nomeEspecie(s.especieId) },
    { chave: 'tamanhoId', titulo: 'Tamanho', render: (s) => cad.codigoTamanho(s.tamanhoId) },
    { chave: 'emEstoque', titulo: 'Em estoque', alinhar: 'right', ordenavel: true, render: (s) => <strong>{numero(s.emEstoque)}</strong> },
    { chave: 'aguardandoInspecao', titulo: 'Aguardando inspeção', alinhar: 'right', ordenavel: true, render: (s) => numero(s.aguardandoInspecao) },
    { chave: 'reservado', titulo: 'Reservado', alinhar: 'right', ordenavel: true, render: (s) => numero(s.reservado) },
    { chave: 'naoLocalizado', titulo: 'Não localizado', alinhar: 'right', opcional: true, render: (s) => numero(s.naoLocalizado) },
    { chave: 'minimo', titulo: 'Mínimo', alinhar: 'right', render: (s) => (s.minimo || s.maximo ? numero(s.minimo) : '—') },
    { chave: 'maximo', titulo: 'Máximo', alinhar: 'right', render: (s) => (s.minimo || s.maximo ? numero(s.maximo) : '—') },
    { chave: 'situacao', titulo: 'Situação', render: (s) => <BadgeDe mapa={SITUACAO_SALDO} valor={s.situacao} /> },
  ];

  const colunasFardo: Coluna<Fardo>[] = [
    { chave: 'id', titulo: 'Fardo', render: (f) => <CodigoLink codigo={f.id} /> },
    { chave: 'itemContratoId', titulo: 'Item', render: (f) => { const i = itens.get(f.itemContratoId); return i ? cad.descreverItem(i) : '—'; } },
    { chave: 'contratoId', titulo: 'Contrato', opcional: true, render: (f) => { const n = itens.get(f.itemContratoId)?.contrato; return n ? <Link className="mono" to={`/contratos/${n}`}>{n}</Link> : '—'; } },
    { chave: 'localId', titulo: 'Local', render: (f) => { const c = cad.codigoLocal(f.localId); return c !== '—' ? <Link className="mono" to={`/locais/${c}`}>{c}</Link> : c; } },
    { chave: 'saldo', titulo: 'Saldo', alinhar: 'right', ordenavel: true, render: (f) => `${numero(f.saldo)}/${numero(f.quantidadeInicial)}` },
    { chave: 'disponivel', titulo: 'Disponível', alinhar: 'right', ordenavel: true, render: (f) => numero(f.disponivel) },
    {
      chave: 'idadeDias', titulo: 'Idade', alinhar: 'right', ordenavel: true,
      render: (f) => <>{f.idadeDias !== undefined ? dias(f.idadeDias) : '—'}{f.acimaLimiteDias && <> <Badge tom="laranja">acima do limite</Badge></>}</>,
    },
    { chave: 'situacao', titulo: 'Situação', render: (f) => <BadgeDe mapa={SITUACAO_FARDO} valor={f.situacao} /> },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Estoque"
        subtitulo="Saldo por espécie e tamanho e os fardos guardados. Falta e excesso comparam o disponível com o mínimo e o máximo de Configurações."
        acoes={movimentar && <button className="btn btn-pri" onClick={() => setTransferir({})}>Transferir fardo</button>}
      />
      <AbasSecao abas={abas} ativa={visaoAtual} aoEscolher={setVisao} rotulo="Visão do estoque">
        {visaoAtual === 'item' && (
          <ListPage<SaldoItem>
            key="item" titulo="Saldo por item" subnivel colunas={colunasItem} recarregar={rec}
            descricao="Em estoque é o disponível para nova saída; os reservados ainda estão nos fardos."
            filtros={[
              { chave: 'especieId', rotulo: 'Espécie', opcoes: especies },
              { chave: 'tamanhoId', rotulo: 'Tamanho', opcoes: tamanhos },
              { chave: 'situacao', rotulo: 'Situação', opcoes: SITUACAO_SALDO_OPCOES },
            ]}
            listar={(q) => servicos.estoque.porItem(q)}
            acoesLinha={operacao ? [{ rotulo: 'Ver fardos', principal: true, aoClicar: (s) => setParams({ visao: 'fardo', especieId: s.especieId, tamanhoId: s.tamanhoId }) }] : undefined}
          />
        )}
        {visaoAtual === 'fardo' && (
          <ListPage<Fardo>
            key="fardo" titulo="Fardos em estoque" subnivel colunas={colunasFardo} recarregar={rec}
            descricao={`Do mais antigo ao mais novo. Acima de ${numero(parametros.dados?.limiteDiasEstoque ?? 120)} dias o fardo fica em alerta. Pesquise pelo ID do fardo ou pelo contrato.`}
            abasSituacao={{ chave: 'situacao', rotulo: 'Situação do fardo', abas: [{ valor: '', rotulo: 'Todos' }, { valor: 'em_estoque', rotulo: 'Em estoque' }, { valor: 'aberto', rotulo: 'Abertos' }] }}
            filtros={[
              { chave: 'especieId', rotulo: 'Espécie', opcoes: especies },
              { chave: 'tamanhoId', rotulo: 'Tamanho', opcoes: tamanhos },
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
