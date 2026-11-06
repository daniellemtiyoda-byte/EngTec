import { useState } from 'react';
import { BadgeDe } from '../components/Badge';
import { ConfirmarInativacao, type AlvoInativacao } from '../components/ConfirmarInativacao';
import { FormLinha } from '../components/FormLinha';
import { FormModal, type Campo } from '../components/FormModal';
import { IdCodigo } from '../components/IdCodigo';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { idLocal } from '../dominio/identificacao';
import { TIPO_LOCAL_OPCOES } from '../dominio/opcoes';
import { SITUACAO_CADASTRO, TIPO_LOCAL } from '../dominio/rotulos';
import { servicos } from '../services';
import type { DadosLocal } from '../services/contracts';
import type { Local } from '../types/models';
import { numero, paraNumero } from '../utils/format';

const CAMPOS_INCLUSAO: Campo[] = [
  { nome: 'codigo', rotulo: 'Código', obrigatorio: true, maxLength: 12, ajuda: 'ex.: A-03' },
  { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, maxLength: 80 },
  { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: TIPO_LOCAL_OPCOES },
  { nome: 'capacidade', rotulo: 'Capacidade (dormentes)', tipo: 'number', inteiro: true, obrigatorio: true, min: 1 },
];
/** O código não muda depois de criado: ele está impresso no QR do local. */
const CAMPOS_EDICAO = CAMPOS_INCLUSAO.filter((c) => c.nome !== 'codigo');

/** Aba Locais de Cadastros: endereços do armazém, cada um com o seu QR (LOC-código). O mapa fica em Estoque › Locais. */
export default function LocaisCadastro({ aoAlterar }: { aoAlterar: () => void }) {
  const { pode } = useAuth();
  const notificar = useToast();
  const [editar, setEditar] = useState<Local | null>(null);
  const [inativar, setInativar] = useState<AlvoInativacao | null>(null);
  const [rec, setRec] = useState(0);
  const alterou = () => { setRec((x) => x + 1); aoAlterar(); };
  const edita = pode('cadastros:editar');

  const colunas: Coluna<Local>[] = [
    { chave: 'codigo', titulo: 'Código', ordenavel: true, render: (l) => <span className="mono">{l.codigo}</span> },
    { chave: 'descricao', titulo: 'Descrição', ordenavel: true, quebrar: true },
    { chave: 'tipo', titulo: 'Tipo', render: (l) => <BadgeDe mapa={TIPO_LOCAL} valor={l.tipo} /> },
    { chave: 'ocupacao', titulo: 'Ocupação', alinhar: 'right', ordenavel: true, render: (l) => `${numero(l.ocupacao)} de ${numero(l.capacidade)}` },
    { chave: 'fardos', titulo: 'Fardos', alinhar: 'right', ordenavel: true },
    { chave: 'id', titulo: 'ID do QR', opcional: true, render: (l) => <IdCodigo id={idLocal(l.codigo)} /> },
    { chave: 'ativo', titulo: 'Situação', render: (l) => <BadgeDe mapa={SITUACAO_CADASTRO} valor={l.ativo ? 'ativo' : 'inativo'} /> },
  ];

  return (
    <>
      <ListPage<Local>
        secao titulo="Locais" descricao="Endereços do armazém. O código vai no QR do local (LOC-código) e não muda depois de criado."
        inclusao={edita && (
          <FormLinha
            campos={CAMPOS_INCLUSAO} rotuloEnviar="Adicionar local" iniciais={{ tipo: 'armazenagem' }}
            legenda="Armazenagem: fardos guardados · Inspeção: espera após o recebimento · Segregação: reprovados · Expedição: saída para a obra."
            aoEnviar={async (v) => {
              const l = await servicos.locais.criar({ codigo: v.codigo, descricao: v.descricao, tipo: v.tipo as DadosLocal['tipo'], capacidade: paraNumero(v.capacidade, true) });
              notificar('sucesso', `Local ${l.codigo} cadastrado (QR ${idLocal(l.codigo)}).`);
              alterou();
            }}
          />
        )}
        listar={(q) => servicos.locais.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'tipo', rotulo: 'Tipo', opcoes: TIPO_LOCAL_OPCOES }]}
        acoesLinha={edita ? [
          { rotulo: 'Editar', aoClicar: setEditar },
          { rotulo: 'Inativar', visivel: (l) => l.ativo, aoClicar: (l) => setInativar({ nome: `o local ${l.codigo}`, efeito: 'Ele deixa de receber fardos. Local com dormentes não pode ser inativado.', executar: () => servicos.locais.inativar(l.id) }) },
          { rotulo: 'Reativar', visivel: (l) => !l.ativo, aoClicar: (l) => setInativar({ nome: `o local ${l.codigo}`, acao: 'reativar', efeito: 'Ele volta a receber fardos, com o mesmo código e o mesmo QR.', executar: () => servicos.locais.reativar(l.id) }) },
        ] : undefined}
      />
      <FormModal
        titulo={editar ? `Editar local ${editar.codigo}` : 'Editar local'} aberto={!!editar} aoFechar={() => setEditar(null)} campos={CAMPOS_EDICAO}
        iniciais={editar ? { descricao: editar.descricao, tipo: editar.tipo, capacidade: String(editar.capacidade) } : undefined}
        aoEnviar={async (v) => {
          await servicos.locais.atualizar(editar!.id, { descricao: v.descricao, tipo: v.tipo as DadosLocal['tipo'], capacidade: paraNumero(v.capacidade, true) });
          notificar('sucesso', 'Local atualizado.');
          alterou();
        }}
      />
      <ConfirmarInativacao alvo={inativar} aoFechar={() => setInativar(null)} aoConcluir={alterou} />
    </>
  );
}
