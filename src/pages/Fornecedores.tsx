import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, BadgeDe } from '../components/Badge';
import { ConfirmarInativacao, type AlvoInativacao } from '../components/ConfirmarInativacao';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_CADASTRO_OPCOES, SIM_NAO_OPCOES } from '../dominio/opcoes';
import { DIAS_AVISO_CTF, diasEntre } from '../dominio/parametros';
import { SITUACAO_CADASTRO } from '../dominio/rotulos';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { DadosFornecedor } from '../services/contracts';
import type { Fornecedor } from '../types/models';
import { cnpjFormatado, data, hojeSP } from '../utils/format';

const paraFornecedor = (v: Record<string, string>): DadosFornecedor => ({
  razaoSocial: v.razaoSocial, cnpj: v.cnpj, cidadeUf: v.cidadeUf, ctfIbama: v.ctfIbama, ctfValidade: v.ctfValidade,
  especiesIds: v.especiesIds.split(',').filter(Boolean),
});

const validar = (v: Record<string, string>): Record<string, string> => ({
  ...(v.cnpj.trim() && v.cnpj.replace(/\D/g, '').length !== 14 ? { cnpj: 'O CNPJ tem 14 dígitos.' } : {}),
  ...(!v.especiesIds ? { especiesIds: 'Escolha ao menos uma espécie.' } : {}),
});

/** CTF: vencido (bloqueia o fornecedor) ou vencendo em até `DIAS_AVISO_CTF` dias, sempre com o texto além da cor. */
export function SituacaoCtf({ f }: { f: Fornecedor }) {
  if (f.bloqueado) return <Badge tom="vermelho">CTF vencido · bloqueado</Badge>;
  const dias = diasEntre(hojeSP(), f.ctfValidade);
  return dias <= DIAS_AVISO_CTF ? <Badge tom="laranja">CTF vence em {dias} {dias === 1 ? 'dia' : 'dias'}</Badge> : <>{data(f.ctfValidade)}</>;
}

/** Aba Fornecedores de Cadastros: o CTF vencido bloqueia o fornecedor automaticamente para novas atas e contratos. */
export default function Fornecedores({ aoAlterar }: { aoAlterar: () => void }) {
  const { pode } = useAuth();
  const notificar = useToast();
  const cad = useCadastros();
  const [form, setForm] = useState<{ fornecedor?: Fornecedor } | null>(null);
  const [inativar, setInativar] = useState<AlvoInativacao | null>(null);
  const [rec, setRec] = useState(0);
  const alterou = () => { setRec((x) => x + 1); aoAlterar(); };
  const edita = pode('cadastros:editar');

  const campos: Campo[] = [
    { nome: 'razaoSocial', rotulo: 'Razão social', obrigatorio: true, maxLength: 120 },
    { nome: 'cnpj', rotulo: 'CNPJ', obrigatorio: true, maxLength: 18, ajuda: 'só números ou 00.000.000/0000-00; liga a NF-e ao fornecedor' },
    { nome: 'cidadeUf', rotulo: 'Cidade/UF', obrigatorio: true, maxLength: 60, ajuda: 'ex.: Belém/PA' },
    { nome: 'ctfIbama', rotulo: 'CTF Ibama', obrigatorio: true, maxLength: 20 },
    { nome: 'ctfValidade', rotulo: 'Validade do CTF', tipo: 'date', obrigatorio: true, ajuda: 'vencido, o fornecedor fica bloqueado para novas atas e contratos' },
    { nome: 'especiesIds', rotulo: 'Espécies que fornece', tipo: 'multipla', obrigatorio: true, opcoes: (cad.listas?.especies ?? []).filter((e) => e.ativo).map((e) => ({ valor: e.id, rotulo: `${e.nomePopular} (${e.nomeCientifico})` })) },
  ];

  const colunas: Coluna<Fornecedor>[] = [
    { chave: 'razaoSocial', titulo: 'Razão social', ordenavel: true, render: (f) => <Link to={`/fornecedores/${f.id}`}>{f.razaoSocial}</Link> },
    { chave: 'cnpj', titulo: 'CNPJ', render: (f) => <span className="mono">{cnpjFormatado(f.cnpj)}</span> },
    { chave: 'cidadeUf', titulo: 'Cidade/UF', ordenavel: true, opcional: true },
    { chave: 'ctfValidade', titulo: 'CTF Ibama', ordenavel: true, render: (f) => <SituacaoCtf f={f} /> },
    { chave: 'especiesIds', titulo: 'Espécies', quebrar: true, opcional: true, render: (f) => f.especiesIds.map(cad.nomeEspecie).join(', ') },
    { chave: 'situacao', titulo: 'Situação', render: (f) => <BadgeDe mapa={SITUACAO_CADASTRO} valor={f.situacao} /> },
  ];

  return (
    <>
      <ListPage<Fornecedor>
        secao titulo="Fornecedores" descricao="Empresas contratadas. O CTF vencido bloqueia o fornecedor para novas atas e contratos."
        acoes={edita && <button className="btn btn-pri" onClick={() => setForm({})}>Novo fornecedor</button>}
        listar={(q) => servicos.fornecedores.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'situacao', rotulo: 'Situação', opcoes: SITUACAO_CADASTRO_OPCOES }, { chave: 'bloqueado', rotulo: 'Bloqueado (CTF)', opcoes: SIM_NAO_OPCOES }]}
        acoesLinha={edita ? [
          { rotulo: 'Editar', aoClicar: (f) => setForm({ fornecedor: f }) },
          { rotulo: 'Inativar', visivel: (f) => f.situacao === 'ativo', aoClicar: (f) => setInativar({ nome: f.razaoSocial, efeito: 'O fornecedor não entra em novas atas; os contratos e as NFs já cadastrados continuam com ele.', inativar: () => servicos.fornecedores.inativar(f.id) }) },
        ] : undefined}
      />
      <FormModal
        titulo={form?.fornecedor ? `Editar ${form.fornecedor.razaoSocial}` : 'Novo fornecedor'} aberto={!!form} aoFechar={() => setForm(null)}
        campos={campos} validar={validar} rotuloEnviar={form?.fornecedor ? 'Salvar' : 'Cadastrar'}
        iniciais={form?.fornecedor ? {
          razaoSocial: form.fornecedor.razaoSocial, cnpj: cnpjFormatado(form.fornecedor.cnpj), cidadeUf: form.fornecedor.cidadeUf,
          ctfIbama: form.fornecedor.ctfIbama, ctfValidade: form.fornecedor.ctfValidade, especiesIds: form.fornecedor.especiesIds.join(','),
        } : undefined}
        aoEnviar={async (v) => {
          if (form?.fornecedor) await servicos.fornecedores.atualizar(form.fornecedor.id, paraFornecedor(v));
          else await servicos.fornecedores.criar(paraFornecedor(v));
          notificar('sucesso', form?.fornecedor ? 'Fornecedor atualizado.' : `Fornecedor ${v.razaoSocial} cadastrado.`);
          alterou();
        }}
      />
      <ConfirmarInativacao alvo={inativar} aoFechar={() => setInativar(null)} aoConcluir={alterou} />
    </>
  );
}
