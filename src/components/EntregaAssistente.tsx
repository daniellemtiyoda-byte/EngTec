import { useEffect, useState } from 'react';
import { tamanhosDaParcela } from '../dominio/contratos';
import { nivelPrazo, prazoDeclaracao } from '../dominio/parametros';
import { NIVEL_PRAZO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import type { Cadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/erros';
import type { Entrega, Fardo } from '../types/models';
import { arquivoInvalido, data, hojeSP, m3, numero, paraNumero } from '../utils/format';
import { chaveAcessoValida, lerXmlNfe, mesmoCnpj, tamanhoDoItemNfe } from '../utils/nfeXml';
import { BadgeDe } from './Badge';
import { Modal } from './Modal';
import { ProgressoPassos } from './Passos';

const PASSOS = ['Nota fiscal', 'DOF', 'Boletim e relatório', 'Fardos da entrega', 'Revisar e confirmar'];
/** Erros do serviço levam de volta ao passo do campo. */
const passoDoCampo = (k: string) => (k.startsWith('dof') ? 1 : k.startsWith('boletim') || k.startsWith('relatorio') ? 2 : k.startsWith('fardos') ? 3 : 0);

interface LinhaNf { chave: number; descricao?: string; tamanhoXmlId?: string; itemContratoId: string; quantidade: string; volume: string; volumeManual: boolean }
interface LinhaDof { especieId: string; volume: string }
interface LinhaBoletim { chave: number; tamanhoId: string; especieId: string; quantidade: string }
let seq = 1;

interface Props {
  aberto: boolean;
  cad: Cadastros;
  /** 'recebimento': cadastro feito na hora, como exceção, a partir do assistente de recebimento. */
  origem?: 'cadastro' | 'recebimento';
  aoFechar: () => void;
  aoCriar: (en: Entrega) => void;
}

/**
 * Cadastro de NF e DOF antes da chegada (seção 9.9 do plano), que cria a entrega "a caminho", vinculada a uma parcela
 * do cronograma do contrato. A NF vem do XML (lido no navegador, sem executar nada) ou é digitada; a DOF traz o volume
 * por espécie digitado do documento; o Boletim de Inspeção (empresa inspetora e quantidades aprovadas por tamanho e
 * espécie) e o Relatório Técnico entram como anexos, opcionais. O servidor valida tudo de novo.
 */
export function EntregaAssistente({ aberto, cad, origem = 'cadastro', aoFechar, aoCriar }: Props) {
  const contratos = useAsync(() => servicos.contratos.listar({ pageSize: 500, filters: { situacao: 'vigente' } }), [aberto]);
  const [passo, setPasso] = useState(0);
  const [nf, setNf] = useState({ numero: '', serie: '1', chaveAcesso: '', emissao: '', contratoId: '' });
  const [parcela, setParcela] = useState('');
  const [reentrega, setReentrega] = useState(false);
  const [boletim, setBoletim] = useState({ numero: '', data: '', empresaInspetoraId: '' });
  const [linhasBoletim, setLinhasBoletim] = useState<LinhaBoletim[]>([]);
  const [arqBoletim, setArqBoletim] = useState<File>();
  const [relatorio, setRelatorio] = useState({ numero: '', data: '' });
  const [arqRelatorio, setArqRelatorio] = useState<File>();
  const [itens, setItens] = useState<LinhaNf[]>([]);
  const [xml, setXml] = useState<File>();
  const [avisoXml, setAvisoXml] = useState<string>();
  const [dof, setDof] = useState({ numero: '', validade: '' });
  const [volumes, setVolumes] = useState<LinhaDof[]>([]);
  const [pdf, setPdf] = useState<File>();
  const [fardosIds, setFardosIds] = useState<string[]>([]);
  const [semEntrega, setSemEntrega] = useState<Fardo[]>();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setPasso(0); setNf({ numero: '', serie: '1', chaveAcesso: '', emissao: '', contratoId: '' }); setItens([{ chave: seq++, itemContratoId: '', quantidade: '', volume: '', volumeManual: false }]);
    setXml(undefined); setAvisoXml(undefined); setDof({ numero: '', validade: '' }); setVolumes([]); setPdf(undefined); setFardosIds([]); setSemEntrega(undefined);
    setParcela(''); setReentrega(false); setBoletim({ numero: '', data: '', empresaInspetoraId: '' }); setLinhasBoletim([]); setArqBoletim(undefined);
    setRelatorio({ numero: '', data: '' }); setArqRelatorio(undefined);
    setErros({}); setErroGeral(undefined);
  }, [aberto]);

  const vigentes = contratos.dados?.items ?? [];
  const contrato = vigentes.find((c) => c.id === nf.contratoId);
  const fornecedor = contrato && cad.fornecedores.get(contrato.fornecedorId);
  const especiesFornecedor = (fornecedor?.especiesIds ?? []).filter((id) => cad.especies.get(id));
  // Parcela única do contrato já vem escolhida; ao trocar de contrato, a parcela de outro contrato não vale.
  useEffect(() => { setParcela(contrato && contrato.parcelas.length === 1 ? '1' : ''); }, [contrato?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Tamanhos da parcela escolhida, com o saldo de cada um: só eles aparecem no select de item. */
  const itensDaParcela = tamanhosDaParcela(contrato, parcela);
  /** Volume calculado do item (quantidade × volume do tamanho), usado até a pessoa digitar outro. */
  const volumeCalculado = (itemContratoId: string, quantidade: string) => {
    const item = contrato?.itens.find((i) => i.id === itemContratoId);
    const t = item && cad.tamanhos.get(item.tamanhoId);
    const q = paraNumero(quantidade, true);
    return t && q > 0 ? String(Math.round(q * t.volumeM3 * 1000) / 1000).replace('.', ',') : '';
  };
  const mudarItem = (chave: number, campo: 'itemContratoId' | 'quantidade' | 'volume', valor: string) => setItens((l) => l.map((i) => {
    if (i.chave !== chave) return i;
    const n = { ...i, [campo]: valor, volumeManual: campo === 'volume' ? true : i.volumeManual };
    if (campo !== 'volume' && !n.volumeManual) n.volume = volumeCalculado(n.itemContratoId, n.quantidade);
    return n;
  }));

  async function importarXml(arquivo?: File) {
    setAvisoXml(undefined);
    if (!arquivo) return;
    const invalido = arquivoInvalido(arquivo, ['xml']);
    if (invalido) { setAvisoXml(invalido); return; }
    try {
      const d = lerXmlNfe(await arquivo.text());
      const forn = (cad.listas?.fornecedores ?? []).find((f) => mesmoCnpj(f.cnpj, d.cnpjEmitente));
      const doFornecedor = vigentes.filter((c) => c.fornecedorId === forn?.id);
      const contratoId = doFornecedor.length === 1 ? doFornecedor[0].id : '';
      setNf({ numero: d.numero, serie: d.serie || '1', chaveAcesso: d.chaveAcesso ?? '', emissao: d.emissao, contratoId });
      const unico = doFornecedor.length === 1 && doFornecedor[0].itens.length === 1 ? doFornecedor[0].itens[0].id : '';
      const tamanhosCad = Array.from(cad.tamanhos.values());
      setItens(d.itens.map((i) => ({ chave: seq++, descricao: i.descricao, tamanhoXmlId: tamanhoDoItemNfe(i, tamanhosCad), itemContratoId: unico, quantidade: String(Math.round(i.quantidade)), volume: '', volumeManual: false })));
      if (d.dofSugerido) setDof((x) => ({ ...x, numero: d.dofSugerido! }));
      setXml(arquivo);
      setAvisoXml(forn
        ? `XML lido: NF ${d.numero} de ${forn.razaoSocial}.${doFornecedor.length === 1 ? '' : ' Escolha o contrato.'} Indique o item do contrato de cada produto.`
        : `O CNPJ do emitente (${d.cnpjEmitente}) não é de nenhum fornecedor cadastrado. Confira o XML ou cadastre o fornecedor.`);
    } catch (e) {
      setAvisoXml(e instanceof Error ? e.message : 'Não foi possível ler o XML.');
    }
  }

  // Ao escolher o contrato ou a parcela (ou importar), ajusta os itens aos tamanhos da parcela e recalcula os volumes automáticos:
  // limpa o item que não pertence à parcela; liga o item do XML ao tamanho igual (sem sobrescrever o que a pessoa escolheu);
  // com um tamanho só na parcela, já seleciona.
  useEffect(() => {
    setItens((l) => l.map((i0) => {
      const daParcela = (id: string) => itensDaParcela.some((x) => x.item.id === id);
      let ligado = daParcela(i0.itemContratoId) ? i0.itemContratoId : '';
      if (!ligado && i0.tamanhoXmlId) ligado = itensDaParcela.find((x) => x.item.tamanhoId === i0.tamanhoXmlId)?.item.id ?? '';
      if (!ligado && itensDaParcela.length === 1) ligado = itensDaParcela[0].item.id;
      const i = { ...i0, itemContratoId: ligado };
      return i.volumeManual ? i : { ...i, volume: volumeCalculado(i.itemContratoId, i.quantidade) };
    }));
  }, [nf.contratoId, parcela, contratos.dados]); // eslint-disable-line react-hooks/exhaustive-deps

  function validarNf(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!nf.contratoId) e['nf.contratoId'] = 'Escolha o contrato.';
    if (!parcela) e.parcela = 'Escolha a parcela do cronograma.';
    if (!nf.numero.trim()) e['nf.numero'] = 'Informe o número da NF.';
    const chave = nf.chaveAcesso.replace(/\D/g, '');
    if (!chaveAcessoValida(chave)) e['nf.chaveAcesso'] = 'A chave tem 44 dígitos e dígito verificador válido.';
    else if (fornecedor && !mesmoCnpj(chave.slice(6, 20), fornecedor.cnpj)) e['nf.chaveAcesso'] = `A chave não é do CNPJ de ${fornecedor.razaoSocial}.`;
    if (!nf.emissao) e['nf.emissao'] = 'Informe a emissão.';
    if (!itens.length) e['nf.itens'] = 'Informe ao menos um item.';
    itens.forEach((i, n) => {
      if (!i.itemContratoId) e[`nf.itens.${n}`] = 'Escolha o item do contrato.';
      else if (!(paraNumero(i.quantidade, true) > 0)) e[`nf.itens.${n}`] = 'Quantidade em unidades, maior que zero.';
      else if (!(paraNumero(i.volume) >= 0)) e[`nf.itens.${n}`] = 'Volume em m³.';
    });
    return e;
  }
  function validarDof(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!dof.numero.trim()) e['dof.numero'] = 'Informe o número da DOF: sem DOF não há entrega.';
    if (!dof.validade) e['dof.validade'] = 'Informe a validade.';
    volumes.forEach((v, n) => { if (v.volume.trim() && !(paraNumero(v.volume) > 0)) e[`dof.volumes.${n}`] = 'Volume em m³, maior que zero.'; });
    if (!volumes.some((v) => paraNumero(v.volume) > 0)) e['dof.volumes'] = 'Digite o volume de ao menos uma espécie, como está na DOF.';
    if (pdf) { const inv = arquivoInvalido(pdf, ['pdf']); if (inv) e['dof.pdf'] = inv; }
    return e;
  }

  function validarBoletim(): Record<string, string> {
    const e: Record<string, string> = {};
    if (boletim.numero.trim()) {
      if (!boletim.data) e['boletim.data'] = 'Informe a data do boletim.';
      if (!boletim.empresaInspetoraId) e['boletim.empresaInspetoraId'] = 'Escolha a empresa inspetora.';
      linhasBoletim.forEach((l, n) => { if (!l.tamanhoId || !l.especieId || !(paraNumero(l.quantidade, true) > 0)) e[`boletim.itens.${n}`] = 'Tamanho, espécie e quantidade aprovada.'; });
      if (arqBoletim) { const inv = arquivoInvalido(arqBoletim, ['pdf']); if (inv) e['boletim.arquivo'] = inv; }
    }
    if (relatorio.numero.trim() && !relatorio.data) e['relatorioTecnico.data'] = 'Informe a data do relatório.';
    if (arqRelatorio) { const inv = arquivoInvalido(arqRelatorio, ['pdf']); if (inv) e['relatorioTecnico.arquivo'] = inv; }
    return e;
  }

  /**
   * Volumes da DOF por espécie: um campo por espécie que o fornecedor fornece (o contrato não define espécie), VAZIO.
   * O volume é digitado do documento, nunca copiado da NF; espécie que não está na DOF fica em branco.
   */
  function prepararDof() {
    setVolumes((atual) => especiesFornecedor.map((especieId) => atual.find((x) => x.especieId === especieId) ?? { especieId, volume: '' }));
  }

  async function avancar() {
    setErroGeral(undefined);
    const e = passo === 0 ? validarNf() : passo === 1 ? validarDof() : passo === 2 ? validarBoletim() : {};
    setErros(e);
    if (Object.keys(e).length) return;
    if (passo === 0) prepararDof();
    if (passo === 2 && contrato) {
      setSemEntrega(undefined);
      servicos.documentos.fardosSemEntrega(contrato.id).then(setSemEntrega).catch(() => setSemEntrega([]));
    }
    setPasso((p) => p + 1);
  }

  async function confirmar() {
    setEnviando(true); setErroGeral(undefined);
    try {
      const en = await servicos.documentos.cadastrarEntrega({
        origem, fardosIds, parcela: Number(parcela), reentrega,
        nf: { ...nf, chaveAcesso: nf.chaveAcesso.replace(/\D/g, ''), itens: itens.map((i) => ({ itemContratoId: i.itemContratoId, quantidade: paraNumero(i.quantidade, true), volumeM3: paraNumero(i.volume) })) },
        dof: { ...dof, volumes: volumes.filter((v) => paraNumero(v.volume) > 0).map((v) => ({ especieId: v.especieId, volumeM3: paraNumero(v.volume) })) },
        boletim: boletim.numero.trim() ? { ...boletim, itens: linhasBoletim.map((l) => ({ tamanhoId: l.tamanhoId, especieId: l.especieId, quantidade: paraNumero(l.quantidade, true) })) } : undefined,
        relatorioTecnico: relatorio.numero.trim() ? relatorio : undefined,
      }, { xml, pdf, boletim: arqBoletim, relatorio: arqRelatorio });
      aoCriar(en);
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
  const prazo = dof.validade ? prazoDeclaracao(dof.validade) : undefined;

  return (
    <Modal
      largo titulo={origem === 'recebimento' ? 'Cadastrar NF e DOF agora' : 'Cadastrar NF e DOF'} aberto={aberto} aoFechar={aoFechar}
      rodape={<>
        {passo > 0 ? <button type="button" className="btn btn-sec" onClick={() => setPasso((p) => p - 1)} disabled={enviando}>Voltar</button>
          : <button type="button" className="btn btn-sec" onClick={aoFechar}>Cancelar</button>}
        {passo < 4
          ? <button type="button" className="btn btn-pri" onClick={() => void avancar()}>Avançar</button>
          : <button type="button" className="btn btn-pri" onClick={() => void confirmar()} disabled={enviando}>{enviando ? 'Cadastrando…' : 'Cadastrar e criar a entrega'}</button>}
      </>}
    >
      <ProgressoPassos passos={PASSOS} atual={passo} />
      {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
      {origem === 'recebimento' && passo === 0 && <p className="aviso aviso-alerta">Exceção: o material chegou sem NF e DOF cadastradas. O normal é cadastrar antes da chegada, em NF e DOF.</p>}

      {passo === 0 && (
        <div className="assistente-passo">
          <div className="campo">
            <label htmlFor="ent-xml">Importar o XML da NF-e (opcional)</label>
            <input id="ent-xml" type="file" accept=".xml" onChange={(e) => void importarXml(e.target.files?.[0])} />
            <span className="ajuda">O arquivo é lido no navegador só para preencher os campos; o original vai junto com o cadastro.</span>
            {avisoXml && <span className="ajuda" role="status">{avisoXml}</span>}
          </div>
          <div className="linha-campos-2">
            <div className="campo">
              <label htmlFor="ent-contrato">Contrato<span className="obrig" aria-hidden="true"> *</span></label>
              <select id="ent-contrato" value={nf.contratoId} onChange={(e) => setNf((x) => ({ ...x, contratoId: e.target.value }))} aria-invalid={!!erros['nf.contratoId']}>
                <option value="">Selecione…</option>
                {vigentes.map((c) => <option key={c.id} value={c.id}>{c.numero} · {cad.nomeFornecedor(c.fornecedorId)}</option>)}
              </select>
              {erro('nf.contratoId')}
            </div>
            <div className="campo">
              <label htmlFor="ent-parcela">Parcela do cronograma<span className="obrig" aria-hidden="true"> *</span></label>
              <select id="ent-parcela" value={parcela} onChange={(e) => setParcela(e.target.value)} disabled={!contrato} aria-invalid={!!erros.parcela}>
                <option value="">{contrato ? 'Selecione…' : 'Escolha o contrato'}</option>
                {contrato?.parcelas.map((p) => <option key={p.numero} value={p.numero}>{p.numero}ª · {numero(p.recebidos)} de {numero(p.quantidade)} · até {data(p.fim)}</option>)}
              </select>
              {erro('parcela')}
            </div>
            <div className="campo">
              <label htmlFor="ent-numero">Número da NF<span className="obrig" aria-hidden="true"> *</span></label>
              <input id="ent-numero" value={nf.numero} inputMode="numeric" maxLength={9} onChange={(e) => setNf((x) => ({ ...x, numero: e.target.value }))} aria-invalid={!!erros['nf.numero']} />
              {erro('nf.numero')}
            </div>
            <div className="campo">
              <label htmlFor="ent-serie">Série</label>
              <input id="ent-serie" value={nf.serie} maxLength={3} onChange={(e) => setNf((x) => ({ ...x, serie: e.target.value }))} />
            </div>
            <div className="campo">
              <label htmlFor="ent-emissao">Emissão<span className="obrig" aria-hidden="true"> *</span></label>
              <input id="ent-emissao" type="date" value={nf.emissao} onChange={(e) => setNf((x) => ({ ...x, emissao: e.target.value }))} aria-invalid={!!erros['nf.emissao']} />
              {erro('nf.emissao')}
            </div>
          </div>
          <div className="campo">
            <label htmlFor="ent-chave">Chave de acesso (44 dígitos)<span className="obrig" aria-hidden="true"> *</span></label>
            <input id="ent-chave" className="mono" value={nf.chaveAcesso} inputMode="numeric" maxLength={54} onChange={(e) => setNf((x) => ({ ...x, chaveAcesso: e.target.value }))} aria-invalid={!!erros['nf.chaveAcesso']} />
            <span className="ajuda">Chave já cadastrada é recusada; a chave tem de ser do CNPJ do fornecedor do contrato.</span>
            {erro('nf.chaveAcesso')}
          </div>
          <label className="caixa">
            <input type="checkbox" checked={reentrega} onChange={(e) => setReentrega(e.target.checked)} /> Reentrega (reposição de reprovados)
          </label>
          <span className="ajuda">A reentrega só é aceita depois que o fornecedor retirou os reprovados deste contrato.</span>
          {erro('reentrega')}
          <fieldset className="secao-formulario">
            <legend>Itens da NF</legend>
            {erro('nf.itens')}
            {itens.map((i, n) => (
              <div key={i.chave} className="linha-item-nf" role="group" aria-label={`Item ${n + 1}`}>
                {i.descricao && <span className="mudo linha-item-descricao">No XML: {i.descricao}</span>}
                <div className="campo">
                  <label htmlFor={`ent-item-${i.chave}`}>Item do contrato</label>
                  <select id={`ent-item-${i.chave}`} value={i.itemContratoId} onChange={(e) => mudarItem(i.chave, 'itemContratoId', e.target.value)} disabled={!contrato || !parcela}>
                    <option value="">{!contrato ? 'Escolha o contrato' : !parcela ? 'Escolha a parcela' : 'Selecione…'}</option>
                    {itensDaParcela.map(({ item, saldo }) => <option key={item.id} value={item.id}>{cad.descreverTamanho(item.tamanhoId)} · saldo {numero(saldo)}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor={`ent-qtd-${i.chave}`}>Quantidade (un)</label>
                  <input id={`ent-qtd-${i.chave}`} value={i.quantidade} inputMode="numeric" maxLength={6} onChange={(e) => mudarItem(i.chave, 'quantidade', e.target.value)} />
                </div>
                <div className="campo">
                  <label htmlFor={`ent-vol-${i.chave}`}>Volume (m³)</label>
                  <input id={`ent-vol-${i.chave}`} value={i.volume} inputMode="decimal" maxLength={12} onChange={(e) => mudarItem(i.chave, 'volume', e.target.value)} />
                </div>
                <button type="button" className="btn btn-sec btn-peq" disabled={itens.length === 1} onClick={() => setItens((l) => l.filter((x) => x.chave !== i.chave))}>Remover</button>
                {erro(`nf.itens.${n}`)}
              </div>
            ))}
            <button type="button" className="btn btn-sec btn-peq" onClick={() => setItens((l) => [...l, { chave: seq++, itemContratoId: '', quantidade: '', volume: '', volumeManual: false }])}>+ Item</button>
            <span className="ajuda">O volume vem calculado pela quantidade e pelo tamanho do item; corrija se a nota trouxer outro.</span>
          </fieldset>
        </div>
      )}

      {passo === 1 && (
        <div className="assistente-passo">
          <div className="linha-campos-2">
            <div className="campo">
              <label htmlFor="ent-dof">Número da DOF<span className="obrig" aria-hidden="true"> *</span></label>
              <input id="ent-dof" className="mono" value={dof.numero} inputMode="numeric" maxLength={20} onChange={(e) => setDof((x) => ({ ...x, numero: e.target.value }))} aria-invalid={!!erros['dof.numero']} />
              {erro('dof.numero')}
            </div>
            <div className="campo">
              <label htmlFor="ent-validade">Validade<span className="obrig" aria-hidden="true"> *</span></label>
              <input id="ent-validade" type="date" value={dof.validade} onChange={(e) => setDof((x) => ({ ...x, validade: e.target.value }))} aria-invalid={!!erros['dof.validade']} />
              {prazo && <span className="ajuda">Prazo de declaração no Sinaflor: {data(prazo)} (dia seguinte à validade).</span>}
              {erro('dof.validade')}
            </div>
          </div>
          <fieldset className="secao-formulario">
            <legend>Volume por espécie, como no documento</legend>
            {erro('dof.volumes')}
            {volumes.map((v, n) => (
              <div key={v.especieId} className="campo">
                <label htmlFor={`ent-dofvol-${v.especieId}`}>{cad.nomeEspecie(v.especieId)} (m³)<span className="obrig" aria-hidden="true"> *</span></label>
                <input id={`ent-dofvol-${v.especieId}`} value={v.volume} inputMode="decimal" maxLength={12} onChange={(e) => setVolumes((l) => l.map((x) => (x.especieId === v.especieId ? { ...x, volume: e.target.value } : x)))} />
                {erro(`dof.volumes.${n}`)}
              </div>
            ))}
            <span className="ajuda">Digite o volume que está na DOF, espécie por espécie (não vem da NF); deixe em branco a espécie que não está nela. A diferença para o recebido aparece no recebimento e, depois da inspeção, para o volume medido.</span>
          </fieldset>
          <div className="campo">
            <label htmlFor="ent-pdf">PDF da DOF (opcional)</label>
            <input id="ent-pdf" type="file" accept=".pdf" onChange={(e) => setPdf(e.target.files?.[0])} />
            {erro('dof.pdf')}
          </div>
        </div>
      )}

      {passo === 2 && (
        <div className="assistente-passo">
          <p className="mudo">Opcional: os documentos do fornecedor que acompanham o lote. A empresa inspetora (acreditada pelo INMETRO, ex. IPT, UFV) vem do boletim.</p>
          <fieldset className="secao-formulario">
            <legend>Boletim de Inspeção</legend>
            <div className="linha-campos-2">
              <div className="campo">
                <label htmlFor="ent-bi-num">Número</label>
                <input id="ent-bi-num" className="mono" value={boletim.numero} maxLength={30} onChange={(e) => setBoletim((x) => ({ ...x, numero: e.target.value }))} />
              </div>
              <div className="campo">
                <label htmlFor="ent-bi-data">Data</label>
                <input id="ent-bi-data" type="date" value={boletim.data} onChange={(e) => setBoletim((x) => ({ ...x, data: e.target.value }))} />
                {erro('boletim.data')}
              </div>
              <div className="campo">
                <label htmlFor="ent-bi-emp">Empresa inspetora</label>
                <select id="ent-bi-emp" value={boletim.empresaInspetoraId} onChange={(e) => setBoletim((x) => ({ ...x, empresaInspetoraId: e.target.value }))}>
                  <option value="">Selecione…</option>
                  {(cad.listas?.empresas ?? []).filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
                {erro('boletim.empresaInspetoraId')}
              </div>
              <div className="campo">
                <label htmlFor="ent-bi-pdf">PDF do boletim</label>
                <input id="ent-bi-pdf" type="file" accept=".pdf" onChange={(e) => setArqBoletim(e.target.files?.[0])} />
                {erro('boletim.arquivo')}
              </div>
            </div>
            <p className="mudo">Aprovados por tamanho e espécie:</p>
            {linhasBoletim.map((l, n) => (
              <div key={l.chave} className="linha-item-nf" role="group" aria-label={`Linha ${n + 1} do boletim`}>
                <div className="campo">
                  <label htmlFor={`ent-bi-t-${l.chave}`}>Tamanho</label>
                  <select id={`ent-bi-t-${l.chave}`} value={l.tamanhoId} onChange={(e) => setLinhasBoletim((x) => x.map((y) => (y.chave === l.chave ? { ...y, tamanhoId: e.target.value } : y)))}>
                    <option value="">Selecione…</option>
                    {contrato?.itens.map((it) => <option key={it.id} value={it.tamanhoId}>{cad.descreverTamanho(it.tamanhoId)}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor={`ent-bi-e-${l.chave}`}>Espécie</label>
                  <select id={`ent-bi-e-${l.chave}`} value={l.especieId} onChange={(e) => setLinhasBoletim((x) => x.map((y) => (y.chave === l.chave ? { ...y, especieId: e.target.value } : y)))}>
                    <option value="">Selecione…</option>
                    {especiesFornecedor.map((id) => <option key={id} value={id}>{cad.nomeEspecie(id)}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor={`ent-bi-q-${l.chave}`}>Aprovados</label>
                  <input id={`ent-bi-q-${l.chave}`} value={l.quantidade} inputMode="numeric" maxLength={6} onChange={(e) => setLinhasBoletim((x) => x.map((y) => (y.chave === l.chave ? { ...y, quantidade: e.target.value } : y)))} />
                </div>
                <button type="button" className="btn btn-sec btn-peq" onClick={() => setLinhasBoletim((x) => x.filter((y) => y.chave !== l.chave))}>Remover</button>
                {erro(`boletim.itens.${n}`)}
              </div>
            ))}
            <button type="button" className="btn btn-sec btn-peq" onClick={() => setLinhasBoletim((x) => [...x, { chave: seq++, tamanhoId: '', especieId: '', quantidade: '' }])}>+ Linha</button>
          </fieldset>
          <fieldset className="secao-formulario">
            <legend>Relatório Técnico do lote</legend>
            <div className="linha-campos-2">
              <div className="campo">
                <label htmlFor="ent-rt-num">Número</label>
                <input id="ent-rt-num" className="mono" value={relatorio.numero} maxLength={30} onChange={(e) => setRelatorio((x) => ({ ...x, numero: e.target.value }))} />
              </div>
              <div className="campo">
                <label htmlFor="ent-rt-data">Data</label>
                <input id="ent-rt-data" type="date" value={relatorio.data} onChange={(e) => setRelatorio((x) => ({ ...x, data: e.target.value }))} />
                {erro('relatorioTecnico.data')}
              </div>
              <div className="campo">
                <label htmlFor="ent-rt-pdf">PDF do relatório</label>
                <input id="ent-rt-pdf" type="file" accept=".pdf" onChange={(e) => setArqRelatorio(e.target.files?.[0])} />
                {erro('relatorioTecnico.arquivo')}
              </div>
            </div>
          </fieldset>
        </div>
      )}

      {passo === 3 && (
        <div className="assistente-passo">
          <p className="mudo">Opcional: indique os fardos que vêm nesta entrega, se o fornecedor informou. Sem indicar, no recebimento entra todo fardo lido deste contrato que ainda não esteja em outra entrega.</p>
          {semEntrega === undefined ? <p className="mudo">Carregando…</p> : semEntrega.length === 0 ? (
            <p className="aviso aviso-info">Nenhum fardo emitido deste contrato está sem entrega. Os fardos serão reconhecidos na leitura do recebimento.</p>
          ) : (
            <div className="lista-marcar">
              {semEntrega.map((f) => (
                <label key={f.id} className="caixa"><input type="checkbox" checked={fardosIds.includes(f.id)} onChange={() => setFardosIds((l) => (l.includes(f.id) ? l.filter((x) => x !== f.id) : [...l, f.id]))} /> <span className="mono">{f.id}</span> · {f.quantidadeInicial} dormentes</label>
              ))}
            </div>
          )}
          {erro('fardosIds')}
        </div>
      )}

      {passo === 4 && contrato && (
        <div className="resumo-revisao">
          <p><strong>NF {nf.numero}</strong> (série {nf.serie}) · {fornecedor?.razaoSocial} · contrato <span className="mono">{contrato.numero}</span> · {parcela}ª parcela{reentrega && ' · reentrega'} · emitida em {data(nf.emissao)}</p>
          <p className="mono quebra-palavra">{nf.chaveAcesso.replace(/\D/g, '')}</p>
          <ul>{itens.map((i) => { const it = contrato.itens.find((x) => x.id === i.itemContratoId); return <li key={i.chave}>{it ? cad.descreverTamanho(it.tamanhoId) : '—'}: {numero(paraNumero(i.quantidade, true))} un · {m3(paraNumero(i.volume) || 0)}</li>; })}</ul>
          <p><strong>DOF {dof.numero}</strong> · validade {data(dof.validade)} · {volumes.filter((v) => paraNumero(v.volume) > 0).map((v) => `${cad.nomeEspecie(v.especieId)} ${m3(paraNumero(v.volume))}`).join(', ')}</p>
          {boletim.numero.trim() && <p><strong>Boletim {boletim.numero}</strong> · {cad.nomeEmpresa(boletim.empresaInspetoraId)} · {numero(linhasBoletim.reduce((t, l) => t + (paraNumero(l.quantidade, true) || 0), 0))} aprovados{arqBoletim && ` · ${arqBoletim.name}`}</p>}
          {relatorio.numero.trim() && <p><strong>Relatório Técnico {relatorio.numero}</strong> · {data(relatorio.data)}{arqRelatorio && ` · ${arqRelatorio.name}`}</p>}
          {prazo && <p>Prazo de declaração no Sinaflor: {data(prazo)} <BadgeDe mapa={NIVEL_PRAZO} valor={nivelPrazo(prazo, hojeSP())} /></p>}
          <p>{fardosIds.length ? `Fardos indicados: ${fardosIds.join(', ')}.` : 'Sem fardos indicados: entram os lidos no recebimento.'}{xml && ` XML: ${xml.name}.`}{pdf && ` PDF: ${pdf.name}.`}</p>
          <p className="mudo">Ao confirmar, a entrega fica "A caminho" em Recebimentos.</p>
        </div>
      )}
    </Modal>
  );
}
