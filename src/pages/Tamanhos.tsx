import { useState } from 'react';
import { BadgeDe } from '../components/Badge';
import { ConfirmarInativacao, type AlvoInativacao } from '../components/ConfirmarInativacao';
import { FormLinha } from '../components/FormLinha';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_MEDIDAS_OPCOES } from '../dominio/opcoes';
import { volumeM3 } from '../dominio/parametros';
import { SITUACAO_CADASTRO, SITUACAO_MEDIDAS } from '../dominio/rotulos';
import { servicos } from '../services';
import type { DadosTamanho } from '../services/contracts';
import type { Tamanho } from '../types/models';
import { cm, m3, paraNumero } from '../utils/format';

const CAMPOS: Campo[] = [
  { nome: 'codigo', rotulo: 'Código', obrigatorio: true, maxLength: 20, ajuda: 'ex.: T280' },
  { nome: 'comprimentoCm', rotulo: 'Comprimento (cm)', tipo: 'number', obrigatorio: true, min: 1 },
  { nome: 'larguraCm', rotulo: 'Largura (cm)', tipo: 'number', obrigatorio: true, min: 1 },
  { nome: 'alturaCm', rotulo: 'Altura (cm)', tipo: 'number', obrigatorio: true, min: 1 },
  { nome: 'medidas', rotulo: 'Medidas', tipo: 'select', obrigatorio: true, opcoes: SITUACAO_MEDIDAS_OPCOES },
];

const paraTamanho = (v: Record<string, string>): DadosTamanho => ({
  codigo: v.codigo, comprimentoCm: paraNumero(v.comprimentoCm), larguraCm: paraNumero(v.larguraCm), alturaCm: paraNumero(v.alturaCm),
  medidas: v.medidas as DadosTamanho['medidas'],
});

/** Prévia do volume enquanto a pessoa digita; o volume gravado é sempre o calculado pelo serviço. */
function previaVolume(v: Record<string, string>): string | undefined {
  const [c, l, a] = [v.comprimentoCm, v.larguraCm, v.alturaCm].map((x) => paraNumero(x ?? ''));
  return [c, l, a].every((x) => x > 0) ? m3(volumeM3(c, l, a)) : undefined;
}

/** Aba Tamanhos de Cadastros: medidas em cm e volume sempre calculado. */
export default function Tamanhos({ aoAlterar }: { aoAlterar: () => void }) {
  const { pode } = useAuth();
  const notificar = useToast();
  const [editar, setEditar] = useState<Tamanho | null>(null);
  const [inativar, setInativar] = useState<AlvoInativacao | null>(null);
  const [rec, setRec] = useState(0);
  const alterou = () => { setRec((x) => x + 1); aoAlterar(); };
  const edita = pode('cadastros:editar');

  const colunas: Coluna<Tamanho>[] = [
    { chave: 'codigo', titulo: 'Código', ordenavel: true, render: (t) => <span className="mono">{t.codigo}</span> },
    { chave: 'comprimentoCm', titulo: 'Comprimento', alinhar: 'right', ordenavel: true, render: (t) => cm(t.comprimentoCm) },
    { chave: 'larguraCm', titulo: 'Largura', alinhar: 'right', render: (t) => cm(t.larguraCm) },
    { chave: 'alturaCm', titulo: 'Altura', alinhar: 'right', render: (t) => cm(t.alturaCm) },
    { chave: 'volumeM3', titulo: 'Volume', alinhar: 'right', ordenavel: true, render: (t) => m3(t.volumeM3) },
    { chave: 'medidas', titulo: 'Medidas', render: (t) => <BadgeDe mapa={SITUACAO_MEDIDAS} valor={t.medidas} /> },
    { chave: 'ativo', titulo: 'Situação', render: (t) => <BadgeDe mapa={SITUACAO_CADASTRO} valor={t.ativo ? 'ativo' : 'inativo'} /> },
  ];

  return (
    <>
      <ListPage<Tamanho>
        secao titulo="Tamanhos" descricao="Medidas do dormente. Provisório até a CPTM confirmar; o volume em m³ é calculado pelo sistema."
        inclusao={edita && (
          <FormLinha
            campos={CAMPOS} rotuloEnviar="Adicionar tamanho" iniciais={{ medidas: 'provisorio' }}
            legenda="O volume (comprimento × largura × altura) é calculado pelo sistema e usado na conversão de m³ dos contratos e na conferência da DOF."
            aoEnviar={async (v) => { const t = await servicos.tamanhos.criar(paraTamanho(v)); notificar('sucesso', `Tamanho ${t.codigo} cadastrado (${m3(t.volumeM3)}).`); alterou(); }}
          />
        )}
        listar={(q) => servicos.tamanhos.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'medidas', rotulo: 'Medidas', opcoes: SITUACAO_MEDIDAS_OPCOES }]}
        acoesLinha={edita ? [
          { rotulo: 'Editar', aoClicar: setEditar },
          { rotulo: 'Inativar', visivel: (t) => t.ativo, aoClicar: (t) => setInativar({ nome: `o tamanho ${t.codigo}`, efeito: 'Ele não entra em novos contratos.', executar: () => servicos.tamanhos.inativar(t.id) }) },
          { rotulo: 'Reativar', visivel: (t) => !t.ativo, aoClicar: (t) => setInativar({ nome: `o tamanho ${t.codigo}`, acao: 'reativar', efeito: 'Ele volta a poder entrar em contratos.', executar: () => servicos.tamanhos.reativar(t.id) }) },
        ] : undefined}
      />
      <FormModal
        titulo={editar ? `Editar ${editar.codigo}` : 'Editar tamanho'} aberto={!!editar} aoFechar={() => setEditar(null)} campos={CAMPOS}
        iniciais={editar ? { codigo: editar.codigo, comprimentoCm: String(editar.comprimentoCm), larguraCm: String(editar.larguraCm), alturaCm: String(editar.alturaCm), medidas: editar.medidas } : undefined}
        confirmacao={(v) => (editar && previaVolume(v) && paraNumero(v.comprimentoCm) * paraNumero(v.larguraCm) * paraNumero(v.alturaCm) !== editar.comprimentoCm * editar.larguraCm * editar.alturaCm
          ? `O volume de ${editar.codigo} passa a ${previaVolume(v)}. Isso muda a conversão de m³ e a conferência das próximas DOFs.` : undefined)}
        aoEnviar={async (v) => { await servicos.tamanhos.atualizar(editar!.id, paraTamanho(v)); notificar('sucesso', 'Tamanho atualizado.'); alterou(); }}
      />
      <ConfirmarInativacao alvo={inativar} aoFechar={() => setInativar(null)} aoConcluir={alterou} />
    </>
  );
}
