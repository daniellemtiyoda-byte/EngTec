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
import type { DadosEspecie } from '../services/contracts';
import type { Especie } from '../types/models';

const CAMPOS: Campo[] = [
  { nome: 'nomeCientifico', rotulo: 'Nome científico', obrigatorio: true, maxLength: 80, ajuda: 'ex.: Dialium guianense' },
  { nome: 'nomePopular', rotulo: 'Nome popular', obrigatorio: true, maxLength: 60 },
];

const paraEspecie = (v: Record<string, string>): DadosEspecie => ({ nomeCientifico: v.nomeCientifico, nomePopular: v.nomePopular });

/** Aba Espécies de Cadastros. A classe (NBR 7511) não é da espécie: vem do fardo e de cada dormente; a categoria vem da inspeção. */
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
    { chave: 'ativo', titulo: 'Situação', render: (e) => <BadgeDe mapa={SITUACAO_CADASTRO} valor={e.ativo ? 'ativo' : 'inativo'} /> },
  ];

  return (
    <>
      <ListPage<Especie>
        secao titulo="Espécies" descricao="Madeiras dos dormentes. A classe (1ª ou 2ª, NBR 7511) vem do fornecedor em cada fardo; a categoria vem da inspeção."
        inclusao={edita && (
          <FormLinha
            campos={CAMPOS} rotuloEnviar="Adicionar espécie" legenda="O nome científico não se repete. A lista de espécies aceitas por classe depende da Especificação Técnica CPTM AD1956-4."
            aoEnviar={async (v) => { const e = await servicos.especies.criar(paraEspecie(v)); notificar('sucesso', `Espécie ${e.nomePopular} cadastrada.`); alterou(); }}
          />
        )}
        listar={(q) => servicos.especies.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'ativo', rotulo: 'Ativa', opcoes: SIM_NAO_OPCOES }]}
        acoesLinha={edita ? [
          { rotulo: 'Editar', aoClicar: setEditar },
          { rotulo: 'Inativar', visivel: (e) => e.ativo, aoClicar: (e) => setInativar({ nome: e.nomePopular, efeito: 'A espécie não entra no cadastro de novos fornecedores.', executar: () => servicos.especies.inativar(e.id) }) },
          { rotulo: 'Reativar', visivel: (e) => !e.ativo, aoClicar: (e) => setInativar({ nome: e.nomePopular, acao: 'reativar', efeito: 'A espécie volta a poder entrar em contratos e no cadastro de fornecedores.', executar: () => servicos.especies.reativar(e.id) }) },
        ] : undefined}
      />
      <FormModal
        titulo={editar ? `Editar ${editar.nomePopular}` : 'Editar espécie'} aberto={!!editar} aoFechar={() => setEditar(null)} campos={CAMPOS}
        iniciais={editar ? { nomeCientifico: editar.nomeCientifico, nomePopular: editar.nomePopular } : undefined}
        aoEnviar={async (v) => { await servicos.especies.atualizar(editar!.id, paraEspecie(v)); notificar('sucesso', 'Espécie atualizada.'); alterou(); }}
      />
      <ConfirmarInativacao alvo={inativar} aoFechar={() => setInativar(null)} aoConcluir={alterou} />
    </>
  );
}
