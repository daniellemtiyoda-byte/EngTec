import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeDe } from '../components/Badge';
import { CodigoLink } from '../components/Codigos';
import { ComoFunciona, PageHeader } from '../components/Estados';
import { FormarFardosModal, mensagemFardos } from '../components/FormarFardosModal';
import { FormModal } from '../components/FormModal';
import { InspectorModal } from '../components/InspectorModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { Cartao, Quadro, type ColunaQuadro } from '../components/Quadro';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAlertas } from '../contexts/AlertasContext';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORIA_OPCOES, RESULTADO_PECA_OPCOES } from '../dominio/opcoes';
import { ETAPA_INSPECAO, RESULTADO_INSPECAO, SITUACAO_LOTE } from '../dominio/rotulos';
import { servicos } from '../services';
import type { EtapaInspecao, Lote, ResultadoPeca } from '../types/models';
import { data, dataHora, numero, paraNumero } from '../utils/format';

/**
 * Inspeção dos lotes recebidos (RF05/RF06): as peças chegam do Inspector (ou são lançadas à mão) e, com todas inspecionadas,
 * o almoxarife forma os fardos pelo resultado. Quadro com o que ainda pede ação; embaixo, as inspeções concluídas.
 */
export default function Inspecao() {
  const { pode } = useAuth();
  const nav = useNavigate();
  const notificar = useToast();
  const alertas = useAlertas();
  const [rec, setRec] = useState(0);
  const [formar, setFormar] = useState<Lote | null>(null);
  const [lancar, setLancar] = useState<Lote | null>(null);
  const [inspector, setInspector] = useState<Lote | null>(null);
  const recarregar = () => { setRec((x) => x + 1); alertas.recarregar(); };
  const concluir = pode('inspecao:concluir');
  const completo = (l: Lote) => l.pecasInspecionadas >= l.quantidade;

  const coluna = (etapa: EtapaInspecao, tom: ColunaQuadro<Lote>['tom'], vazio: string): ColunaQuadro<Lote> => ({
    chave: etapa, titulo: ETAPA_INSPECAO[etapa][1], tom, vazio,
    carregar: () => servicos.lotes.listar({ filters: { etapaInspecao: etapa }, sortBy: 'recebidoEm', pageSize: 50 }),
    // Prontos para formar fardos primeiro.
    ordenar: (a, b) => Number(completo(b)) - Number(completo(a)),
  });
  const colunasQuadro = [
    coluna('aguardando', 'azul', 'Nenhum lote esperando a inspeção.'),
    coluna('em_inspecao', 'laranja', 'Nenhuma inspeção em andamento.'),
  ];

  const cartao = (l: Lote) => (
    <Cartao
      destaque={completo(l) ? 'atencao' : undefined}
      acoes={<>
        {concluir && completo(l) && <button className="btn btn-acao btn-peq" onClick={() => setFormar(l)}>Formar fardos</button>}
        <button className="btn btn-sec btn-peq" onClick={() => setInspector(l)}>Inspector</button>
        {concluir && !completo(l) && <button className="btn btn-sec btn-peq" onClick={() => setLancar(l)}>Lançar resultado</button>}
      </>}
    >
      <div className="cartao-topo"><CodigoLink codigo={l.codigo} /><span className="mudo">NF {l.nfNumero}</span></div>
      <div><em>{l.especieDocumental}</em> · {l.tamanho}</div>
      <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={l.quantidade} aria-valuenow={l.pecasInspecionadas} aria-label="Peças inspecionadas">
        <div style={{ width: `${Math.min(100, (l.pecasInspecionadas / l.quantidade) * 100)}%` }} />
      </div>
      <div className={completo(l) ? undefined : 'mudo'}>
        {completo(l) ? <strong>Todas as {numero(l.quantidade)} peças inspecionadas</strong> : `${numero(l.pecasInspecionadas)} de ${numero(l.quantidade)} peças inspecionadas`}
      </div>
      <div className="mudo">Recebido em {data(l.recebidoEm)}</div>
    </Cartao>
  );

  const colunas: Coluna<Lote>[] = [
    { chave: 'codigo', titulo: 'Lote', ordenavel: true, render: (l) => <CodigoLink codigo={l.codigo} /> },
    { chave: 'especieDocumental', titulo: 'Espécie', ordenavel: true, render: (l) => <em>{l.especieDocumental}</em> },
    { chave: 'tamanho', titulo: 'Tamanho', ordenavel: true },
    { chave: 'quantidade', titulo: 'Peças', alinhar: 'right', ordenavel: true, render: (l) => numero(l.quantidade) },
    { chave: 'fardos', titulo: 'Fardos', alinhar: 'right', ordenavel: true },
    { chave: 'situacao', titulo: 'Situação', render: (l) => <BadgeDe mapa={SITUACAO_LOTE} valor={l.situacao} /> },
    { chave: 'inspecaoConcluidaEm', titulo: 'Concluída em', ordenavel: true, render: (l) => <>{dataHora(l.inspecaoConcluidaEm)}<div className="mudo">{l.inspecaoConcluidaPor}</div></> },
    { chave: 'inspecao', titulo: 'Resumo', opcional: true, render: (l) => <BadgeDe mapa={RESULTADO_INSPECAO} valor={l.inspecao} /> },
  ];

  return (
    <>
      <section className="painel">
        <PageHeader titulo="Inspeção" descricao="Resultado de cada peça e formação dos fardos pelo resultado." />
        <ComoFunciona>
          Depois do recebimento, cada peça é inspecionada no Inspector com o código do lote e a sua sequência (ex.: LT26-0042-0007); o resultado
          chega aqui sozinho. Sem o Inspector, o resultado pode ser lançado à mão, com registro de quem lançou. Com todas as peças
          inspecionadas, o almoxarife forma os fardos: aprovadas por categoria ficam disponíveis; quarentena, reprovadas e peças com
          espécie ou tamanho diferente da NF ficam segregadas. Até lá, o lote fica fora da separação.
        </ComoFunciona>
        <Quadro rotulo="Etapas da inspeção" colunas={colunasQuadro} cartao={cartao} recarregar={rec} />
      </section>
      <ListPage<Lote>
        secao titulo="Inspeções concluídas" descricao="Lotes com os fardos já formados, mais recentes primeiro."
        listar={(q) => servicos.lotes.listar({ ...q, filters: { ...q.filters, etapaInspecao: 'concluida' } })}
        recarregar={rec} colunas={colunas} ordemPadrao={[{ campo: 'inspecaoConcluidaEm', dir: 'desc' }]}
        acoesLinha={[{ rotulo: 'Abrir lote', principal: true, aoClicar: (l) => nav(`/lotes/${encodeURIComponent(l.codigo)}`) }]}
      />
      <FormarFardosModal
        lote={formar} aoFechar={() => setFormar(null)}
        aoConcluir={(d) => { notificar('sucesso', mensagemFardos(d)); recarregar(); }}
      />
      <InspectorModal lote={inspector} aoFechar={() => setInspector(null)} />
      <FormModal
        titulo={lancar ? `Lançar resultado: lote ${lancar.codigo}` : 'Lançar resultado'} aberto={!!lancar} aoFechar={() => setLancar(null)} rotuloEnviar="Lançar"
        campos={[
          {
            nome: 'quantidade', rotulo: 'Quantidade de peças', tipo: 'number', inteiro: true, obrigatorio: true, min: 1,
            max: lancar ? lancar.quantidade - lancar.pecasInspecionadas : undefined,
            ajuda: lancar ? `Restam ${numero(lancar.quantidade - lancar.pecasInspecionadas)} peça(s) sem resultado; entram nas primeiras sequências livres.` : undefined,
          },
          { nome: 'resultado', rotulo: 'Resultado', tipo: 'select', obrigatorio: true, opcoes: RESULTADO_PECA_OPCOES },
          { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: CATEGORIA_OPCOES, ajuda: 'Obrigatória para peças aprovadas.' },
        ]}
        validar={(v): Record<string, string> => (v.resultado === 'aprovado' && !v.categoria ? { categoria: 'Escolha a categoria das peças aprovadas.' } : {})}
        aoEnviar={async (v) => {
          const resultado = v.resultado as ResultadoPeca;
          const r = await servicos.inspecoes.lancar(lancar!.codigo, {
            quantidade: paraNumero(v.quantidade, true), resultado, categoria: resultado === 'aprovado' ? paraNumero(v.categoria, true) : undefined,
          });
          notificar('sucesso', `${numero(r.length)} peça(s) do lote ${lancar!.codigo} com resultado lançado${SUFIXO_SIMULADO}.`);
          recarregar();
        }}
      />
    </>
  );
}
