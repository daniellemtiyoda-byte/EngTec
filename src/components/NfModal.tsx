import { useEffect, useId, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { ApiError, mensagemSegura } from '../services/http';
import type { NotaFiscal } from '../types/models';
import { arquivoInvalido, paraNumero, rotuloClasse } from '../utils/format';
import { chaveAcessoValida, lerXmlNfe, mesmoCnpj } from '../utils/nfeXml';
import { Modal } from './Modal';

interface ItemForm { chave: number; descricao: string; especieId: string; tamanhoId: string; quantidade: string }

const CAMPOS_VAZIOS = { numero: '', serie: '1', chaveAcesso: '', fornecedorId: '', emissao: '', dofSugerido: '' };
const UNIDADES = ['UN', 'UND', 'UNID', 'PC', 'PÇ', 'PCS', 'PECA', 'PEÇA'];
let proximaChave = 1;
const itemVazio = (descricao = '', quantidade = ''): ItemForm => ({ chave: proximaChave++, descricao, especieId: '', tamanhoId: '', quantidade });

interface Props { aberto: boolean; aoFechar: () => void; aoSalvar: (nf: NotaFiscal) => void }

/** Cadastro de NF manual ou a partir do XML da NF-e (RF01/RF02). Espécie e tamanho de cada item são sempre escolhidos pelo usuário. */
export function NfModal({ aberto, aoFechar, aoSalvar }: Props) {
  const formId = useId();
  const forn = useAsync(() => servicos.fornecedores.listar({ pageSize: 100 }), []);
  const esp = useAsync(() => servicos.especies.listar({ pageSize: 100, sortBy: 'numero' }), []);
  const tam = useAsync(() => servicos.tamanhos.listar({ pageSize: 50, sortBy: 'codigo' }), []);

  const [campos, setCampos] = useState(CAMPOS_VAZIOS);
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [xml, setXml] = useState<File | null>(null);
  const [avisosXml, setAvisosXml] = useState<string[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (aberto) { setCampos(CAMPOS_VAZIOS); setItens([itemVazio()]); setXml(null); setAvisosXml([]); setErros({}); setErroGeral(undefined); }
  }, [aberto]);

  const fornecedores = forn.dados?.items ?? [];
  const campo = (nome: keyof typeof CAMPOS_VAZIOS) => ({
    id: `${formId}-${nome}`, value: campos[nome], 'aria-invalid': !!erros[nome],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCampos((c) => ({ ...c, [nome]: e.target.value })),
  });
  const alterarItem = (chave: number, mudanca: Partial<ItemForm>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));

  async function importarXml(f: File | undefined) {
    setErroGeral(undefined);
    if (!f) return;
    const invalido = arquivoInvalido(f, ['xml']);
    if (invalido) { setXml(null); return setErroGeral(invalido); }
    try {
      const d = lerXmlNfe(await f.text());
      const avisos: string[] = [];
      const fornecedor = fornecedores.find((x) => mesmoCnpj(x.cnpj, d.cnpjEmitente));
      if (!fornecedor) avisos.push(`Emitente ${d.nomeEmitente || ''} (CNPJ ${d.cnpjEmitente}) não está no cadastro de fornecedores. Selecione o fornecedor manualmente.`);
      else if (fornecedor.status === 'bloqueado') avisos.push(`O fornecedor ${fornecedor.razaoSocial} está bloqueado e não pode ser usado.`);
      for (const it of d.itens) {
        if (!UNIDADES.includes(it.unidade.toUpperCase())) avisos.push(`"${it.descricao}" está em ${it.unidade || 'unidade não informada'}: confira a quantidade em dormentes.`);
      }
      setCampos({
        numero: d.numero, serie: d.serie || '1', chaveAcesso: d.chaveAcesso ?? '', emissao: d.emissao, dofSugerido: d.dofSugerido ?? '',
        fornecedorId: fornecedor && fornecedor.status !== 'bloqueado' ? fornecedor.id : '',
      });
      setItens(d.itens.map((it) => itemVazio(it.descricao, Number.isInteger(it.quantidade) ? String(it.quantidade) : '')));
      setAvisosXml(avisos);
      setErros({});
      setXml(f);
    } catch (e) {
      setXml(null);
      setErroGeral(e instanceof Error ? e.message : 'Não foi possível ler o XML.');
    }
  }

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!campos.numero.trim()) e.numero = 'Campo obrigatório.';
    else if (!/^\d{1,9}$/.test(campos.numero.trim())) e.numero = 'Use só números (até 9 dígitos).';
    if (!campos.serie.trim()) e.serie = 'Campo obrigatório.';
    if (!campos.fornecedorId) e.fornecedorId = 'Selecione o fornecedor.';
    if (!campos.emissao) e.emissao = 'Campo obrigatório.';
    const chave = campos.chaveAcesso.replace(/\D/g, '');
    if (chave && !chaveAcessoValida(chave)) e.chaveAcesso = 'Chave inválida: são 44 dígitos e o último é o dígito verificador.';
    if (!itens.length) e.itens = 'Informe ao menos um item.';
    for (const it of itens) {
      if (!it.especieId) e[`item-${it.chave}-especieId`] = 'Selecione a espécie.';
      if (!it.tamanhoId) e[`item-${it.chave}-tamanhoId`] = 'Selecione o tamanho.';
      const q = paraNumero(it.quantidade, true);
      if (!Number.isInteger(q) || q < 1) e[`item-${it.chave}-quantidade`] = 'Quantidade inteira, mínimo 1.';
    }
    return e;
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validar();
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setErroGeral(undefined);
    try {
      const nf = await servicos.notas.cadastrar({
        numero: campos.numero.trim(), serie: campos.serie.trim(), chaveAcesso: campos.chaveAcesso.replace(/\D/g, '') || undefined,
        fornecedorId: campos.fornecedorId, emissao: campos.emissao, dofSugerido: campos.dofSugerido || undefined,
        itens: itens.map((it) => ({ descricao: it.descricao.trim() || 'Dormente de madeira', especieId: it.especieId, tamanhoId: it.tamanhoId, quantidade: paraNumero(it.quantidade, true) })),
      }, xml ?? undefined);
      aoSalvar(nf);
      aoFechar();
    } catch (err) {
      if (err instanceof ApiError && err.detalhes) setErros(err.detalhes);
      setErroGeral(mensagemSegura(err));
    } finally {
      setEnviando(false);
    }
  }

  const erro = (k: string) => erros[k] && <span className="erro-campo">{erros[k]}</span>;
  const rotulo = (nome: string, texto: string, obrig = true) => (
    <label htmlFor={`${formId}-${nome}`}>{texto}{obrig && <span className="obrig" aria-hidden="true"> *</span>}</label>
  );

  return (
    <Modal
      titulo="Cadastrar NF" aberto={aberto} aoFechar={aoFechar} largo
      rodape={<>
        <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
        <button type="submit" form={formId} className="btn btn-pri" disabled={enviando}>{enviando ? 'Enviando…' : 'Cadastrar NF'}</button>
      </>}
    >
      <form id={formId} onSubmit={enviar} noValidate>
        {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
        {(forn.erro || esp.erro || tam.erro) && <div className="aviso aviso-alerta">Não foi possível carregar fornecedores, espécies ou tamanhos.</div>}

        <div className="campo">
          <label htmlFor={`${formId}-xml`}>Importar XML da NF-e (opcional)</label>
          <input id={`${formId}-xml`} type="file" accept=".xml" onChange={(e) => void importarXml(e.target.files?.[0])} />
          <span className="ajuda">Preenche número, série, chave, emissão, fornecedor e itens. O XML fica guardado com a NF. Espécie e tamanho de cada item continuam com você.</span>
        </div>
        {avisosXml.map((a) => <div key={a} className="aviso aviso-alerta">{a}</div>)}
        {campos.dofSugerido && <div className="aviso aviso-info">As informações complementares citam o DOF nº <strong>{campos.dofSugerido}</strong>; ele será sugerido no cadastro do DOF.</div>}

        <div className="linha-campos">
          <div className="campo">{rotulo('numero', 'Número')}<input {...campo('numero')} inputMode="numeric" maxLength={9} autoComplete="off" />{erro('numero')}</div>
          <div className="campo">{rotulo('serie', 'Série')}<input {...campo('serie')} maxLength={3} autoComplete="off" />{erro('serie')}</div>
          <div className="campo">{rotulo('emissao', 'Emissão')}<input {...campo('emissao')} type="date" />{erro('emissao')}</div>
        </div>
        <div className="campo">
          {rotulo('chaveAcesso', 'Chave de acesso', false)}
          <input {...campo('chaveAcesso')} inputMode="numeric" maxLength={54} autoComplete="off" />
          <span className="ajuda">44 dígitos. Uma NF com chave já cadastrada é recusada.</span>{erro('chaveAcesso')}
        </div>
        <div className="campo">
          {rotulo('fornecedorId', 'Fornecedor')}
          <select {...campo('fornecedorId')}>
            <option value="">Selecione…</option>
            {fornecedores.filter((f) => f.status !== 'bloqueado').map((f) => <option key={f.id} value={f.id}>{f.razaoSocial} ({f.cnpj})</option>)}
          </select>{erro('fornecedorId')}
        </div>

        <h3>Itens</h3>
        {erro('itens')}
        {itens.map((it, n) => (
          <div className="bloco-item" key={it.chave}>
            <div className="bloco-item-topo">
              <strong>Item {n + 1}</strong>
              {itens.length > 1 && <button type="button" className="btn btn-sec btn-peq" onClick={() => setItens((l) => l.filter((x) => x.chave !== it.chave))}>Remover item</button>}
            </div>
            <div className="campo">
              <label htmlFor={`${formId}-d${it.chave}`}>Descrição na NF</label>
              <input id={`${formId}-d${it.chave}`} value={it.descricao} maxLength={120} onChange={(e) => alterarItem(it.chave, { descricao: e.target.value })} />
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label htmlFor={`${formId}-e${it.chave}`}>Espécie<span className="obrig" aria-hidden="true"> *</span></label>
                <select id={`${formId}-e${it.chave}`} value={it.especieId} aria-invalid={!!erros[`item-${it.chave}-especieId`]} onChange={(e) => alterarItem(it.chave, { especieId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {esp.dados?.items.map((e) => <option key={e.id} value={e.id}>{e.nomeCientifico} · {rotuloClasse(e.classe)}</option>)}
                </select>{erro(`item-${it.chave}-especieId`)}
              </div>
              <div className="campo">
                <label htmlFor={`${formId}-t${it.chave}`}>Tamanho<span className="obrig" aria-hidden="true"> *</span></label>
                <select id={`${formId}-t${it.chave}`} value={it.tamanhoId} aria-invalid={!!erros[`item-${it.chave}-tamanhoId`]} onChange={(e) => alterarItem(it.chave, { tamanhoId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {tam.dados?.items.map((t) => <option key={t.id} value={t.id}>{t.codigo} ({t.larguraCm}×{t.alturaCm}×{t.comprimentoCm} cm){t.medidas === 'provisorio' ? ' · provisório' : ''}</option>)}
                </select>{erro(`item-${it.chave}-tamanhoId`)}
              </div>
              <div className="campo">
                <label htmlFor={`${formId}-q${it.chave}`}>Quantidade (un.)<span className="obrig" aria-hidden="true"> *</span></label>
                <input id={`${formId}-q${it.chave}`} value={it.quantidade} inputMode="numeric" aria-invalid={!!erros[`item-${it.chave}-quantidade`]} onChange={(e) => alterarItem(it.chave, { quantidade: e.target.value })} />
                {erro(`item-${it.chave}-quantidade`)}
              </div>
            </div>
          </div>
        ))}
        <div><button type="button" className="btn btn-sec" onClick={() => setItens((l) => [...l, itemVazio()])}>Adicionar item</button></div>
      </form>
    </Modal>
  );
}
