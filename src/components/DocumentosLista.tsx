import { useState } from 'react';
import { ListPage, type Coluna } from './ListPage';
import { StatusRegistroBadge } from './Badge';
import { Modal } from './Modal';
import { STATUS_OPCOES, TIPO_DOCUMENTO_OPCOES } from '../dominio/opcoes';
import { servicos } from '../services';
import type { Documento } from '../types/models';
import { data, m3, un, urlSegura } from '../utils/format';

/** Lista genérica de documentos (só leitura), na aba "Documentos" de Fornecedores. NF e DOF têm tela própria. */
export function DocumentosLista() {
  const [ver, setVer] = useState<Documento | null>(null);

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
        titulo="Documentos"
        descricao="Documentos fiscais e de origem. O volume documental é o declarado, não o calculado. NF e DOF são cadastrados na tela NF e DOF."
        secao
        listar={(q) => servicos.documentos.listar(q)}
        colunas={colunas}
        filtros={[{ chave: 'status', rotulo: 'Situação', opcoes: STATUS_OPCOES }, { chave: 'tipo', rotulo: 'Tipo', opcoes: TIPO_DOCUMENTO_OPCOES }]}
        acoesLinha={[{ rotulo: 'Visualizar', aoClicar: setVer }]}
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
