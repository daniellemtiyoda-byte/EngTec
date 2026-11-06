import { useState } from 'react';
import { BadgeDe } from '../components/Badge';
import { ConfirmarInativacao, type AlvoInativacao } from '../components/ConfirmarInativacao';
import { FormLinha } from '../components/FormLinha';
import { FormModal, type Campo } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SIM_NAO_OPCOES } from '../dominio/opcoes';
import { rotuloClasse, SITUACAO_CADASTRO } from '../dominio/rotulos';
import { servicos } from '../services';
import type { DadosEspecie } from '../services/contracts';
import type { Especie } from '../types/models';

const CAMPOS: Campo[] = [
  { nome: 'nomeCientifico', rotulo: 'Nome científico', obrigatorio: true, maxLength: 80, ajuda: 'ex.: Dialium guianense' },
  { nome: 'nomePopular', rotulo: 'Nome popular', obrigatorio: true, maxLength: 60 },
  { nome: 'classe', rotulo: 'Classe', maxLength: 10, ajuda: 'ex.: 1ª' },
];

const paraEspecie = (v: Record<string, string>): DadosEspecie => ({ nomeCientifico: v.nomeCientifico, nomePopular: v.nomePopular, classe: v.classe || undefined });

/** Aba Espécies de Cadastros: a classe vem daqui; a categoria vem da inspeção. */
export default function Especies({ aoAlterar }: { aoAlterar: () => void }) {
  const { pode } = useAuth();
  const notificar = useToast();
  const [editar, setEditar] = useState<Especie | null>(null);
  const [inativar, setInativar] = useState<AlvoInativacao | null>(null);
  const [rec, setRec] = useState(0);
  const alterou = () => { setRec((x) => x + 1); aoAlterar(); };
  const edita = pode('cadastros:editar');

  const colunas: Coluna<Especie>[] = [
    { chave: 'nomeCientifico', titulo: 'Nome científico', ordenavel: true, render: (e) => <span className="nome-cientifico">{e.nomeCientifico}</span> },
    { chave: 'nomePopular', titulo: 'Nome popular', ordenavel: true },
    { chave: 'classe', titulo: 'Classe', render: (e) => rotuloClasse(e.classe) },
    { chave: 'ativo', titulo: 'Situação', render: (e) => <BadgeDe mapa={SITUACAO_CADASTRO} valor={e.ativo ? 'ativo' : 'inativo'} /> },
  ];

  return (
    <>
      <ListPage<Especie>
        secao titulo="Espécies" descricao="Madeiras dos dormentes. A classe é da espécie; a categoria vem da inspeção de cada dormente."
        inclusao={edita && (
          <FormLinha
            campos={CAMPOS} rotuloEnviar="Adicionar espécie" legenda="O nome científico não se repete. Classe em branco aparece como &quot;a definir&quot;."
            aoEnviar={async (v) => { const e = await servicos.especies.criar(paraEspecie(v)); notificar('sucesso', `Espécie ${e.nomePopular} cadastrada.`); alterou(); }}
          />
        )}
        listar={(q) => servicos.especies.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'ativo', rotulo: 'Ativa', opcoes: SIM_NAO_OPCOES }]}
        acoesLinha={edita ? [
          { rotulo: 'Editar', aoClicar: setEditar },
          { rotulo: 'Inativar', visivel: (e) => e.ativo, aoClicar: (e) => setInativar({ nome: e.nomePopular, efeito: 'A espécie não entra em novos contratos.', inativar: () => servicos.especies.inativar(e.id) }) },
        ] : undefined}
      />
      <FormModal
        titulo={editar ? `Editar ${editar.nomePopular}` : 'Editar espécie'} aberto={!!editar} aoFechar={() => setEditar(null)} campos={CAMPOS}
        iniciais={editar ? { nomeCientifico: editar.nomeCientifico, nomePopular: editar.nomePopular, classe: editar.classe ?? '' } : undefined}
        aoEnviar={async (v) => { await servicos.especies.atualizar(editar!.id, paraEspecie(v)); notificar('sucesso', 'Espécie atualizada.'); alterou(); }}
      />
      <ConfirmarInativacao alvo={inativar} aoFechar={() => setInativar(null)} aoConcluir={alterou} />
    </>
  );
}
