import { useState } from 'react';
import { ListPage, type Coluna } from '../components/ListPage';
import { StatusRegistroBadge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { UploadModal } from '../components/UploadModal';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { servicos } from '../services';
import type { Documento } from '../types/models';
import { data, m3, un, urlSegura } from '../utils/format';

export const STATUS_OPCOES = [
  { valor: 'aprovado', rotulo: 'Aprovado' }, { valor: 'pendente', rotulo: 'Pendente' }, { valor: 'bloqueado', rotulo: 'Bloqueado' },
];

/** Lista reutilizada em "Importação de documentos" e "Fornecedores e documentos". */
export function DocumentosLista({ importar = false, secao = false }: { importar?: boolean; secao?: boolean }) {
  const { pode } = useAuth();
  const notificar = useToast();
  const [upload, setUpload] = useState(false);
  const [ver, setVer] = useState<Documento | null>(null);
  const [rec, setRec] = useState(0);

  const colunas: Coluna<Documento>[] = [
    { chave: 'tipo', titulo: 'Tipo', ordenavel: true },
    { chave: 'numero', titulo: 'Número', ordenavel: true },
    { chave: 'fornecedor', titulo: 'Fornecedor', ordenavel: true },
    { chave: 'emissao', titulo: 'Emissão', ordenavel: true, render: (d) => data(d.emissao) },
    { chave: 'quantidade', titulo: 'Quantidade', alinhar: 'right', ordenavel: true, render: (d) => un(d.quantidade) },
    { chave: 'volumeDocumentalM3', titulo: 'Volume documental', alinhar: 'right', ordenavel: true, render: (d) => m3(d.volumeDocumentalM3) },
    { chave: 'status', titulo: 'Situação', render: (d) => <StatusRegistroBadge s={d.status} /> },
  ];

  const url = urlSegura(ver?.urlVisualizacao);

  return (
    <>
      <ListPage<Documento>
        titulo={secao ? 'Documentos' : 'Integração e importação de documentos'}
        descricao="Documentos fiscais e de origem. O volume documental é o declarado, não o calculado."
        secao={secao}
        listar={(q) => servicos.documentos.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'status', rotulo: 'Situação', opcoes: STATUS_OPCOES }, { chave: 'tipo', rotulo: 'Tipo', opcoes: ['NF-e', 'DOF', 'Romaneio', 'Laudo'].map((t) => ({ valor: t, rotulo: t })) }]}
        acoes={importar && pode('documentos:importar') ? <button className="btn btn-pri" onClick={() => setUpload(true)}>Importar documento</button> : undefined}
        acoesLinha={[{ rotulo: 'Visualizar', aoClicar: setVer }]}
      />
      <UploadModal
        titulo="Importar documento" aberto={upload} aoFechar={() => setUpload(false)} extensoes={['pdf', 'xml']}
        aviso="O documento é enviado ao serviço de integração, que valida e interpreta o conteúdo. Ele só aparece como aprovado após a confirmação do sistema responsável."
        aoEnviar={async (f) => { await servicos.documentos.importar(f); notificar('sucesso', `Documento recebido para processamento${SUFIXO_SIMULADO}.`); setRec((x) => x + 1); }}
      />
      <Modal titulo="Documento" aberto={!!ver} aoFechar={() => setVer(null)} rodape={<button className="btn btn-sec" onClick={() => setVer(null)}>Fechar</button>}>
        {ver && (
          <>
            <dl className="detalhes">
              <dt>Tipo</dt><dd>{ver.tipo}</dd><dt>Número</dt><dd>{ver.numero}</dd><dt>Fornecedor</dt><dd>{ver.fornecedor}</dd>
              <dt>Emissão</dt><dd>{data(ver.emissao)}</dd><dt>Quantidade</dt><dd>{un(ver.quantidade)}</dd><dt>Volume documental</dt><dd>{m3(ver.volumeDocumentalM3)}</dd>
              <dt>Situação</dt><dd><StatusRegistroBadge s={ver.status} /></dd>
            </dl>
            {url ? <a href={url} target="_blank" rel="noopener noreferrer">Abrir arquivo do documento (nova aba)</a> : <div className="aviso aviso-info">Arquivo indisponível para visualização (sem endereço autorizado informado pelo serviço).</div>}
          </>
        )}
      </Modal>
    </>
  );
}

export default function Documentos() {
  return <DocumentosLista importar />;
}
