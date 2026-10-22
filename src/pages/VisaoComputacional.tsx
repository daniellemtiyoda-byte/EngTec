import { useState } from 'react';
import { Aviso } from '../components/Estados';
import { BadgeDe } from '../components/Badge';
import { ListPage, type Coluna } from '../components/ListPage';
import { UploadModal } from '../components/UploadModal';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { opcoesDe } from '../dominio/opcoes';
import { ESTADO_PROCESSAMENTO, REVISAO_PROCESSAMENTO } from '../dominio/rotulos';
import { servicos } from '../services';
import type { ProcessamentoImagem } from '../types/models';
import { dataHora, pct01, un } from '../utils/format';

export default function VisaoComputacional() {
  const { pode } = useAuth();
  const notificar = useToast();
  const [aberto, setAberto] = useState(false);
  const [rec, setRec] = useState(0);

  const colunas: Coluna<ProcessamentoImagem>[] = [
    { chave: 'arquivo', titulo: 'Imagem', ordenavel: true },
    { chave: 'enviadoEm', titulo: 'Enviada em', ordenavel: true, render: (p) => dataHora(p.enviadoEm) },
    { chave: 'estado', titulo: 'Processamento', render: (p) => <BadgeDe mapa={ESTADO_PROCESSAMENTO} valor={p.estado} /> },
    { chave: 'contagemEstimada', titulo: 'Contagem estimada', alinhar: 'right', render: (p) => p.contagemEstimada === undefined ? '—' : <>{un(p.contagemEstimada)} <span className="mudo">(estimativa)</span></> },
    { chave: 'confianca', titulo: 'Confiança', alinhar: 'right', render: (p) => p.confianca === undefined ? '—' : pct01(p.confianca) },
    { chave: 'revisao', titulo: 'Revisão', render: (p) => <BadgeDe mapa={REVISAO_PROCESSAMENTO} valor={p.revisao} /> },
  ];

  return (
    <>
      <ListPage<ProcessamentoImagem>
        titulo="Visão computacional"
        descricao="Apoio à conferência por imagem. O resultado é uma estimativa a ser revisada."
        aviso={<Aviso tom="alerta">A contagem por imagem é <strong>estimada</strong> e <strong>não altera o saldo oficial</strong>. A espécie vegetal <strong>não é identificada</strong> pela imagem; vale a espécie declarada em documento.</Aviso>}
        listar={(q) => servicos.visao.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'estado', rotulo: 'Processamento', opcoes: opcoesDe(ESTADO_PROCESSAMENTO) }]}
        acoes={pode('visao:enviar') ? <button className="btn btn-pri" onClick={() => setAberto(true)}>Enviar imagem</button> : undefined}
      />
      <UploadModal
        titulo="Enviar imagem para processamento" aberto={aberto} aoFechar={() => setAberto(false)} extensoes={['jpg', 'jpeg', 'png']} previaImagem
        aviso="Envie apenas imagens autorizadas. O processamento é feito pelo serviço de visão computacional; o resultado aparece na lista quando concluído."
        aoEnviar={async (f) => { await servicos.visao.enviarImagem(f); notificar('info', `Imagem enviada; o processamento ainda não foi concluído${SUFIXO_SIMULADO}.`); setRec((x) => x + 1); }}
      />
    </>
  );
}
