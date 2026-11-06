import { useEffect, useMemo, useState } from 'react';
import { TIPO_OCORRENCIA_OPCOES } from '../dominio/opcoes';
import { NIVEL_PRAZO, TIPO_OCORRENCIA } from '../dominio/rotulos';
import { useAuth } from '../contexts/AuthContext';
import type { Cadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import type { DadosOcorrencia } from '../services/contracts';
import { ApiError, mensagemSegura } from '../services/http';
import type { Entrega, PreviaRecebimento, Recebimento, TipoOcorrencia } from '../types/models';
import { arquivoInvalido, data, m3, numero, pct } from '../utils/format';
import { Badge, BadgeDe } from './Badge';
import { EntregaAssistente } from './EntregaAssistente';
import { Carregando, Vazio } from './Estados';
import { Icone } from './Icone';
import { LeitorQr, type RetornoLeitura } from './LeitorQr';
import { Modal } from './Modal';
import { ProgressoPassos } from './Passos';

const PASSOS = ['Escolher a entrega', 'Leitura dos fardos', 'Conferência', 'Local de espera', 'Revisar e confirmar'];
const EXTENSOES_FOTO = ['jpg', 'jpeg', 'png', 'webp', 'heic'];
/** Erros do serviço levam de volta ao passo do campo. */
function passoDoCampo(k: string) {
  if (k === 'fardosLidos') return 1;
  if (k.startsWith('ocorrencias')) return 2;
  if (k === 'localEsperaId') return 3;
  return 4;
}

interface LinhaOcorrencia { chave: number; tipo: TipoOcorrencia; fardoId: string; descricao: string; fotos: File[] }
let seq = 1;

interface Props {
  aberto: boolean;
  cad: Cadastros;
  /** Entrega já escolhida (ação "Receber" na linha): o assistente começa na leitura. */
  entregaId?: string;
  aoFechar: () => void;
  aoReceber: (r: Recebimento) => void;
}

/**
 * Assistente de recebimento (seção 9.7 do plano), tela de campo pensada primeiro para o celular: escolher a entrega
 * "a caminho" (ou cadastrar NF e DOF na hora, como exceção), ler os QR dos fardos em modo contínuo, conferir com
 * ocorrências e fotos, escolher o local de espera e revisar a prévia do serviço antes de confirmar.
 */
export function RecebimentoAssistente({ aberto, cad, entregaId, aoFechar, aoReceber }: Props) {
  const { pode } = useAuth();
  const [passo, setPasso] = useState(0);
  const [entregas, setEntregas] = useState<Entrega[]>();
  const [busca, setBusca] = useState('');
  const [escolhida, setEscolhida] = useState<string>('');
  const [lidos, setLidos] = useState<string[]>([]);
  const [avulsos, setAvulsos] = useState<string[]>([]);
  const [lendo, setLendo] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [conforme, setConforme] = useState(true);
  const [ocorrencias, setOcorrencias] = useState<LinhaOcorrencia[]>([]);
  const [localId, setLocalId] = useState('');
  const [previa, setPrevia] = useState<PreviaRecebimento>();
  const [justificativa, setJustificativa] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  const carregarEntregas = (selecionar?: string) => {
    setEntregas(undefined);
    servicos.recebimentos.entregasACaminho().then((l) => { setEntregas(l); if (selecionar) setEscolhida(selecionar); }).catch((e) => { setEntregas([]); setErroGeral(mensagemSegura(e)); });
  };

  useEffect(() => {
    if (!aberto) return;
    setPasso(entregaId ? 1 : 0); setEscolhida(entregaId ?? ''); setBusca(''); setLidos([]); setConforme(true); setOcorrencias([]);
    setLocalId(''); setPrevia(undefined); setJustificativa(''); setErros({}); setErroGeral(undefined);
    carregarEntregas(entregaId);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const entrega = entregas?.find((x) => x.id === escolhida);
  const esperados = useMemo(() => (entrega ? entrega.fardosIds.filter((id) => !entrega.fardosRecebidos.includes(id)) : []), [entrega]);
  const lidosEsperados = lidos.filter((id) => esperados.includes(id));
  const extras = lidos.filter((id) => !esperados.includes(id));
  const locaisEspera = (cad.listas?.locais ?? []).filter((l) => l.ativo && l.tipo === 'inspecao');
  const sugerido = [...locaisEspera].sort((a, b) => (b.capacidade - b.ocupacao) - (a.capacidade - a.ocupacao))[0];

  // Fardos do contrato emitidos e sem entrega: também são aceitos na leitura (entrega sem fardos indicados).
  useEffect(() => {
    if (!entrega) return;
    servicos.documentos.fardosSemEntrega(entrega.contratoId).then((l) => setAvulsos(l.map((f) => f.id))).catch(() => setAvulsos([]));
  }, [entrega?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Leitura de um QR no modo contínuo: marca o fardo e diz na hora se ele é ou não desta entrega. */
  function aoLer(c: { tipo: string; id: string }): RetornoLeitura {
    if (c.tipo !== 'fardo') return { ok: false, mensagem: 'Leia o QR da etiqueta do fardo, não o do dormente.' };
    if (lidos.includes(c.id)) return { ok: false, mensagem: `${c.id} já foi lido.` };
    setLidos((l) => [...l, c.id]);
    if (esperados.includes(c.id)) return { ok: true, mensagem: `${c.id} lido · ${lidosEsperados.length + 1} de ${esperados.length}` };
    if (avulsos.includes(c.id)) return { ok: true, mensagem: `${c.id} lido · do contrato, entra nesta entrega` };
    return { ok: false, mensagem: `${c.id} não é desta entrega: vai como ocorrência "fardo desconhecido".` };
  }
  const alternar = (id: string) => setLidos((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  function validar(p: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (p === 0 && !entrega) e.entrega = 'Escolha a entrega que chegou.';
    if (p === 1 && !lidos.some((id) => esperados.includes(id) || avulsos.includes(id))) e.fardosLidos = 'Leia o QR de ao menos um fardo desta entrega.';
    if (p === 2 && !conforme) {
      if (!ocorrencias.length) e.ocorrencias = 'Inclua a ocorrência ou marque "Conforme".';
      ocorrencias.forEach((o, n) => {
        if (!o.descricao.trim()) e[`ocorrencias.${n}`] = 'Descreva a ocorrência.';
        else if (!o.fotos.length) e[`ocorrencias.${n}`] = 'Tire ao menos uma foto.';
        else { const inv = o.fotos.map((f) => arquivoInvalido(f, EXTENSOES_FOTO)).find(Boolean); if (inv) e[`ocorrencias.${n}`] = inv; }
      });
    }
    if (p === 3 && !localId) e.localEsperaId = 'Escolha o local de espera.';
    if (p === 4 && previa?.exigeJustificativa && !justificativa.trim()) e.justificativaDivergencia = 'Justificativa obrigatória.';
    return e;
  }

  async function avancar() {
    const e = validar(passo);
    setErros(e); setErroGeral(undefined);
    if (Object.keys(e).length) return;
    if (passo === 2 && !localId && sugerido) setLocalId(sugerido.id);
    if (passo === 3 && entrega) {
      setPrevia(undefined);
      try {
        const p = await servicos.recebimentos.previa(entrega.id, lidos);
        setPrevia(p);
        setJustificativa((j) => j || p.justificativaAutomatica || '');
      } catch (err) { setErroGeral(mensagemSegura(err)); return; }
    }
    setPasso((x) => x + 1);
  }

  async function confirmar() {
    const e = validar(4);
    setErros(e);
    if (Object.keys(e).length || !entrega) return;
    setEnviando(true); setErroGeral(undefined);
    try {
      const declaradas: DadosOcorrencia[] = conforme ? [] : ocorrencias.map((o) => ({ tipo: o.tipo, descricao: o.descricao, fardoId: o.fardoId || undefined, fotos: o.fotos }));
      const r = await servicos.recebimentos.receber(entrega.id, { fardosLidos: lidos, ocorrencias: declaradas, localEsperaId: localId, justificativaDivergencia: justificativa });
      aoReceber(r);
    } catch (err) {
      if (err instanceof ApiError && err.detalhes) {
        setErros(err.detalhes);
        const primeiro = Object.keys(err.detalhes)[0];
        if (primeiro) setPasso(passoDoCampo(primeiro));
      }
      setErroGeral(mensagemSegura(err));
    } finally {
      setEnviando(false);
    }
  }

  const erro = (k: string) => erros[k] && <span className="erro-campo" role="alert">{erros[k]}</span>;
  const mudarOcorrencia = (chave: number, campo: keyof LinhaOcorrencia, valor: unknown) => setOcorrencias((l) => l.map((o) => (o.chave === chave ? { ...o, [campo]: valor } : o)));
  const visiveis = (entregas ?? []).filter((x) => !busca.trim() || x.nfNumero.includes(busca.trim()) || cad.nomeFornecedor(x.fornecedorId).toLowerCase().includes(busca.trim().toLowerCase()));

  /** Lista dos fardos esperados com caixa de marcar (também aparece embaixo da câmera). */
  const listaEsperados = (
    <div className="leitura-fardos">
      <p className="leitura-contador" aria-live="polite"><strong>{lidosEsperados.length} de {esperados.length}</strong> fardos esperados lidos</p>
      <ul>
        {esperados.map((id) => (
          <li key={id} className={lidos.includes(id) ? 'lido' : undefined}>
            <label className="caixa caixa-grande"><input type="checkbox" checked={lidos.includes(id)} onChange={() => alternar(id)} /> <span className="mono">{id}</span></label>
          </li>
        ))}
      </ul>
      {extras.length > 0 && (
        <>
          <p className="mudo">Lidos que não estavam previstos:</p>
          <ul>
            {extras.map((id) => (
              <li key={id} className={avulsos.includes(id) ? 'lido' : 'desconhecido'}>
                <span className="mono">{id}</span> {avulsos.includes(id) ? <Badge tom="azul">do contrato, entra</Badge> : <Badge tom="vermelho">fardo desconhecido</Badge>}
                <button type="button" className="btn btn-sec btn-peq" onClick={() => alternar(id)}>Tirar</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );

  return (
    <>
      <Modal
        largo titulo="Receber entrega" aberto={aberto && !lendo && !cadastrando} aoFechar={aoFechar}
        rodape={<>
          {passo > 0 ? <button type="button" className="btn btn-sec" onClick={() => setPasso((p) => p - 1)} disabled={enviando}>Voltar</button>
            : <button type="button" className="btn btn-sec" onClick={aoFechar}>Cancelar</button>}
          {passo < 4
            ? <button type="button" className="btn btn-pri" onClick={() => void avancar()}>Avançar</button>
            : <button type="button" className="btn btn-pri" onClick={() => void confirmar()} disabled={enviando || !previa}>{enviando ? 'Registrando…' : 'Confirmar recebimento'}</button>}
        </>}
      >
        <ProgressoPassos passos={PASSOS} atual={passo} />
        {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}

        {passo === 0 && (
          <div className="assistente-passo">
            <div className="campo">
              <label htmlFor="rec-busca">Pesquisar pela NF ou pelo fornecedor</label>
              <input id="rec-busca" type="search" value={busca} inputMode="search" onChange={(e) => setBusca(e.target.value)} />
            </div>
            {entregas === undefined ? <Carregando linhas={3} /> : visiveis.length === 0 ? <Vazio mensagem="Nenhuma entrega a caminho." dica="Cadastre a NF e a DOF em NF e DOF antes da chegada." /> : (
              <ul className="escolha-entregas" role="radiogroup" aria-label="Entregas a caminho">
                {visiveis.map((x) => (
                  <li key={x.id}>
                    <label className={`cartao-escolha${escolhida === x.id ? ' escolhido' : ''}`}>
                      <input type="radio" name="rec-entrega" checked={escolhida === x.id} onChange={() => setEscolhida(x.id)} />
                      <span className="cartao-escolha-titulo">NF {x.nfNumero} · {cad.nomeFornecedor(x.fornecedorId)}</span>
                      <span className="mudo">{x.fardosIds.length === 0 ? 'Fardos não indicados: entram os lidos deste contrato' : x.fardosRecebidos.length ? `${x.fardosIds.length - x.fardosRecebidos.length} fardo(s) ainda a receber · ${numero(x.dormentes)} dormentes` : `${x.fardosIds.length} fardo(s) esperados · ${numero(x.dormentes)} dormentes`}</span>
                      <span>Prazo da DOF {data(x.prazoDeclaracao)} {x.nivelPrazo !== 'ok' && <BadgeDe mapa={NIVEL_PRAZO} valor={x.nivelPrazo} />}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {erro('entrega')}
            {pode('nf:cadastrar') && (
              <button type="button" className="btn btn-sec" onClick={() => setCadastrando(true)}>Cadastrar NF e DOF agora (exceção)</button>
            )}
          </div>
        )}

        {passo === 1 && entrega && (
          <div className="assistente-passo">
            <p>NF {entrega.nfNumero} · {cad.nomeFornecedor(entrega.fornecedorId)}</p>
            <button type="button" className="btn btn-acao btn-grande botao-ler" onClick={() => setLendo(true)}><Icone nome="qr" /> Ler QR dos fardos</button>
            {esperados.length === 0 && <p className="aviso aviso-info">Esta entrega não indicou os fardos: leia os QR dos fardos que chegaram; os deste contrato entram nela.</p>}
            {listaEsperados}
            {erro('fardosLidos')}
          </div>
        )}

        {passo === 2 && entrega && (
          <div className="assistente-passo">
            <div className="opcoes-ata" role="radiogroup" aria-label="Conferência">
              <label className="caixa caixa-grande"><input type="radio" name="rec-conf" checked={conforme} onChange={() => setConforme(true)} /> Conforme</label>
              <label className="caixa caixa-grande"><input type="radio" name="rec-conf" checked={!conforme} onChange={() => { setConforme(false); if (!ocorrencias.length) setOcorrencias([{ chave: seq++, tipo: 'avaria', fardoId: '', descricao: '', fotos: [] }]); }} /> Com ocorrência</label>
            </div>
            {(esperados.some((id) => !lidos.includes(id)) || extras.some((id) => !avulsos.includes(id))) && (
              <p className="aviso aviso-info">O sistema já registra sozinho: {[
                ...esperados.filter((id) => !lidos.includes(id)).map((id) => `falta de ${id}`),
                ...extras.filter((id) => !avulsos.includes(id)).map((id) => `fardo desconhecido ${id}`),
              ].join('; ')}.</p>
            )}
            {!conforme && (
              <>
                {erro('ocorrencias')}
                {ocorrencias.map((o, n) => (
                  <fieldset key={o.chave} className="ocorrencia">
                    <legend>Ocorrência {n + 1}</legend>
                    <div className="linha-campos-2">
                      <div className="campo">
                        <label htmlFor={`oc-tipo-${o.chave}`}>Tipo</label>
                        <select id={`oc-tipo-${o.chave}`} value={o.tipo} onChange={(e) => mudarOcorrencia(o.chave, 'tipo', e.target.value)}>
                          {TIPO_OCORRENCIA_OPCOES.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                        </select>
                      </div>
                      <div className="campo">
                        <label htmlFor={`oc-fardo-${o.chave}`}>Fardo (opcional)</label>
                        <select id={`oc-fardo-${o.chave}`} value={o.fardoId} onChange={(e) => mudarOcorrencia(o.chave, 'fardoId', e.target.value)}>
                          <option value="">—</option>
                          {[...new Set([...esperados, ...lidos])].map((id) => <option key={id} value={id}>{id}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="campo">
                      <label htmlFor={`oc-desc-${o.chave}`}>Descrição<span className="obrig" aria-hidden="true"> *</span></label>
                      <textarea id={`oc-desc-${o.chave}`} rows={2} maxLength={500} value={o.descricao} onChange={(e) => mudarOcorrencia(o.chave, 'descricao', e.target.value)} />
                    </div>
                    <div className="campo">
                      <label htmlFor={`oc-foto-${o.chave}`}>Fotos<span className="obrig" aria-hidden="true"> *</span></label>
                      <input id={`oc-foto-${o.chave}`} type="file" accept="image/*" capture="environment" multiple onChange={(e) => mudarOcorrencia(o.chave, 'fotos', [...o.fotos, ...Array.from(e.target.files ?? [])])} />
                      {o.fotos.length > 0 && <span className="ajuda">{o.fotos.length} foto(s): {o.fotos.map((f) => f.name).join(', ')}</span>}
                    </div>
                    {erro(`ocorrencias.${n}`)}
                    <button type="button" className="btn btn-sec btn-peq" onClick={() => setOcorrencias((l) => l.filter((x) => x.chave !== o.chave))}>Remover ocorrência</button>
                  </fieldset>
                ))}
                <button type="button" className="btn btn-sec btn-peq" onClick={() => setOcorrencias((l) => [...l, { chave: seq++, tipo: 'avaria', fardoId: '', descricao: '', fotos: [] }])}>+ Ocorrência</button>
              </>
            )}
          </div>
        )}

        {passo === 3 && (
          <div className="assistente-passo">
            <p className="mudo">Onde os fardos esperam a inspeção. Sugerido o local de inspeção com mais espaço.</p>
            <ul className="escolha-entregas" role="radiogroup" aria-label="Local de espera">
              {locaisEspera.map((l) => (
                <li key={l.id}>
                  <label className={`cartao-escolha${localId === l.id ? ' escolhido' : ''}`}>
                    <input type="radio" name="rec-local" checked={localId === l.id} onChange={() => setLocalId(l.id)} />
                    <span className="cartao-escolha-titulo mono">{l.codigo}{l.id === sugerido?.id && <> <Badge tom="verde">sugerido</Badge></>}</span>
                    <span className="mudo">{l.descricao} · {numero(l.ocupacao)} de {numero(l.capacidade)} dormentes</span>
                  </label>
                </li>
              ))}
            </ul>
            {locaisEspera.length === 0 && <Vazio mensagem="Nenhum local de inspeção ativo." dica="Cadastre um em Cadastros › Locais." />}
            {erro('localEsperaId')}
          </div>
        )}

        {passo === 4 && entrega && (previa ? (
          <div className="assistente-passo">
            <div className="resumo-revisao">
              <p><strong>NF {entrega.nfNumero}</strong> · {cad.nomeFornecedor(entrega.fornecedorId)}</p>
              <p>{previa.aceitos.length} fardo(s) recebidos ({numero(previa.dormentes)} dormentes) ficam aguardando inspeção em <span className="mono">{cad.codigoLocal(localId)}</span>.</p>
              {previa.faltantes.length > 0 && <p>Falta: {previa.faltantes.join(', ')} (continuam em trânsito; podem ser recebidos depois).</p>}
              {previa.desconhecidos.length > 0 && <p>Fardo desconhecido: {previa.desconhecidos.join(', ')} (não entra; vira ocorrência).</p>}
              <p>{conforme && !previa.faltantes.length && !previa.desconhecidos.length ? 'Conforme.' : `Ocorrências: ${(conforme ? 0 : ocorrencias.length) + previa.faltantes.length + previa.desconhecidos.length}.`}</p>
            </div>
            <div className="tabela-wrap">
              <table className="tabela">
                <caption className="sr-only">Volume da DOF por espécie</caption>
                <thead><tr><th scope="col">Espécie</th><th scope="col" className="al-right">DOF</th><th scope="col" className="al-right">Recebido</th><th scope="col" className="al-right">Diferença</th></tr></thead>
                <tbody>
                  {previa.divergenciaVolume.map((d) => (
                    <tr key={d.especieId}>
                      <td>{cad.nomeEspecie(d.especieId)}</td>
                      <td className="al-right">{m3(d.documentalM3)}</td>
                      <td className="al-right">{m3(d.calculadoM3)}</td>
                      <td className="al-right">{Number.isFinite(d.percentual) ? pct(d.percentual) : 'sem DOF'} {d.acimaTolerancia && <Badge tom="vermelho">acima de 10%</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(previa.exigeJustificativa || previa.justificativaAutomatica) && (
              <div className="campo">
                {previa.exigeJustificativa
                  ? <p className="aviso aviso-critico">A divergência de volume passa de 10% (IN Ibama). Não bloqueia, mas exige justificativa e gera alerta.</p>
                  : <p className="aviso aviso-alerta">A divergência vem só dos fardos que faltaram: a justificativa já vem preenchida. Complemente se quiser.</p>}
                <label htmlFor="rec-just">Justificativa da divergência{previa.exigeJustificativa && <span className="obrig" aria-hidden="true"> *</span>}</label>
                <textarea id="rec-just" rows={3} maxLength={500} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
                {erro('justificativaDivergencia')}
              </div>
            )}
            <ul className="lista-tipos-ocorrencia">
              {!conforme && ocorrencias.map((o) => <li key={o.chave}><BadgeDe mapa={TIPO_OCORRENCIA} valor={o.tipo} /> {o.descricao} · {o.fotos.length} foto(s)</li>)}
            </ul>
          </div>
        ) : <Carregando linhas={3} />)}
      </Modal>

      <LeitorQr aberto={lendo} aoFechar={() => setLendo(false)} modo="capturar" continuo aoLer={aoLer} titulo="Ler QR dos fardos">
        {listaEsperados}
        <button type="button" className="btn btn-pri btn-grande" onClick={() => setLendo(false)}>Concluir leitura</button>
      </LeitorQr>

      <EntregaAssistente
        aberto={cadastrando} cad={cad} origem="recebimento" aoFechar={() => setCadastrando(false)}
        aoCriar={(en) => { setCadastrando(false); carregarEntregas(en.id); }}
      />
    </>
  );
}
