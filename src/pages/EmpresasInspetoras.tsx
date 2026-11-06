import { useState } from 'react';
import { BadgeDe } from '../components/Badge';
import { ConfirmarInativacao, type AlvoInativacao } from '../components/ConfirmarInativacao';
import { FormLinha } from '../components/FormLinha';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SIM_NAO_OPCOES } from '../dominio/opcoes';
import { SITUACAO_CADASTRO } from '../dominio/rotulos';
import { servicos } from '../services';
import type { DadosEmpresaInspetora } from '../services/contracts';
import type { EmpresaInspetora } from '../types/models';
import { cnpjFormatado } from '../utils/format';

const CAMPOS: Campo[] = [
  { nome: 'nome', rotulo: 'Nome', obrigatorio: true, maxLength: 80, ajuda: 'ex.: UFV' },
  { nome: 'cnpj', rotulo: 'CNPJ', maxLength: 18, ajuda: 'opcional' },
];

const validar = (v: Record<string, string>): Record<string, string> =>
  v.cnpj.trim() && v.cnpj.replace(/\D/g, '').length !== 14 ? { cnpj: 'O CNPJ tem 14 dígitos (ou deixe em branco).' } : {};
const paraEmpresa = (v: Record<string, string>): DadosEmpresaInspetora => ({ nome: v.nome, cnpj: v.cnpj || undefined });

/** Aba Empresas inspetoras de Cadastros: escolhidas em cada contrato; o Painel mostra a taxa de reprovação por empresa. */
export default function EmpresasInspetoras({ aoAlterar }: { aoAlterar: () => void }) {
  const { pode } = useAuth();
  const notificar = useToast();
  const [editar, setEditar] = useState<EmpresaInspetora | null>(null);
  const [alvo, setAlvo] = useState<AlvoInativacao | null>(null);
  const [rec, setRec] = useState(0);
  const alterou = () => { setRec((x) => x + 1); aoAlterar(); };
  const edita = pode('cadastros:editar');

  const colunas: Coluna<EmpresaInspetora>[] = [
    { chave: 'nome', titulo: 'Nome', ordenavel: true },
    { chave: 'cnpj', titulo: 'CNPJ', render: (x) => (x.cnpj ? <span className="mono">{cnpjFormatado(x.cnpj)}</span> : '—') },
    { chave: 'ativo', titulo: 'Situação', render: (x) => <BadgeDe mapa={SITUACAO_CADASTRO} valor={x.ativo ? 'ativo' : 'inativo'} /> },
  ];

  return (
    <>
      <ListPage<EmpresaInspetora>
        secao titulo="Empresas inspetoras" descricao="Contratadas pelo fornecedor para inspecionar o material antes da entrega. Cada contrato indica a sua."
        inclusao={edita && (
          <FormLinha
            campos={CAMPOS} rotuloEnviar="Adicionar empresa" validar={validar}
            aoEnviar={async (v) => { const x = await servicos.empresasInspetoras.criar(paraEmpresa(v)); notificar('sucesso', `Empresa ${x.nome} cadastrada.`); alterou(); }}
          />
        )}
        listar={(q) => servicos.empresasInspetoras.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'ativo', rotulo: 'Ativa', opcoes: SIM_NAO_OPCOES }]}
        acoesLinha={edita ? [
          { rotulo: 'Editar', aoClicar: setEditar },
          { rotulo: 'Inativar', visivel: (x) => x.ativo, aoClicar: (x) => setAlvo({ nome: x.nome, efeito: 'A empresa não pode ser escolhida em novos contratos; os contratos atuais continuam com ela.', executar: () => servicos.empresasInspetoras.inativar(x.id) }) },
          { rotulo: 'Reativar', visivel: (x) => !x.ativo, aoClicar: (x) => setAlvo({ nome: x.nome, acao: 'reativar', efeito: 'A empresa volta a poder ser escolhida nos contratos.', executar: () => servicos.empresasInspetoras.reativar(x.id) }) },
        ] : undefined}
      />
      <FormModal
        titulo={editar ? `Editar ${editar.nome}` : 'Editar empresa inspetora'} aberto={!!editar} aoFechar={() => setEditar(null)} campos={CAMPOS} validar={validar}
        iniciais={editar ? { nome: editar.nome, cnpj: editar.cnpj ? cnpjFormatado(editar.cnpj) : '' } : undefined}
        aoEnviar={async (v) => { await servicos.empresasInspetoras.atualizar(editar!.id, paraEmpresa(v)); notificar('sucesso', 'Empresa inspetora atualizada.'); alterou(); }}
      />
      <ConfirmarInativacao alvo={alvo} aoFechar={() => setAlvo(null)} aoConcluir={alterou} />
    </>
  );
}
