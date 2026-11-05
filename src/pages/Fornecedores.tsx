import { useState } from 'react';
import { StatusRegistroBadge } from '../components/Badge';
import { FormLinha } from '../components/FormLinha';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { STATUS_OPCOES } from '../dominio/opcoes';
import { servicos } from '../services';
import type { Fornecedor, NovoFornecedor, StatusRegistro } from '../types/models';

const CAMPOS: Campo[] = [
  { nome: 'razaoSocial', rotulo: 'Razão social', obrigatorio: true, maxLength: 120 },
  { nome: 'cnpj', rotulo: 'CNPJ', obrigatorio: true, maxLength: 18, ajuda: 'só números ou 00.000.000/0000-00' },
  { nome: 'cidadeUf', rotulo: 'Cidade/UF', obrigatorio: true, maxLength: 60, ajuda: 'ex.: Campinas/SP' },
  { nome: 'status', rotulo: 'Situação', tipo: 'select', obrigatorio: true, opcoes: STATUS_OPCOES },
];

const validar = (v: Record<string, string>): Record<string, string> =>
  v.cnpj.trim() && v.cnpj.replace(/\D/g, '').length !== 14 ? { cnpj: 'O CNPJ tem 14 dígitos.' } : {};

const paraFornecedor = (v: Record<string, string>): NovoFornecedor => ({
  razaoSocial: v.razaoSocial, cnpj: v.cnpj, cidadeUf: v.cidadeUf, status: v.status as StatusRegistro,
});

/** Aba Fornecedores da tela Cadastros (os documentos dos fornecedores têm aba própria). */
export default function Fornecedores({ aoAlterar }: { aoAlterar?: () => void }) {
  const { pode } = useAuth();
  const notificar = useToast();
  const [editar, setEditar] = useState<Fornecedor | null>(null);
  const [rec, setRec] = useState(0);
  const alterou = () => { setRec((x) => x + 1); aoAlterar?.(); };

  const colunas: Coluna<Fornecedor>[] = [
    { chave: 'razaoSocial', titulo: 'Razão social', ordenavel: true },
    { chave: 'cnpj', titulo: 'CNPJ' },
    { chave: 'cidadeUf', titulo: 'Cidade/UF', ordenavel: true },
    { chave: 'documentosVigentes', titulo: 'Documentos vigentes', alinhar: 'right', ordenavel: true },
    { chave: 'status', titulo: 'Situação', render: (f) => <StatusRegistroBadge s={f.status} /> },
  ];

  return (
    <>
      <ListPage<Fornecedor>
        secao titulo="Fornecedores"
        inclusao={pode('cadastros:editar') && (
          <FormLinha
            campos={CAMPOS} rotuloEnviar="Adicionar fornecedor" iniciais={{ status: 'aprovado' }} validar={validar}
            legenda={<>O CNPJ liga a NF-e importada ao fornecedor, por isso não pode se repetir. · Aprovado: pode emitir NF para o almoxarifado · Pendente: documentação em análise · Bloqueado: inativo; o cadastro fica para o histórico das NFs.</>}
            aoEnviar={async (v) => {
              const f = await servicos.fornecedores.cadastrar(paraFornecedor(v));
              notificar('sucesso', `Fornecedor ${f.razaoSocial} cadastrado${SUFIXO_SIMULADO}.`);
              alterou();
            }}
          />
        )}
        listar={(q) => servicos.fornecedores.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'status', rotulo: 'Situação', opcoes: STATUS_OPCOES }]}
        acoesLinha={pode('cadastros:editar') ? [{ rotulo: 'Editar', aoClicar: setEditar }] : undefined}
      />
      <FormModal
        titulo={editar ? `Editar ${editar.razaoSocial}` : 'Editar fornecedor'} aberto={!!editar} aoFechar={() => setEditar(null)}
        campos={CAMPOS} validar={validar}
        iniciais={editar ? { razaoSocial: editar.razaoSocial, cnpj: editar.cnpj, cidadeUf: editar.cidadeUf, status: editar.status } : undefined}
        confirmacao={(v) => (v.status === 'bloqueado' && editar?.status !== 'bloqueado'
          ? `Bloquear ${editar?.razaoSocial}? O fornecedor fica inativo; as NFs já cadastradas continuam com ele.` : undefined)}
        aoEnviar={async (v) => {
          await servicos.fornecedores.atualizar(editar!.id, paraFornecedor(v));
          notificar('sucesso', `Fornecedor atualizado${SUFIXO_SIMULADO}.`);
          alterou();
        }}
      />
    </>
  );
}
