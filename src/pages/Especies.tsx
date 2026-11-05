import { useState } from 'react';
import { BadgeDe } from '../components/Badge';
import { Aviso } from '../components/Estados';
import { FormLinha } from '../components/FormLinha';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { CLASSE_OPCOES, USO_OPCOES } from '../dominio/opcoes';
import { USO_ESPECIE } from '../dominio/rotulos';
import { servicos } from '../services';
import type { Especie, UsoEspecie } from '../types/models';
import { rotuloClasse } from '../utils/format';

const CAMPOS_EDICAO: Campo[] = [
  { nome: 'classe', rotulo: 'Classe', tipo: 'select', opcoes: CLASSE_OPCOES, ajuda: 'Deixe sem seleção para manter a classe "a definir". Vale para todos os lotes desta espécie.' },
  { nome: 'uso', rotulo: 'Uso', tipo: 'select', obrigatorio: true, opcoes: USO_OPCOES },
  { nome: 'observacao', rotulo: 'Observação', maxLength: 120, ajuda: 'Ex.: nome popular.' },
];
const CAMPOS_INCLUSAO: Campo[] = [
  { nome: 'nomeCientifico', rotulo: 'Nome científico', obrigatorio: true, maxLength: 120 },
  { nome: 'observacao', rotulo: 'Observação (opcional)', maxLength: 120 },
  { nome: 'classe', rotulo: 'Classe', tipo: 'select', opcoes: CLASSE_OPCOES },
  { nome: 'uso', rotulo: 'Uso', tipo: 'select', obrigatorio: true, opcoes: USO_OPCOES },
];

/** Aba Espécies da tela Cadastros. */
export default function Especies({ aoAlterar }: { aoAlterar?: () => void }) {
  const { pode } = useAuth();
  const notificar = useToast();
  const [editar, setEditar] = useState<Especie | null>(null);
  const [rec, setRec] = useState(0);
  const alterou = () => { setRec((x) => x + 1); aoAlterar?.(); };

  const colunas: Coluna<Especie>[] = [
    { chave: 'numero', titulo: 'Nº', alinhar: 'right', ordenavel: true },
    {
      chave: 'nomeCientifico', titulo: 'Espécie', ordenavel: true,
      render: (e) => <><em>{e.nomeCientifico}</em>{e.observacao && <span className="mudo"> ({e.observacao})</span>}</>,
    },
    { chave: 'classe', titulo: 'Classe', ordenavel: true, render: (e) => rotuloClasse(e.classe) },
    { chave: 'uso', titulo: 'Uso', render: (e) => <BadgeDe mapa={USO_ESPECIE} valor={e.uso} /> },
    { chave: 'lotesAtivos', titulo: 'Lotes ativos', alinhar: 'right', ordenavel: true },
  ];

  return (
    <>
      <ListPage<Especie>
        secao titulo="Espécies"
        inclusao={pode('cadastros:editar') && (
          <FormLinha
            campos={CAMPOS_INCLUSAO} rotuloEnviar="Adicionar espécie" iniciais={{ uso: 'via' }}
            legenda={<>Identifique pelo <strong>nome científico</strong>, como na lista da RME: ele não muda depois do cadastro. O número na lista é dado pelo sistema. · Via corrida: dormente comum · AMV: aparelho de mudança de via.</>}
            aoEnviar={async (v) => {
              const e = await servicos.especies.cadastrar({ nomeCientifico: v.nomeCientifico, observacao: v.observacao || undefined, classe: v.classe || null, uso: v.uso as UsoEspecie });
              notificar('sucesso', `Espécie nº ${e.numero} cadastrada${SUFIXO_SIMULADO}.`);
              alterou();
            }}
          />
        )}
        aviso={<Aviso>A espécie de cada lote é a <strong>declarada em documento</strong>. O sistema não identifica espécie por imagem. Classes "a definir" aguardam confirmação da CPTM.</Aviso>}
        listar={(q) => servicos.especies.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'classe', rotulo: 'Classe', opcoes: CLASSE_OPCOES }, { chave: 'uso', rotulo: 'Uso', opcoes: USO_OPCOES }]}
        acoesLinha={pode('cadastros:editar') ? [{ rotulo: 'Editar', aoClicar: setEditar }] : undefined}
      />
      <FormModal
        titulo={editar ? `Editar ${editar.nomeCientifico}` : 'Editar espécie'} aberto={!!editar} aoFechar={() => setEditar(null)}
        iniciais={editar ? { classe: editar.classe ?? '', uso: editar.uso, observacao: editar.observacao ?? '' } : undefined}
        campos={CAMPOS_EDICAO}
        aoEnviar={async (v) => {
          await servicos.especies.atualizar(editar!.id, { classe: v.classe || null, uso: v.uso as UsoEspecie, observacao: v.observacao });
          notificar('sucesso', `Espécie atualizada${SUFIXO_SIMULADO}.`);
          alterou();
        }}
      />
    </>
  );
}
