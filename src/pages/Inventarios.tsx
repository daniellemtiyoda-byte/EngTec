import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeDe } from '../components/Badge';
import { FormModal } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { SITUACAO_INVENTARIO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { Inventario, SituacaoInventario } from '../types/models';
import { dataHora, numero } from '../utils/format';

const ABAS: { valor: SituacaoInventario; rotulo: string }[] = [
  { valor: 'aberto', rotulo: 'Abertos' },
  { valor: 'fechado', rotulo: 'Fechados' },
];
const contar = () => Promise.all(ABAS.map((a) => servicos.inventarios.listar({ pageSize: 1, filters: { situacao: a.valor } }).then((r) => r.total)));

/**
 * Inventário físico por leitura de QR (IN Ibama 21/2014, art. 41): o almoxarife abre para um ou mais locais, lê os QR
 * dos fardos e dormentes no celular e fecha; cada diferença é tratada dormente a dormente, sem ajuste de quantidade.
 */
export default function Inventarios() {
  const { pode } = useAuth();
  const nav = useNavigate();
  const notificar = useToast();
  const cad = useCadastros();
  const totais = useAsync(contar, []);
  const [abrir, setAbrir] = useState(false);
  const locais = (cad.listas?.locais ?? []).filter((l) => l.ativo);

  const colunas: Coluna<Inventario>[] = [
    { chave: 'numero', titulo: 'Inventário', ordenavel: true, render: (i) => <span className="mono">{i.numero}</span> },
    { chave: 'locaisIds', titulo: 'Locais', quebrar: true, render: (i) => i.locaisIds.map((id) => cad.codigoLocal(id)).join(', ') },
    { chave: 'esperados', titulo: 'Esperados', alinhar: 'right', render: (i) => numero(i.esperados.length) },
    { chave: 'resultado', titulo: 'Conferidos', alinhar: 'right', render: (i) => (i.resultado ? `${numero(i.resultado.conferidos)} (${i.resultado.percentual.toLocaleString('pt-BR')}%)` : '—') },
    { chave: 'diferencas', titulo: 'Diferenças', alinhar: 'right', render: (i) => (i.resultado ? numero(i.resultado.diferencas.length) : '—') },
    { chave: 'abertoEm', titulo: 'Aberto em', ordenavel: true, render: (i) => dataHora(i.abertoEm) },
    { chave: 'fechadoEm', titulo: 'Fechado em', opcional: true, render: (i) => dataHora(i.fechadoEm) },
    { chave: 'situacao', titulo: 'Situação', render: (i) => <BadgeDe mapa={SITUACAO_INVENTARIO} valor={i.situacao} /> },
  ];

  return (
    <>
      <ListPage<Inventario>
        titulo="Inventário"
        descricao="Conferência física por leitura de QR: o que está em cada local × o que o sistema diz. Toda diferença é tratada dormente a dormente."
        acoes={pode('estoque:movimentar') && <button className="btn btn-pri" onClick={() => setAbrir(true)}>Abrir inventário</button>}
        abasSituacao={{ chave: 'situacao', rotulo: 'Situação do inventário', abas: ABAS.map((a, i) => ({ ...a, total: totais.dados?.[i] })) }}
        listar={(q) => servicos.inventarios.listar(q)}
        colunas={colunas}
        acoesLinha={[
          { rotulo: 'Continuar a leitura', principal: true, visivel: (i) => i.situacao === 'aberto' && pode('estoque:movimentar'), aoClicar: (i) => nav(`/inventarios/${i.id}`) },
          { rotulo: 'Ver resultado', visivel: (i) => i.situacao === 'fechado', aoClicar: (i) => nav(`/inventarios/${i.id}`) },
        ]}
      />
      <FormModal
        titulo="Abrir inventário" aberto={abrir} aoFechar={() => setAbrir(false)} rotuloEnviar="Abrir inventário"
        campos={[{
          nome: 'locais', rotulo: 'Locais a conferir', tipo: 'multipla', obrigatorio: true, opcoes: locais.map((l) => ({ valor: l.id, rotulo: `${l.codigo} · ${l.descricao}` })),
          ajuda: 'O sistema guarda o que deveria estar em cada local agora. Leia os QR no local e feche ao terminar.',
        }]}
        aoEnviar={async (v) => {
          const inv = await servicos.inventarios.abrir(v.locais.split(',').filter(Boolean));
          notificar('sucesso', `${inv.numero} aberto: ${numero(inv.esperados.length)} dormentes esperados.`);
          setAbrir(false);
          nav(`/inventarios/${inv.id}`);
        }}
      />
    </>
  );
}
