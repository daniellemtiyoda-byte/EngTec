import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeDe } from '../components/Badge';
import { ListPage, type Coluna } from '../components/ListPage';
import { PrazoDof } from '../components/PrazoDof';
import { RecebimentoAssistente } from '../components/RecebimentoAssistente';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_ENTREGA } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { Entrega } from '../types/models';
import { numero } from '../utils/format';

const ABAS = [
  { valor: 'a_caminho', rotulo: 'A caminho' },
  { valor: 'aguardando_inspecao', rotulo: 'Aguardando inspeção' },
  { valor: 'aguardando_laudo', rotulo: 'Aguardando laudo' },
  { valor: 'concluida', rotulo: 'Concluídos' },
  { valor: 'com_ocorrencia', rotulo: 'Com ocorrência' },
];
const contar = () => Promise.all(ABAS.map((a) => servicos.documentos.listarEntregas({ pageSize: 1, filters: { etapa: a.valor } }).then((r) => r.total)));

/**
 * Recebimentos (seção 9.7 do plano): as entregas por etapa (a caminho, inclusive as recebidas em parte; aguardando
 * inspeção; concluídas; com ocorrência) e o assistente de recebimento.
 */
export default function Recebimentos() {
  const { pode } = useAuth();
  const notificar = useToast();
  const nav = useNavigate();
  const cad = useCadastros();
  const totais = useAsync(contar, []);
  const contratos = useAsync(() => servicos.contratos.listar({ pageSize: 500 }), []);
  const [assistente, setAssistente] = useState<{ entregaId?: string } | null>(null);
  const [rec, setRec] = useState(0);
  const numeroContrato = (id: string) => contratos.dados?.items.find((c) => c.id === id)?.numero ?? '—';

  const colunas: Coluna<Entrega>[] = [
    { chave: 'nfNumero', titulo: 'NF', ordenavel: true, render: (en) => `NF ${en.nfNumero}` },
    { chave: 'fornecedorId', titulo: 'Fornecedor', quebrar: true, render: (en) => cad.nomeFornecedor(en.fornecedorId) },
    { chave: 'contratoId', titulo: 'Contrato', render: (en) => <span className="mono">{numeroContrato(en.contratoId)}</span> },
    { chave: 'fardosIds', titulo: 'Fardos', alinhar: 'right', render: (en) => `${en.fardosRecebidos.length} de ${en.fardosIds.length}` },
    { chave: 'dormentes', titulo: 'Dormentes', alinhar: 'right', render: (en) => numero(en.dormentes) },
    { chave: 'prazoDeclaracao', titulo: 'Prazo da DOF', ordenavel: true, render: (en) => <PrazoDof prazo={en.prazoDeclaracao} nivel={en.nivelPrazo} /> },
    { chave: 'situacao', titulo: 'Situação', render: (en) => <BadgeDe mapa={SITUACAO_ENTREGA} valor={en.situacao} /> },
  ];

  return (
    <>
      <ListPage<Entrega>
        titulo="Recebimentos"
        descricao="Escolha a entrega que chegou, leia os QR dos fardos e confira. NF e DOF são cadastradas antes, em NF e DOF."
        acoes={pode('recebimento:registrar') && <button className="btn btn-pri" onClick={() => setAssistente({})}>Receber</button>}
        abasSituacao={{ chave: 'etapa', rotulo: 'Etapa do recebimento', abas: ABAS.map((a, i) => ({ ...a, total: totais.dados?.[i] })) }}
        filtros={[{ chave: 'laudo', rotulo: 'Laudo Técnico', opcoes: [{ valor: 'a_vencer', rotulo: 'Prazo perto de vencer ou vencido' }] }]}
        listar={(q) => servicos.documentos.listarEntregas(q)}
        recarregar={rec}
        colunas={colunas}
        acoesLinha={[
          ...(pode('recebimento:registrar') ? [{ rotulo: 'Receber', principal: true, visivel: (en: Entrega) => en.situacao !== 'recebida', aoClicar: (en: Entrega) => setAssistente({ entregaId: en.id }) }] : []),
          { rotulo: 'Ver recebimento', principal: true, visivel: (en) => en.recebimentosIds.length > 0, aoClicar: (en) => nav(`/recebimentos/${en.recebimentosIds[en.recebimentosIds.length - 1]}`) },
        ]}
      />
      <RecebimentoAssistente
        aberto={!!assistente} cad={cad} entregaId={assistente?.entregaId} aoFechar={() => setAssistente(null)}
        aoReceber={(r) => {
          setAssistente(null);
          notificar('sucesso', `Recebimento registrado: ${r.fardosLidos.length} fardo(s) aguardando inspeção.`);
          totais.recarregar();
          setRec((x) => x + 1);
          nav(`/recebimentos/${r.id}`);
        }}
      />
    </>
  );
}
