import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeDe } from '../components/Badge';
import { CodigoLink } from '../components/Codigos';
import { ListPage, type Coluna } from '../components/ListPage';
import { NovaRme } from '../components/NovaRme';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_RME, TIPO_DESTINO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { Rme, SituacaoRme } from '../types/models';
import { data, numero } from '../utils/format';

const ABAS: { valor: SituacaoRme; rotulo: string }[] = [
  { valor: 'aberta', rotulo: 'Abertas' },
  { valor: 'em_separacao', rotulo: 'Em separação' },
  { valor: 'pronta', rotulo: 'Prontas' },
  { valor: 'entregue', rotulo: 'Entregues' },
  { valor: 'cancelada', rotulo: 'Canceladas' },
];
const contar = () => Promise.all(ABAS.map((a) => servicos.rme.listar({ pageSize: 1, filters: { situacao: a.valor } }).then((r) => r.total)));

/**
 * Requisições (seção 9.17 do plano): as RMEs por situação. O requisitante abre a RME (Nova RME); o almoxarife separa
 * (reserva) e entrega (baixa). Cada RME abre a sua página, com itens, separação e histórico.
 */
export default function Rmes() {
  const { pode } = useAuth();
  const notificar = useToast();
  const nav = useNavigate();
  const cad = useCadastros();
  const totais = useAsync(contar, []);
  const [nova, setNova] = useState(false);

  const colunas: Coluna<Rme>[] = [
    { chave: 'numero', titulo: 'RME', ordenavel: true, render: (r) => <CodigoLink codigo={r.numero} /> },
    { chave: 'solicitanteNome', titulo: 'Solicitante', opcional: true, render: (r) => r.solicitanteNome },
    { chave: 'destino', titulo: 'Destino', quebrar: true, render: (r) => <>{r.destino}<span className="detalhe-linha" style={{ display: 'block' }}>{TIPO_DESTINO[r.tipoDestino][1]}</span></> },
    { chave: 'itens', titulo: 'Itens', quebrar: true, render: (r) => r.itens.map((i) => `${cad.descreverItemRme(i)} (${numero(i.quantidade)})`).join('; ') },
    { chave: 'necessidadeEm', titulo: 'Necessidade em', ordenavel: true, render: (r) => data(r.necessidadeEm) },
    { chave: 'situacao', titulo: 'Situação', render: (r) => <BadgeDe mapa={SITUACAO_RME} valor={r.situacao} /> },
  ];

  return (
    <>
      <ListPage<Rme>
        titulo="Requisições (RME)"
        descricao="Pedidos de dormentes para as obras: o requisitante abre, o almoxarifado separa e entrega."
        acoes={pode('rme:abrir') && <button className="btn btn-pri" onClick={() => setNova(true)}>Nova RME</button>}
        abasSituacao={{ chave: 'situacao', rotulo: 'Situação da RME', abas: ABAS.map((a, i) => ({ ...a, total: totais.dados?.[i] })) }}
        listar={(q) => servicos.rme.listar(q)}
        colunas={colunas}
        acoesLinha={[
          ...(pode('rme:separar') ? [
            { rotulo: 'Separar', principal: true, visivel: (r: Rme) => r.situacao === 'aberta' || r.situacao === 'em_separacao', aoClicar: (r: Rme) => nav(`/saidas/${r.numero}?separar=1`) },
            { rotulo: 'Entregar', principal: true, visivel: (r: Rme) => r.situacao === 'pronta', aoClicar: (r: Rme) => nav(`/saidas/${r.numero}`) },
          ] : []),
          { rotulo: 'Ver RME', aoClicar: (r: Rme) => nav(`/saidas/${r.numero}`) },
        ]}
      />
      <NovaRme
        aberto={nova} cad={cad} aoFechar={() => setNova(false)}
        aoCriar={(r) => { setNova(false); notificar('sucesso', `${r.numero} aberta para ${r.destino}.`); nav(`/saidas/${r.numero}`); }}
      />
    </>
  );
}
