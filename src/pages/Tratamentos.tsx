import { useState } from 'react';
import { BadgeDe } from '../components/Badge';
import { ConfirmarInativacao, type AlvoInativacao } from '../components/ConfirmarInativacao';
import { FormLinha } from '../components/FormLinha';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_CADASTRO } from '../dominio/rotulos';
import { servicos } from '../services';
import type { DadosTratamento } from '../services/contracts';
import type { Tratamento } from '../types/models';

const CAMPOS: Campo[] = [
  { nome: 'preservativo', rotulo: 'Preservativo', obrigatorio: true, maxLength: 40, ajuda: 'ex.: CCA' },
  { nome: 'empresa', rotulo: 'Empresa de tratamento', obrigatorio: true, maxLength: 80 },
];

const paraTratamento = (v: Record<string, string>): DadosTratamento => ({ preservativo: v.preservativo, empresa: v.empresa });

/** Aba Tratamentos de Cadastros: preservativo e empresa, escolhidos em cada item do contrato. */
export default function Tratamentos({ aoAlterar }: { aoAlterar: () => void }) {
  const { pode } = useAuth();
  const notificar = useToast();
  const [editar, setEditar] = useState<Tratamento | null>(null);
  const [inativar, setInativar] = useState<AlvoInativacao | null>(null);
  const [rec, setRec] = useState(0);
  const alterou = () => { setRec((x) => x + 1); aoAlterar(); };
  const edita = pode('cadastros:editar');

  const colunas: Coluna<Tratamento>[] = [
    { chave: 'preservativo', titulo: 'Preservativo', ordenavel: true },
    { chave: 'empresa', titulo: 'Empresa de tratamento', ordenavel: true },
    { chave: 'ativo', titulo: 'Situação', render: (t) => <BadgeDe mapa={SITUACAO_CADASTRO} valor={t.ativo ? 'ativo' : 'inativo'} /> },
  ];

  return (
    <>
      <ListPage<Tratamento>
        secao titulo="Tratamentos" descricao="Preservativo aplicado e empresa que fez o tratamento (ex.: CCA / Granoski)."
        inclusao={edita && (
          <FormLinha
            campos={CAMPOS} rotuloEnviar="Adicionar tratamento"
            aoEnviar={async (v) => { const t = await servicos.tratamentos.criar(paraTratamento(v)); notificar('sucesso', `Tratamento ${t.preservativo} / ${t.empresa} cadastrado.`); alterou(); }}
          />
        )}
        listar={(q) => servicos.tratamentos.listar(q)}
        recarregar={rec}
        colunas={colunas}
        acoesLinha={edita ? [
          { rotulo: 'Editar', aoClicar: setEditar },
          { rotulo: 'Inativar', visivel: (t) => t.ativo, aoClicar: (t) => setInativar({ nome: `${t.preservativo} / ${t.empresa}`, efeito: 'O tratamento não entra em novos contratos.', executar: () => servicos.tratamentos.inativar(t.id) }) },
          { rotulo: 'Reativar', visivel: (t) => !t.ativo, aoClicar: (t) => setInativar({ nome: `${t.preservativo} / ${t.empresa}`, acao: 'reativar', efeito: 'O tratamento volta a poder entrar em contratos.', executar: () => servicos.tratamentos.reativar(t.id) }) },
        ] : undefined}
      />
      <FormModal
        titulo="Editar tratamento" aberto={!!editar} aoFechar={() => setEditar(null)} campos={CAMPOS}
        iniciais={editar ? { preservativo: editar.preservativo, empresa: editar.empresa } : undefined}
        aoEnviar={async (v) => { await servicos.tratamentos.atualizar(editar!.id, paraTratamento(v)); notificar('sucesso', 'Tratamento atualizado.'); alterou(); }}
      />
      <ConfirmarInativacao alvo={inativar} aoFechar={() => setInativar(null)} aoConcluir={alterou} />
    </>
  );
}
