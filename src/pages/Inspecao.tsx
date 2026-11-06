import { useNavigate } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { BadgeDe } from '../components/Badge';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { CodigoLink } from '../components/Codigos';
import { BarraProgresso } from '../components/Indicadores';
import { ListPage, type Coluna } from '../components/ListPage';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_FARDO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { Dormente, Fardo } from '../types/models';
import { dataHora, dias } from '../utils/format';

type AbaInspecao = 'fila' | 'nao_localizados';
const ABAS: AbaInspecao[] = ['fila', 'nao_localizados'];

const contar = () => Promise.all([servicos.inspecao.fila({ pageSize: 1 }), servicos.inspecao.naoLocalizados({ pageSize: 1 })]).then((r) => r.map((x) => x.total));

/** Evento que marcou o dormente como não localizado (data e justificativa da conclusão do fardo). */
const marcacao = (d: Dormente) => [...d.historico].reverse().find((h) => h.tipo === 'nao_localizado');

/**
 * Inspeção (seção 9.10 do plano): a fila dos fardos recebidos e ainda não concluídos, com o progresso, e os dormentes
 * não localizados (pendência do gestor), que voltam a ser inspecionados quando forem encontrados.
 */
export default function Inspecao() {
  const { pode } = useAuth();
  const nav = useNavigate();
  const cad = useCadastros();
  const [aba, setAba] = useAbaNoEndereco<AbaInspecao>(ABAS);
  const totais = useAsync(contar, []);
  const contratos = useAsync(() => servicos.contratos.listar({ pageSize: 500 }), []);
  const itens = new Map((contratos.dados?.items ?? []).flatMap((c) => c.itens.map((i) => [i.id, i] as const)));
  const operar = pode('inspecao:operar');

  const abas: Aba<AbaInspecao>[] = [
    { valor: 'fila', rotulo: 'Fila', total: totais.dados?.[0] },
    { valor: 'nao_localizados', rotulo: 'Não localizados', total: totais.dados?.[1] },
  ];

  const colunasFila: Coluna<Fardo>[] = [
    { chave: 'id', titulo: 'Fardo', render: (f) => <CodigoLink codigo={f.id} /> },
    { chave: 'itemContratoId', titulo: 'Item', render: (f) => { const i = itens.get(f.itemContratoId); return i ? cad.descreverItem(i) : '—'; } },
    { chave: 'localId', titulo: 'Local de espera', render: (f) => cad.codigoLocal(f.localId) },
    {
      chave: 'progressoInspecao', titulo: 'Progresso', render: (f) => f.progressoInspecao
        ? <BarraProgresso total={f.progressoInspecao.total} recebido={f.progressoInspecao.inspecionados} unidade="inspecionados" />
        : '—',
    },
    { chave: 'idadeDias', titulo: 'Recebido há', alinhar: 'right', ordenavel: true, opcional: true, render: (f) => (f.idadeDias !== undefined ? dias(f.idadeDias) : '—') },
    { chave: 'situacao', titulo: 'Situação', render: (f) => <BadgeDe mapa={SITUACAO_FARDO} valor={f.situacao} /> },
  ];

  const colunasNaoLocalizados: Coluna<Dormente>[] = [
    { chave: 'id', titulo: 'Dormente', render: (d) => <CodigoLink codigo={d.id} /> },
    { chave: 'fardoId', titulo: 'Fardo', render: (d) => <CodigoLink codigo={d.fardoId} /> },
    { chave: 'itemContratoId', titulo: 'Item', opcional: true, render: (d) => { const i = itens.get(d.itemContratoId); return i ? cad.descreverItem(i) : '—'; } },
    { chave: 'historico', titulo: 'Desde', render: (d) => dataHora(marcacao(d)?.quando) },
    { chave: 'situacao', titulo: 'Justificativa', quebrar: true, render: (d) => marcacao(d)?.descricao.replace(/^Não lido na inspeção do fardo [^:]+: /, '') ?? '—' },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Inspeção"
        subtitulo="Fardos recebidos aguardando ou em inspeção. Ao concluir, os aprovados vão para o local de guarda e os reprovados para a segregação."
      />
      <AbasSecao abas={abas} ativa={aba} aoEscolher={setAba} rotulo="Inspeção">
        {aba === 'fila' && (
          <ListPage<Fardo>
            key="fila" titulo="Fila de inspeção" descricao="Do recebido há mais tempo ao mais recente." subnivel colunas={colunasFila}
            listar={(q) => servicos.inspecao.fila(q)}
            acoesLinha={[{ rotulo: operar ? 'Inspecionar' : 'Ver inspeção', principal: true, aoClicar: (f) => nav(`/inspecao/${f.id}`) }]}
          />
        )}
        {aba === 'nao_localizados' && (
          <ListPage<Dormente>
            key="nao_localizados" titulo="Dormentes não localizados" subnivel colunas={colunasNaoLocalizados}
            descricao="Não lidos na conclusão da inspeção do fardo. Quando forem encontrados, inspecione: seguem para o estoque ou para a segregação na hora."
            listar={(q) => servicos.inspecao.naoLocalizados(q)}
            acoesLinha={operar ? [{ rotulo: 'Inspecionar', principal: true, aoClicar: (d) => nav(`/inspecao/${d.fardoId}?dormente=${d.id}`) }] : undefined}
          />
        )}
      </AbasSecao>
    </>
  );
}
