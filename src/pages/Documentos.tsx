import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { BadgeDe } from '../components/Badge';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { EntregaAssistente } from '../components/EntregaAssistente';
import { ListPage, type Coluna } from '../components/ListPage';
import { ConfirmModal } from '../components/Modal';
import { PrazoDof } from '../components/PrazoDof';
import { RecebimentoAssistente } from '../components/RecebimentoAssistente';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { NIVEL_PRAZO_OPCOES } from '../dominio/opcoes';
import { SITUACAO_ENTREGA } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { mensagemSegura } from '../services/erros';
import type { Dof, Entrega, NotaFiscal } from '../types/models';
import { data, dataHora, numero } from '../utils/format';
import { BotaoAnexo } from '../components/BotaoAnexo';

type AbaDoc = 'a_caminho' | 'dofs' | 'declarados' | 'nfs';
const ABAS: AbaDoc[] = ['a_caminho', 'dofs', 'declarados', 'nfs'];

const contar = () => Promise.all([
  servicos.documentos.listarEntregas({ pageSize: 1, filters: { etapa: 'a_caminho' } }),
  servicos.documentos.listarDofs({ pageSize: 1, filters: { situacaoDeclaracao: 'a_declarar' } }),
  servicos.documentos.listarDofs({ pageSize: 1, filters: { situacaoDeclaracao: 'declarado' } }),
  servicos.documentos.listarNfs({ pageSize: 1 }),
]).then((r) => r.map((x) => x.total));

/**
 * NF e DOF (seção 9.9 do plano), primeiro item do grupo Entrada: o cadastro de NF e DOF antes da chegada (cria a
 * entrega "A caminho"), o controle do prazo de declaração e a declaração no Sinaflor.
 */
export default function Documentos() {
  const { pode } = useAuth();
  const notificar = useToast();
  const nav = useNavigate();
  const cad = useCadastros();
  const [params] = useSearchParams();
  const [aba, setAba] = useAbaNoEndereco<AbaDoc>(ABAS);
  const totais = useAsync(contar, []);
  const contratos = useAsync(() => servicos.contratos.listar({ pageSize: 500 }), []);
  const [cadastrar, setCadastrar] = useState(false);
  const [receber, setReceber] = useState<string>();
  const [declarar, setDeclarar] = useState<Dof | null>(null);
  const [declarando, setDeclarando] = useState(false);
  const [rec, setRec] = useState(0);
  const alterou = () => { setRec((x) => x + 1); totais.recarregar(); };
  const numeroContrato = (id: string) => contratos.dados?.items.find((c) => c.id === id)?.numero ?? '—';

  // Busca vinda de fora (busca global: "NF 4507") sem aba: abre "Todas as NFs".
  useEffect(() => { if (params.get('q') && !params.get('aba')) setAba('nfs'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const abas: Aba<AbaDoc>[] = [
    { valor: 'a_caminho', rotulo: 'A caminho', total: totais.dados?.[0] },
    { valor: 'dofs', rotulo: 'DOFs a declarar', total: totais.dados?.[1] },
    { valor: 'declarados', rotulo: 'Declarados', total: totais.dados?.[2] },
    { valor: 'nfs', rotulo: 'Todas as NFs', total: totais.dados?.[3] },
  ];

  const colunasEntrega: Coluna<Entrega>[] = [
    { chave: 'nfNumero', titulo: 'NF', ordenavel: true, render: (en) => `NF ${en.nfNumero}` },
    { chave: 'fornecedorId', titulo: 'Fornecedor', quebrar: true, render: (en) => cad.nomeFornecedor(en.fornecedorId) },
    { chave: 'contratoId', titulo: 'Contrato', render: (en) => <span className="mono">{numeroContrato(en.contratoId)}</span> },
    { chave: 'fardosIds', titulo: 'Fardos', alinhar: 'right', render: (en) => (en.fardosRecebidos.length ? `${en.fardosRecebidos.length} de ${en.fardosIds.length} recebidos` : numero(en.fardosIds.length)) },
    { chave: 'dormentes', titulo: 'Dormentes', alinhar: 'right', render: (en) => numero(en.dormentes) },
    { chave: 'prazoDeclaracao', titulo: 'Prazo da DOF', ordenavel: true, render: (en) => <PrazoDof prazo={en.prazoDeclaracao} nivel={en.nivelPrazo} /> },
    { chave: 'situacao', titulo: 'Situação', render: (en) => <BadgeDe mapa={SITUACAO_ENTREGA} valor={en.situacao} /> },
  ];

  const colunasDof = (declarados: boolean): Coluna<Dof>[] => [
    { chave: 'numero', titulo: 'DOF', ordenavel: true, render: (d) => <span className="mono">{d.numero}</span> },
    { chave: 'nfNumero', titulo: 'NF', render: (d) => `NF ${d.nfNumero}` },
    { chave: 'fornecedorId', titulo: 'Fornecedor', quebrar: true, render: (d) => cad.nomeFornecedor(d.fornecedorId) },
    { chave: 'validade', titulo: 'Validade', ordenavel: true, render: (d) => data(d.validade) },
    { chave: 'prazoDeclaracao', titulo: 'Prazo de declaração', ordenavel: true, render: (d) => <PrazoDof prazo={d.prazoDeclaracao} nivel={d.nivelPrazo} declarado={!!d.declarado} /> },
    declarados
      ? { chave: 'declarado', titulo: 'Declarado em', render: (d) => (d.declarado ? `${dataHora(d.declarado.quando)} · ${d.declarado.quem}` : '—') }
      : { chave: 'podeDeclarar', titulo: 'Recebimento', render: (d) => (d.podeDeclarar ? 'Recebida' : 'A caminho') },
  ];

  const colunasNf: Coluna<NotaFiscal>[] = [
    { chave: 'numero', titulo: 'NF', ordenavel: true, render: (n) => `NF ${n.numero}` },
    { chave: 'serie', titulo: 'Série' },
    { chave: 'fornecedorId', titulo: 'Fornecedor', quebrar: true, render: (n) => cad.nomeFornecedor(n.fornecedorId) },
    { chave: 'contratoId', titulo: 'Contrato', render: (n) => <span className="mono">{numeroContrato(n.contratoId)}</span> },
    { chave: 'emissao', titulo: 'Emissão', ordenavel: true, render: (n) => data(n.emissao) },
    { chave: 'itens', titulo: 'Dormentes', alinhar: 'right', render: (n) => numero(n.itens.reduce((s, i) => s + i.quantidade, 0)) },
    { chave: 'chaveAcesso', titulo: 'Chave de acesso', opcional: true, render: (n) => <span className="mono">{n.chaveAcesso}</span> },
    { chave: 'xml', titulo: 'XML', opcional: true, render: (n) => n.xml ? <BotaoAnexo anexo={n.xml} /> : '—' },
  ];

  async function confirmarDeclaracao() {
    if (!declarar) return;
    setDeclarando(true);
    try {
      await servicos.documentos.declararDof(declarar.id);
      notificar('sucesso', `DOF ${declarar.numero} marcada como declarada no Sinaflor.`);
      alterou();
    } catch (e) { notificar('erro', mensagemSegura(e)); }
    finally { setDeclarando(false); setDeclarar(null); }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="NF e DOF" subtitulo="Cadastre a NF e a DOF antes da chegada: a entrega fica a caminho até o recebimento. Aqui também ficam o prazo e a declaração da DOF no Sinaflor."
        acoes={pode('nf:cadastrar') && <button className="btn btn-pri" onClick={() => setCadastrar(true)}>Cadastrar NF e DOF</button>}
      />
      <AbasSecao abas={abas} ativa={aba} aoEscolher={setAba} rotulo="NF e DOF">
        {aba === 'a_caminho' && (
          <ListPage<Entrega>
            key="a_caminho" titulo="Entregas a caminho" subnivel colunas={colunasEntrega} recarregar={rec}
            listar={(q) => servicos.documentos.listarEntregas({ ...q, filters: { ...q.filters, etapa: 'a_caminho' } })}
            acoesLinha={pode('recebimento:registrar') ? [{ rotulo: 'Receber', principal: true, aoClicar: (en) => setReceber(en.id) }] : undefined}
          />
        )}
        {aba === 'dofs' && (
          <ListPage<Dof>
            key="dofs" titulo="DOFs a declarar no Sinaflor" descricao="Prazo: dia seguinte ao fim da validade. Do prazo mais próximo ao mais distante." subnivel
            colunas={colunasDof(false)} recarregar={rec}
            filtros={[{ chave: 'nivelPrazo', rotulo: 'Nível', opcoes: NIVEL_PRAZO_OPCOES }]}
            listar={(q) => servicos.documentos.listarDofs({ ...q, filters: { ...q.filters, situacaoDeclaracao: 'a_declarar' } })}
            acoesLinha={pode('dof:declarar') ? [{ rotulo: 'Declarar', principal: true, visivel: (d) => d.podeDeclarar, aoClicar: setDeclarar }] : undefined}
          />
        )}
        {aba === 'declarados' && (
          <ListPage<Dof>
            key="declarados" titulo="DOFs declaradas" subnivel colunas={colunasDof(true)} recarregar={rec}
            listar={(q) => servicos.documentos.listarDofs({ ...q, filters: { ...q.filters, situacaoDeclaracao: 'declarado' } })}
          />
        )}
        {aba === 'nfs' && (
          <ListPage<NotaFiscal> key="nfs" titulo="Notas fiscais" subnivel colunas={colunasNf} recarregar={rec} listar={(q) => servicos.documentos.listarNfs(q)} />
        )}
      </AbasSecao>

      <EntregaAssistente
        aberto={cadastrar} cad={cad} aoFechar={() => setCadastrar(false)}
        aoCriar={(en) => { setCadastrar(false); notificar('sucesso', `NF ${en.nfNumero} e DOF cadastradas: a entrega está a caminho.`); alterou(); setAba('a_caminho'); }}
      />
      <RecebimentoAssistente
        aberto={!!receber} cad={cad} entregaId={receber} aoFechar={() => setReceber(undefined)}
        aoReceber={(r) => { setReceber(undefined); notificar('sucesso', `Recebimento registrado: ${r.fardosLidos.length} fardo(s) aguardando inspeção.`); nav(`/recebimentos/${r.id}`); }}
      />
      <ConfirmModal
        titulo="Declarar a DOF no Sinaflor" aberto={!!declarar} carregando={declarando} rotuloConfirmar="Marcar como declarada"
        mensagem={declarar ? `Confirma que a DOF ${declarar.numero} (NF ${declarar.nfNumero}) foi declarada no Sinaflor? Fica registrado quem marcou e quando.` : ''}
        aoCancelar={() => setDeclarar(null)} aoConfirmar={() => void confirmarDeclaracao()}
      />
    </>
  );
}
