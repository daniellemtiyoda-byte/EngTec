import { useState } from 'react';
import { BadgeDe } from '../components/Badge';
import { Aviso } from '../components/Estados';
import { FormModal } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { CLASSE_OPCOES, USO_OPCOES } from '../dominio/opcoes';
import { USO_ESPECIE } from '../dominio/rotulos';
import { servicos } from '../services';
import type { Especie, UsoEspecie } from '../types/models';
import { rotuloClasse } from '../utils/format';

export default function Especies() {
  const { pode } = useAuth();
  const notificar = useToast();
  const [editar, setEditar] = useState<Especie | null>(null);
  const [rec, setRec] = useState(0);

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
        titulo="Espécies"
        descricao="Lista de espécies da RME, identificadas pelo nome científico. A classe de cada dormente é a classe da sua espécie."
        aviso={<Aviso>A espécie de cada lote é a <strong>declarada em documento</strong>. O sistema não identifica espécie por imagem. Classes "a definir" aguardam confirmação da CPTM.</Aviso>}
        listar={(q) => servicos.especies.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'classe', rotulo: 'Classe', opcoes: CLASSE_OPCOES }, { chave: 'uso', rotulo: 'Uso', opcoes: USO_OPCOES }]}
        acoesLinha={pode('cadastros:editar') ? [{ rotulo: 'Editar classe e uso', aoClicar: setEditar }] : undefined}
      />
      <FormModal
        titulo={editar ? `Editar ${editar.nomeCientifico}` : 'Editar espécie'} aberto={!!editar} aoFechar={() => setEditar(null)}
        iniciais={editar ? { classe: editar.classe ?? '', uso: editar.uso } : undefined}
        campos={[
          { nome: 'classe', rotulo: 'Classe', tipo: 'select', opcoes: CLASSE_OPCOES, ajuda: 'Deixe sem seleção para manter a classe "a definir". Vale para todos os lotes desta espécie.' },
          { nome: 'uso', rotulo: 'Uso', tipo: 'select', obrigatorio: true, opcoes: USO_OPCOES },
        ]}
        aoEnviar={async (v) => {
          await servicos.especies.atualizar(editar!.id, { classe: v.classe || null, uso: v.uso as UsoEspecie });
          notificar('sucesso', `Espécie atualizada${SUFIXO_SIMULADO}.`);
          setRec((x) => x + 1);
        }}
      />
    </>
  );
}
