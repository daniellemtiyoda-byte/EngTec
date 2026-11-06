import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BadgeDe } from '../components/Badge';
import { ContratoModal } from '../components/ContratoModal';
import { IdCodigo } from '../components/IdCodigo';
import { BarraProgresso } from '../components/Indicadores';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_CONTRATO_OPCOES } from '../dominio/opcoes';
import { SITUACAO_CONTRATO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { Contrato } from '../types/models';
import { data } from '../utils/format';

/** Totais de cada aba (situação) para os contadores. */
const contar = () => Promise.all(SITUACAO_CONTRATO_OPCOES.map((o) => servicos.contratos.listar({ pageSize: 1, filters: { situacao: o.valor } }).then((r) => r.total)));

export const totaisDoContrato = (c: Contrato) => c.itens.reduce((t, i) => ({
  contratado: t.contratado + i.quantidade, recebidos: t.recebidos + i.recebidos, aprovados: t.aprovados + i.aprovados, reprovados: t.reprovados + i.reprovados,
}), { contratado: 0, recebidos: 0, aprovados: 0, reprovados: 0 });

/** Contratos (seção 9.3 do plano): abas por situação, entregas por contrato e o cadastro de novo contrato. */
export default function Contratos() {
  const { pode } = useAuth();
  const notificar = useToast();
  const nav = useNavigate();
  const cad = useCadastros();
  const totais = useAsync(contar, []);
  const [novo, setNovo] = useState(false);

  const colunas: Coluna<Contrato>[] = [
    { chave: 'numero', titulo: 'Contrato', ordenavel: true, render: (c) => <IdCodigo id={c.numero} para={`/contratos/${c.numero}`} /> },
    { chave: 'ataId', titulo: 'Ata', render: (c) => <span className="mono">{cad.numeroAta(c.ataId)}</span> },
    { chave: 'fornecedorId', titulo: 'Fornecedor', quebrar: true, render: (c) => <Link to={`/fornecedores/${c.fornecedorId}`}>{cad.nomeFornecedor(c.fornecedorId)}</Link> },
    { chave: 'itens', titulo: 'Itens', quebrar: true, render: (c) => c.itens.map(cad.descreverItem).join('; ') },
    {
      chave: 'entregue', titulo: 'Entregue', render: (c) => {
        const t = totaisDoContrato(c);
        return <div className="celula-progresso"><BarraProgresso total={t.contratado} recebido={t.recebidos} aprovado={t.aprovados} /></div>;
      },
    },
    { chave: 'vigencia', titulo: 'Vigência', opcional: true, render: (c) => { const a = cad.atas.get(c.ataId); return a ? `${data(a.vigenciaInicio)} a ${data(a.vigenciaFim)}` : '—'; } },
    { chave: 'situacao', titulo: 'Situação', render: (c) => <BadgeDe mapa={SITUACAO_CONTRATO} valor={c.situacao} /> },
    { chave: 'empresaInspetora', titulo: 'Empresa inspetora', opcional: true },
    { chave: 'ano', titulo: 'Ano', opcional: true, ordenavel: true },
  ];

  // Anos para o filtro: o atual e os quatro anteriores.
  const anos = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
  return (
    <>
      <ListPage<Contrato>
        titulo="Contratos"
        acoes={pode('contratos:editar') && <button className="btn btn-pri" onClick={() => setNovo(true)}>Novo contrato</button>}
        abasSituacao={{ chave: 'situacao', rotulo: 'Situação do contrato', abas: SITUACAO_CONTRATO_OPCOES.map((o, i) => ({ valor: o.valor, rotulo: o.rotulo, total: totais.dados?.[i] })) }}
        listar={(q) => servicos.contratos.listar(q)}
        colunas={colunas}
        filtros={[
          { chave: 'fornecedorId', rotulo: 'Fornecedor', opcoes: (cad.listas?.fornecedores ?? []).map((f) => ({ valor: f.id, rotulo: f.razaoSocial })) },
          { chave: 'especieId', rotulo: 'Espécie', opcoes: (cad.listas?.especies ?? []).map((e) => ({ valor: e.id, rotulo: e.nomePopular })) },
          { chave: 'ano', rotulo: 'Ano', opcoes: anos.map((a) => ({ valor: a, rotulo: a })) },
        ]}
        acoesLinha={[{ rotulo: 'Abrir', principal: true, aoClicar: (c) => nav(`/contratos/${c.numero}`) }]}
      />
      <ContratoModal
        aberto={novo} cad={cad} aoFechar={() => setNovo(false)}
        aoSalvar={(c) => { setNovo(false); notificar('sucesso', `Contrato ${c.numero} criado.`); totais.recarregar(); nav(`/contratos/${c.numero}`); }}
      />
    </>
  );
}
