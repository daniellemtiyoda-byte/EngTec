import { PERFIS, type Perfil } from '../../dominio/permissoes';
import type { Inventario, Parametros, Usuario } from '../../types/models';
import { VERSAO_ESTADO, type Estado } from '../mock/estado';

/**
 * Mapa entre o estado do app (o mesmo formato do mock, `mock/estado.ts`) e as linhas das tabelas do Supabase
 * (`supabase/migrations/0001_tabelas.sql`). É usado nos dois sentidos: `paraLinhas` gera a carga da demonstração
 * (seed) e `deLinhas` monta o estado a partir do que o banco devolve, para as telas usarem as mesmas consultas do mock.
 * As linhas chegam como JSON (PostgREST ou `to_jsonb` no teste): data em texto, número como número.
 */
export type Linha = Record<string, unknown>;
export type Linhas = Record<string, Linha[]>;

/** Ordem de carga (as chaves estrangeiras circulares entre entrega, NF e emissão são adiadas para o fim da transação). */
export const TABELAS = [
  'especies', 'tamanhos', 'tratamentos', 'empresas_inspetoras', 'locais', 'fornecedores', 'atas', 'ata_itens', 'contratos',
  'contrato_itens', 'contrato_parcelas', 'emissoes', 'nfs', 'nf_itens', 'dofs', 'dof_volumes', 'entregas', 'fardos', 'dormentes',
  'recebimentos', 'inspecoes', 'movimentacoes', 'rmes', 'rme_itens', 'rme_separacao', 'eventos', 'destinacoes', 'saldos_dof',
  'saldos_dof_itens', 'perdas', 'inventarios', 'inventario_esperados', 'inventario_leituras', 'inventario_locais',
  'inventario_diferencas', 'parametros', 'niveis_estoque', 'feriados', 'sequencias',
] as const;

// ---------------------------------------------------------------------------------------------------------------
// Estado → linhas
// ---------------------------------------------------------------------------------------------------------------

const n = <T>(v: T | undefined) => (v === undefined ? null : v);

export function paraLinhas(e: Estado): Linhas {
  const L: Linhas = Object.fromEntries(TABELAS.map((t) => [t, []]));
  const add = (t: (typeof TABELAS)[number], linha: Linha) => L[t].push(linha);

  for (const x of e.especies) add('especies', { id: x.id, nome_cientifico: x.nomeCientifico, nome_popular: x.nomePopular, ativo: x.ativo });
  for (const x of e.tamanhos) add('tamanhos', { id: x.id, codigo: x.codigo, uso: x.uso, comprimento_cm: x.comprimentoCm, largura_cm: x.larguraCm, altura_cm: x.alturaCm, medidas: x.medidas, ativo: x.ativo });
  for (const x of e.tratamentos) add('tratamentos', { id: x.id, preservativo: x.preservativo, empresa: x.empresa, ativo: x.ativo });
  for (const x of e.empresasInspetoras) add('empresas_inspetoras', { id: x.id, nome: x.nome, cnpj: n(x.cnpj), ativo: x.ativo });
  for (const x of e.locais) add('locais', { id: x.id, codigo: x.codigo, descricao: x.descricao, tipo: x.tipo, capacidade: x.capacidade, ativo: x.ativo });
  for (const x of e.fornecedores) {
    add('fornecedores', {
      id: x.id, razao_social: x.razaoSocial, cnpj: x.cnpj, cidade_uf: x.cidadeUf, ctf_ibama: x.ctfIbama, ctf_validade: n(x.ctfValidade),
      situacao: x.situacao, especies_ids: x.especiesIds, certificados: x.certificados,
    });
  }
  for (const a of e.atas) {
    add('atas', { id: a.id, numero: a.numero, fornecedor_id: a.fornecedorId, vigencia_inicio: a.vigenciaInicio, vigencia_fim: a.vigenciaFim, regras: a.regras });
    a.itens.forEach((i, ordem) => add('ata_itens', { ordem, ata_id: a.id, tamanho_id: i.tamanhoId, quantidade: i.quantidade }));
  }
  for (const c of e.contratos) {
    add('contratos', {
      id: c.id, numero: c.numero, ata_id: c.ataId, ano: c.ano, data_assinatura: c.dataAssinatura, gestor: c.gestor, local_entrega: c.localEntrega, situacao: c.situacao,
      motivo_cancelamento: n(c.motivoCancelamento), criado_em: c.criadoEm, criado_por: c.criadoPor,
    });
    c.itens.forEach((i, ordem) => add('contrato_itens', { ordem, id: i.id, contrato_id: c.id, tamanho_id: i.tamanhoId, quantidade: i.quantidade }));
    let ordem = 0;
    for (const p of c.parcelas) for (const i of p.itens) add('contrato_parcelas', { ordem: ordem++, contrato_id: c.id, numero: p.numero, tamanho_id: i.tamanhoId, quantidade: i.quantidade });
  }
  for (const x of e.emissoes) {
    add('emissoes', {
      id: x.id, contrato_id: x.contratoId, fardos_ids: x.fardosIds, parcela: x.parcela, reentrega: x.reentrega, com_documentos: x.comDocumentos,
      boletim: n(x.boletim), relatorio_tecnico: n(x.relatorioTecnico), nf: x.nf, dof: x.dof, entrega_id: n(x.entregaId), criado_em: x.criadoEm, criado_por: x.criadoPor,
    });
  }
  for (const x of e.nfs) {
    add('nfs', {
      id: x.id, numero: x.numero, serie: x.serie, chave_acesso: x.chaveAcesso, fornecedor_id: x.fornecedorId, contrato_id: x.contratoId,
      emissao: x.emissao, entrega_id: n(x.entregaId), xml: n(x.xml), criado_em: x.criadoEm, criado_por: x.criadoPor,
    });
    x.itens.forEach((i, ordem) => add('nf_itens', { ordem, nf_id: x.id, item_contrato_id: i.itemContratoId, quantidade: i.quantidade, volume_m3: i.volumeM3 }));
  }
  for (const x of e.dofs) {
    add('dofs', { id: x.id, numero: x.numero, nf_id: x.nfId, validade: x.validade, pdf: n(x.pdf), declarado_em: n(x.declarado?.quando), declarado_por: n(x.declarado?.quem) });
    x.volumes.forEach((v, ordem) => add('dof_volumes', { ordem, dof_id: x.id, especie_id: v.especieId, volume_m3: v.volumeM3 }));
  }
  for (const x of e.entregas) {
    add('entregas', {
      id: x.id, contrato_id: x.contratoId, nf_id: x.nfId, dof_id: x.dofId, fardos_ids: x.fardosIds, parcela: x.parcela, reentrega: x.reentrega,
      situacao: x.situacao, origem: x.origem, boletim: n(x.boletim), relatorio_tecnico: n(x.relatorioTecnico), laudo: n(x.laudo),
      criado_em: x.criadoEm, criado_por: x.criadoPor,
    });
  }
  for (const f of e.fardos) {
    add('fardos', {
      id: f.id, contrato_id: f.contratoId, item_contrato_id: f.itemContratoId, especie_id: f.especieId, classe: f.classe, tratamento_id: f.tratamentoId,
      usina_tratamento: f.usinaTratamento, data_tratamento: f.dataTratamento, emissao_id: n(f.emissaoId), quantidade_inicial: f.quantidadeInicial,
      entrega_id: n(f.entregaId), recebido_em: n(f.recebidoEm), local_id: n(f.localId), falta_declarada: n(f.faltaDeclarada),
      conclusao_em: n(f.conclusaoInspecao?.quando), conclusao_por: n(f.conclusaoInspecao?.quem), conclusao_justificativa: n(f.conclusaoInspecao?.justificativa),
      nao_localizados: f.conclusaoInspecao?.naoLocalizados ?? [],
      reprovados_ids: n(f.reprovacao?.dormentesIds), comunicar_ate: n(f.reprovacao?.comunicarAte), retirar_ate: n(f.reprovacao?.retirarAte),
      comunicado_em: n(f.reprovacao?.comunicadoEm), comunicado_por: n(f.reprovacao?.comunicadoPor),
      retirado_em: n(f.reprovacao?.retiradoEm), retirado_por: n(f.reprovacao?.retiradoPor),
    });
  }
  for (const d of e.dormentes) {
    add('dormentes', {
      id: d.id, contrato_id: d.contratoId, item_contrato_id: d.itemContratoId, fardo_id: d.fardoId, especie_id: d.especieId, classe: d.classe,
      tratamento_id: d.tratamentoId, usina_tratamento: d.usinaTratamento, data_tratamento: d.dataTratamento, situacao: d.situacao,
      inspecao_id: n(d.inspecaoId), categoria: n(d.categoria), comprimento_cm: n(d.medidas?.comprimentoCm), largura_cm: n(d.medidas?.larguraCm),
      altura_cm: n(d.medidas?.alturaCm), rme_numero: n(d.rmeNumero), local_id: n(d.localId),
    });
  }
  for (const r of e.recebimentos) {
    add('recebimentos', {
      id: r.id, entrega_id: r.entregaId, nf_id: r.nfId, dof_id: r.dofId, recebido_em: r.recebidoEm, recebido_por: r.recebidoPor, canhoto: n(r.canhoto),
      fardos_esperados: r.fardosEsperados, fardos_lidos: r.fardosLidos, conforme: r.conforme, ocorrencias: r.ocorrencias,
      divergencia_volume: r.divergenciaVolume, justificativa_divergencia: n(r.justificativaDivergencia), justificativa_automatica: !!r.justificativaAutomatica,
      local_espera_id: r.localEsperaId,
    });
  }
  for (const i of e.inspecoes) {
    add('inspecoes', {
      id: i.id, dormente_id: i.dormenteId, fardo_id: i.fardoId, resultado: i.resultado, categoria: n(i.categoria), indice: n(i.indice), veredito: n(i.veredito),
      comprimento_cm: n(i.medidas?.comprimentoCm), largura_cm: n(i.medidas?.larguraCm), altura_cm: n(i.medidas?.alturaCm),
      inspetor: i.inspetor, inspecionado_em: i.inspecionadoEm, origem: i.origem, relatorio_url: n(i.relatorioUrl),
    });
  }
  for (const m of e.movimentacoes) {
    add('movimentacoes', {
      id: m.id, tipo: m.tipo, fardo_id: m.fardoId, dormentes_ids: n(m.dormentesIds), quantidade: m.quantidade, de_local_id: n(m.deLocalId),
      para_local_id: n(m.paraLocalId), quando: m.quando, quem: m.quem, referencia: n(m.referencia),
    });
  }
  for (const r of e.rmes) {
    add('rmes', {
      id: r.id, numero: r.numero, solicitante_id: null, solicitante_nome: r.solicitanteNome, destino: r.destino, tipo_destino: r.tipoDestino,
      necessidade_em: r.necessidadeEm, situacao: r.situacao, motivo_cancelamento: n(r.motivoCancelamento), criado_em: r.criadoEm,
    });
    r.itens.forEach((i, ordem) => add('rme_itens', {
      ordem, rme_id: r.id, tamanho_id: i.tamanhoId, classe: i.classe, categoria_minima: n(i.categoriaMinima), especie_id: n(i.especieId), quantidade: i.quantidade,
    }));
    (r.separacao ?? []).forEach((s, ordem) => add('rme_separacao', {
      ordem, rme_id: r.id, fardo_id: s.fardoId, dormentes_ids: s.dormentesIds, seguiu_sugestao: s.seguiuSugestao,
      justificativa: n(s.justificativa), justificativa_classe: n(s.justificativaClasse),
    }));
  }
  for (const x of e.eventos) add('eventos', { id: x.id, tipo: x.tipo, entidade: x.entidade, entidade_id: x.entidadeId, descricao: x.descricao, referencia: n(x.referencia), quem: x.quem, quando: x.quando });
  for (const x of e.destinacoes) {
    add('destinacoes', {
      id: x.id, rme_id: x.rmeId, rme_numero: x.rmeNumero, especie_id: x.especieId, quantidade: x.quantidade, volume_m3: x.volumeM3,
      entregue_em: x.entregueEm, lancado_em: n(x.lancadoEm), lancado_por: n(x.lancadoPor),
    });
  }
  for (const s of e.saldosDof) {
    add('saldos_dof', { id: s.id, data: s.data, observacao: n(s.observacao), quem: s.quem, quando: s.quando });
    s.itens.forEach((i, ordem) => add('saldos_dof_itens', { ordem, saldo_id: s.id, especie_id: i.especieId, volume_m3: i.volumeM3 }));
  }
  for (const p of e.perdas) {
    add('perdas', {
      id: p.id, dormente_id: p.dormenteId, fardo_id: p.fardoId, contrato_id: p.contratoId, especie_id: p.especieId, tamanho_id: p.tamanhoId,
      volume_m3: p.volumeM3, motivo: p.motivo, descricao: n(p.descricao), quando: p.quando, quem: p.quem, comunicado_em: n(p.comunicadoEm), comunicado_por: n(p.comunicadoPor),
    });
  }
  for (const i of e.inventarios) {
    const r = i.resultado;
    add('inventarios', {
      id: i.id, numero: i.numero, locais_ids: i.locaisIds, situacao: i.situacao, aberto_em: i.abertoEm, aberto_por: i.abertoPor,
      fechado_em: n(i.fechadoEm), fechado_por: n(i.fechadoPor), esperados_total: n(r?.esperados), localizados_total: n(r?.localizados),
      no_lugar_certo_total: n(r?.noLugarCerto), percentual_localizados: n(r?.percentualLocalizados), percentual_no_lugar_certo: n(r?.percentualNoLugarCerto),
    });
    i.esperados.forEach((x, ordem) => add('inventario_esperados', { ordem, inventario_id: i.id, dormente_id: x.dormenteId, fardo_id: x.fardoId, local_id: x.localId }));
    i.leituras.forEach((x, ordem) => add('inventario_leituras', { inventario_id: i.id, ordem: ordem + 1, tipo: x.tipo, item_id: x.id, local_id: x.localId, quando: x.quando, quem: x.quem }));
    for (const l of r?.porLocal ?? []) {
      add('inventario_locais', {
        inventario_id: i.id, local_id: l.localId, esperados: l.esperados, localizados: l.localizados, no_lugar_certo: l.noLugarCerto,
        percentual_localizados: l.percentualLocalizados, percentual_no_lugar_certo: l.percentualNoLugarCerto, diferencas: l.diferencas,
      });
    }
    (r?.diferencas ?? []).forEach((d, ordem) => add('inventario_diferencas', {
      ordem, inventario_id: i.id, grupo: d.grupo, tipo: d.tipo, item_id: d.id, fardo_id: d.fardoId, local_id: n(d.localId), lido_em_id: n(d.lidoEmId),
      quantidade: d.quantidade, motivo: d.motivo, justificativa: n(d.justificativa),
    }));
  }
  const p = e.parametros;
  add('parametros', {
    id: 1, limite_dias_estoque: p.limiteDiasEstoque, alerta_dof_dias: p.alertaDofDias, tolerancia_volume_pct: p.toleranciaVolumePct,
    limites_categoria: p.limitesCategoria, dormentes_por_fardo_padrao: p.dormentesPorFardoPadrao, alerta_laudo_dias: p.alertaLaudoDias,
    modo_demonstracao: p.modoDemonstracao,
  });
  p.niveis.forEach((x, ordem) => add('niveis_estoque', { ordem, classe: x.classe, tamanho_id: x.tamanhoId, minimo: x.minimo, maximo: x.maximo }));
  for (const f of p.feriados) add('feriados', { data: f.data, nome: f.nome, abrangencia: f.abrangencia });
  for (const [nome, valor] of Object.entries(e.contadores)) add('sequencias', { nome, valor });
  return L;
}

// ---------------------------------------------------------------------------------------------------------------
// Linhas → estado
// ---------------------------------------------------------------------------------------------------------------

/** Tira os nulos (o app usa campo ausente para "sem valor"). */
function limpo<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === null || o[k] === undefined) delete o[k];
  return o;
}
const ts = (v: unknown) => (v == null ? undefined : new Date(String(v)).toISOString());
const dt = (v: unknown) => (v == null ? undefined : String(v).slice(0, 10));
const num = (v: unknown) => (v == null ? undefined : Number(v));
const txt = (v: unknown) => (v == null ? undefined : String(v));
const lista = (v: unknown) => (v as string[] | null) ?? [];
/** Número de um id técnico (es0001 → 1); ids de outro formato ficam juntos, em ordem de texto. */
const ordemDoId = (id: string) => { const m = /^[a-z]+(\d+)$/.exec(id); return m ? Number(m[1]) : 0; };
const porOrdem = (a: Linha, b: Linha) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0);
function grupos(linhas: Linha[] = [], chave: string): Map<string, Linha[]> {
  const m = new Map<string, Linha[]>();
  for (const l of [...linhas].sort(porOrdem)) {
    const k = String(l[chave]);
    m.set(k, [...(m.get(k) ?? []), l]);
  }
  return m;
}

/** Perfis do Supabase → usuários do app (com as permissões do perfil). */
export function usuarioDoPerfil(p: Linha): Usuario {
  const perfil = p.perfil as Perfil;
  return { id: String(p.id), nome: String(p.nome), email: String(p.email), perfil, permissoes: [...PERFIS[perfil].permissoes], ativo: !!p.ativo };
}

/** `dataBase`: o dia de referência da demonstração (só informativo fora do mock). */
export function deLinhas(L: Linhas, perfis: Linha[] = [], dataBase = ''): Estado {
  const t = (nome: string) => L[nome] ?? [];
  const ataItens = grupos(t('ata_itens'), 'ata_id');
  const ctItens = grupos(t('contrato_itens'), 'contrato_id');
  const ctParcelas = grupos(t('contrato_parcelas'), 'contrato_id');
  const nfItens = grupos(t('nf_itens'), 'nf_id');
  const dofVol = grupos(t('dof_volumes'), 'dof_id');
  const rmeItens = grupos(t('rme_itens'), 'rme_id');
  const rmeSep = grupos(t('rme_separacao'), 'rme_id');
  const sdItens = grupos(t('saldos_dof_itens'), 'saldo_id');
  const invEsp = grupos(t('inventario_esperados'), 'inventario_id');
  const invLei = grupos(t('inventario_leituras'), 'inventario_id');
  const invLoc = grupos(t('inventario_locais'), 'inventario_id');
  const invDif = grupos(t('inventario_diferencas'), 'inventario_id');
  // Ordem das listas = a de criação, como no mock: ids técnicos pelo número (ev9999 antes de ev10000); fardos pela
  // emissão e dormentes pelo fardo (o fornecedor emite fardo a fardo, cada um com os seus dormentes).
  const porId = (a: Linha, b: Linha) => ordemDoId(String(a.id)) - ordemDoId(String(b.id)) || String(a.id).localeCompare(String(b.id));
  const posFardo = new Map([...t('fardos')].sort((a, b) => ordemDoId(String(a.emissao_id ?? '')) - ordemDoId(String(b.emissao_id ?? '')) || String(a.id).localeCompare(String(b.id)))
    .map((f, i) => [String(f.id), i]));
  const porFardo = (a: Linha, b: Linha) => (posFardo.get(String(a.fardo_id)) ?? 0) - (posFardo.get(String(b.fardo_id)) ?? 0) || String(a.id).localeCompare(String(b.id));
  const p = t('parametros')[0] ?? {};

  return {
    versao: VERSAO_ESTADO,
    dataBase,
    usuarios: perfis.map(usuarioDoPerfil),
    especies: t('especies').sort(porId).map((x) => ({ id: String(x.id), nomeCientifico: String(x.nome_cientifico), nomePopular: String(x.nome_popular), ativo: !!x.ativo })),
    tamanhos: t('tamanhos').sort(porId).map((x) => ({
      id: String(x.id), codigo: String(x.codigo), uso: x.uso as 'amv', comprimentoCm: Number(x.comprimento_cm), larguraCm: Number(x.largura_cm),
      alturaCm: Number(x.altura_cm), medidas: x.medidas as 'confirmado', ativo: !!x.ativo,
    })),
    tratamentos: t('tratamentos').sort(porId).map((x) => ({ id: String(x.id), preservativo: String(x.preservativo), empresa: String(x.empresa), ativo: !!x.ativo })),
    empresasInspetoras: t('empresas_inspetoras').sort(porId).map((x) => limpo({ id: String(x.id), nome: String(x.nome), cnpj: txt(x.cnpj), ativo: !!x.ativo })),
    locais: t('locais').sort(porId).map((x) => ({ id: String(x.id), codigo: String(x.codigo), descricao: String(x.descricao), tipo: x.tipo as 'armazenagem', capacidade: Number(x.capacidade), ativo: !!x.ativo })),
    fornecedores: t('fornecedores').sort(porId).map((x) => limpo({
      id: String(x.id), razaoSocial: String(x.razao_social), cnpj: String(x.cnpj), cidadeUf: String(x.cidade_uf), ctfIbama: String(x.ctf_ibama),
      ctfValidade: dt(x.ctf_validade) as string, situacao: x.situacao as 'ativo', especiesIds: lista(x.especies_ids), certificados: (x.certificados as never[]) ?? [],
    })),
    atas: t('atas').sort(porId).map((x) => ({
      id: String(x.id), numero: String(x.numero), fornecedorId: String(x.fornecedor_id), vigenciaInicio: dt(x.vigencia_inicio)!, vigenciaFim: dt(x.vigencia_fim)!,
      regras: x.regras as Estado['atas'][number]['regras'],
      itens: (ataItens.get(String(x.id)) ?? []).map((i) => ({ tamanhoId: String(i.tamanho_id), quantidade: Number(i.quantidade) })),
    })),
    contratos: t('contratos').sort(porId).map((x) => {
      const parcelas: { numero: number; itens: { tamanhoId: string; quantidade: number }[] }[] = [];
      for (const l of ctParcelas.get(String(x.id)) ?? []) {
        let pa = parcelas.find((y) => y.numero === Number(l.numero));
        if (!pa) parcelas.push((pa = { numero: Number(l.numero), itens: [] }));
        pa.itens.push({ tamanhoId: String(l.tamanho_id), quantidade: Number(l.quantidade) });
      }
      return limpo({
        id: String(x.id), numero: String(x.numero), ataId: String(x.ata_id), ano: Number(x.ano), dataAssinatura: dt(x.data_assinatura)!, gestor: String(x.gestor), localEntrega: String(x.local_entrega ?? ''),
        situacao: x.situacao as 'vigente', motivoCancelamento: txt(x.motivo_cancelamento),
        itens: (ctItens.get(String(x.id)) ?? []).map((i) => ({ id: String(i.id), tamanhoId: String(i.tamanho_id), quantidade: Number(i.quantidade) })),
        parcelas, criadoEm: ts(x.criado_em)!, criadoPor: String(x.criado_por),
      });
    }),
    emissoes: t('emissoes').sort(porId).map((x) => limpo({
      id: String(x.id), contratoId: String(x.contrato_id), fardosIds: lista(x.fardos_ids), parcela: Number(x.parcela), reentrega: !!x.reentrega,
      comDocumentos: !!x.com_documentos, boletim: (x.boletim ?? undefined) as never, relatorioTecnico: (x.relatorio_tecnico ?? undefined) as never,
      nf: x.nf as never, dof: x.dof as never, entregaId: txt(x.entrega_id), criadoEm: ts(x.criado_em)!, criadoPor: String(x.criado_por),
    })),
    nfs: t('nfs').sort(porId).map((x) => limpo({
      id: String(x.id), numero: String(x.numero), serie: String(x.serie), chaveAcesso: String(x.chave_acesso), fornecedorId: String(x.fornecedor_id),
      contratoId: String(x.contrato_id), emissao: dt(x.emissao)!, entregaId: String(x.entrega_id ?? ''), xml: (x.xml ?? undefined) as never,
      itens: (nfItens.get(String(x.id)) ?? []).map((i) => ({ itemContratoId: String(i.item_contrato_id), quantidade: Number(i.quantidade), volumeM3: Number(i.volume_m3) })),
      criadoEm: ts(x.criado_em)!, criadoPor: String(x.criado_por),
    })),
    dofs: t('dofs').sort(porId).map((x) => limpo({
      id: String(x.id), numero: String(x.numero), nfId: String(x.nf_id), validade: dt(x.validade)!,
      volumes: (dofVol.get(String(x.id)) ?? []).map((v) => ({ especieId: String(v.especie_id), volumeM3: Number(v.volume_m3) })),
      pdf: (x.pdf ?? undefined) as never, declarado: x.declarado_em ? { quando: ts(x.declarado_em)!, quem: String(x.declarado_por) } : undefined,
    })),
    entregas: t('entregas').sort(porId).map((x) => limpo({
      id: String(x.id), contratoId: String(x.contrato_id), nfId: String(x.nf_id), dofId: String(x.dof_id), fardosIds: lista(x.fardos_ids),
      parcela: Number(x.parcela), reentrega: !!x.reentrega, situacao: x.situacao as 'a_caminho', origem: x.origem as 'cadastro',
      boletim: (x.boletim ?? undefined) as never, relatorioTecnico: (x.relatorio_tecnico ?? undefined) as never, laudo: (x.laudo ?? undefined) as never,
      criadoEm: ts(x.criado_em)!, criadoPor: String(x.criado_por),
    })),
    fardos: t('fardos').sort((a, b) => (posFardo.get(String(a.id)) ?? 0) - (posFardo.get(String(b.id)) ?? 0)).map((x) => limpo({
      id: String(x.id), contratoId: String(x.contrato_id), itemContratoId: String(x.item_contrato_id), especieId: String(x.especie_id),
      classe: Number(x.classe) as 1, tratamentoId: String(x.tratamento_id), usinaTratamento: String(x.usina_tratamento), dataTratamento: dt(x.data_tratamento)!,
      emissaoId: txt(x.emissao_id), quantidadeInicial: Number(x.quantidade_inicial), entregaId: txt(x.entrega_id), recebidoEm: ts(x.recebido_em),
      localId: txt(x.local_id), faltaDeclarada: num(x.falta_declarada),
      conclusaoInspecao: x.conclusao_em ? limpo({
        quando: ts(x.conclusao_em)!, quem: String(x.conclusao_por), justificativa: txt(x.conclusao_justificativa), naoLocalizados: lista(x.nao_localizados),
      }) : undefined,
      reprovacao: x.reprovados_ids ? limpo({
        dormentesIds: lista(x.reprovados_ids), comunicarAte: dt(x.comunicar_ate)!, retirarAte: dt(x.retirar_ate)!,
        comunicadoEm: ts(x.comunicado_em), comunicadoPor: txt(x.comunicado_por), retiradoEm: ts(x.retirado_em), retiradoPor: txt(x.retirado_por),
      }) : undefined,
    })),
    dormentes: t('dormentes').sort(porFardo).map((x) => limpo({
      id: String(x.id), contratoId: String(x.contrato_id), itemContratoId: String(x.item_contrato_id), fardoId: String(x.fardo_id), especieId: String(x.especie_id),
      classe: Number(x.classe) as 1, tratamentoId: String(x.tratamento_id), usinaTratamento: String(x.usina_tratamento), dataTratamento: dt(x.data_tratamento)!,
      situacao: x.situacao as 'emitido', inspecaoId: txt(x.inspecao_id), categoria: num(x.categoria) as 1 | undefined,
      medidas: x.comprimento_cm != null ? { comprimentoCm: Number(x.comprimento_cm), larguraCm: Number(x.largura_cm), alturaCm: Number(x.altura_cm) } : undefined,
      rmeNumero: txt(x.rme_numero), localId: txt(x.local_id),
    })),
    recebimentos: t('recebimentos').sort(porId).map((x) => limpo({
      id: String(x.id), entregaId: String(x.entrega_id), nfId: String(x.nf_id), dofId: String(x.dof_id), recebidoEm: ts(x.recebido_em)!, recebidoPor: String(x.recebido_por),
      canhoto: (x.canhoto ?? undefined) as never, fardosEsperados: lista(x.fardos_esperados), fardosLidos: lista(x.fardos_lidos), conforme: !!x.conforme,
      ocorrencias: (x.ocorrencias as never[]) ?? [], divergenciaVolume: (x.divergencia_volume as never[]) ?? [],
      justificativaDivergencia: txt(x.justificativa_divergencia), justificativaAutomatica: !!x.justificativa_automatica, localEsperaId: String(x.local_espera_id),
    })),
    inspecoes: t('inspecoes').sort(porId).map((x) => limpo({
      id: String(x.id), dormenteId: String(x.dormente_id), fardoId: String(x.fardo_id), resultado: x.resultado as 'aprovado', categoria: num(x.categoria) as 1 | undefined,
      indice: num(x.indice), veredito: txt(x.veredito) as never,
      medidas: x.comprimento_cm != null ? { comprimentoCm: Number(x.comprimento_cm), larguraCm: Number(x.largura_cm), alturaCm: Number(x.altura_cm) } : undefined,
      inspetor: String(x.inspetor), inspecionadoEm: ts(x.inspecionado_em)!, origem: x.origem as 'manual', relatorioUrl: txt(x.relatorio_url),
    })),
    movimentacoes: t('movimentacoes').sort(porId).map((x) => limpo({
      id: String(x.id), tipo: x.tipo as 'guarda', fardoId: String(x.fardo_id), dormentesIds: lista(x.dormentes_ids),
      quantidade: Number(x.quantidade), deLocalId: txt(x.de_local_id), paraLocalId: txt(x.para_local_id), quando: ts(x.quando)!, quem: String(x.quem), referencia: txt(x.referencia),
    })),
    rmes: t('rmes').sort(porId).map((x) => {
      const sep = rmeSep.get(String(x.id));
      return limpo({
        id: String(x.id), numero: String(x.numero), solicitanteId: String(x.solicitante_id ?? ''), solicitanteNome: String(x.solicitante_nome),
        destino: String(x.destino), tipoDestino: x.tipo_destino as 'patio', necessidadeEm: dt(x.necessidade_em)!,
        itens: (rmeItens.get(String(x.id)) ?? []).map((i) => limpo({
          tamanhoId: String(i.tamanho_id), classe: Number(i.classe) as 1, categoriaMinima: num(i.categoria_minima) as 1 | undefined, especieId: txt(i.especie_id), quantidade: Number(i.quantidade),
        })),
        separacao: sep?.map((s) => limpo({
          fardoId: String(s.fardo_id), dormentesIds: lista(s.dormentes_ids), seguiuSugestao: !!s.seguiu_sugestao,
          justificativa: txt(s.justificativa), justificativaClasse: txt(s.justificativa_classe),
        })),
        situacao: x.situacao as 'aberta', motivoCancelamento: txt(x.motivo_cancelamento), criadoEm: ts(x.criado_em)!,
      });
    }),
    eventos: t('eventos').sort(porId).map((x) => limpo({
      id: String(x.id), tipo: x.tipo as 'criado', entidade: x.entidade as 'fardo', entidadeId: String(x.entidade_id), descricao: String(x.descricao),
      referencia: txt(x.referencia), quem: String(x.quem), quando: ts(x.quando)!,
    })),
    destinacoes: t('destinacoes').sort(porId).map((x) => limpo({
      id: String(x.id), rmeId: String(x.rme_id), rmeNumero: String(x.rme_numero), especieId: String(x.especie_id), quantidade: Number(x.quantidade),
      volumeM3: Number(x.volume_m3), entregueEm: ts(x.entregue_em)!, lancadoEm: ts(x.lancado_em), lancadoPor: txt(x.lancado_por),
    })),
    saldosDof: t('saldos_dof').sort(porId).map((x) => limpo({
      id: String(x.id), data: dt(x.data)!, itens: (sdItens.get(String(x.id)) ?? []).map((i) => ({ especieId: String(i.especie_id), volumeM3: Number(i.volume_m3) })),
      observacao: txt(x.observacao), quem: String(x.quem), quando: ts(x.quando)!,
    })),
    perdas: t('perdas').sort(porId).map((x) => limpo({
      id: String(x.id), dormenteId: String(x.dormente_id), fardoId: String(x.fardo_id), contratoId: String(x.contrato_id), especieId: String(x.especie_id),
      tamanhoId: String(x.tamanho_id), volumeM3: Number(x.volume_m3), motivo: x.motivo as 'outro', descricao: txt(x.descricao), quando: ts(x.quando)!, quem: String(x.quem),
      comunicadoEm: ts(x.comunicado_em), comunicadoPor: txt(x.comunicado_por),
    })),
    inventarios: t('inventarios').sort(porId).map((x): Inventario => {
      const id = String(x.id);
      const fechado = x.situacao === 'fechado';
      return limpo({
        id, numero: String(x.numero), locaisIds: lista(x.locais_ids), situacao: x.situacao as 'aberto',
        esperados: (invEsp.get(id) ?? []).map((e) => ({ dormenteId: String(e.dormente_id), fardoId: String(e.fardo_id), localId: String(e.local_id) })),
        leituras: (invLei.get(id) ?? []).map((l) => ({ tipo: l.tipo as 'fardo', id: String(l.item_id), localId: String(l.local_id), quando: ts(l.quando)!, quem: String(l.quem) })),
        abertoEm: ts(x.aberto_em)!, abertoPor: String(x.aberto_por), fechadoEm: ts(x.fechado_em), fechadoPor: txt(x.fechado_por),
        resultado: fechado ? {
          porLocal: lista(x.locais_ids).map((localId) => (invLoc.get(id) ?? []).find((l) => l.local_id === localId)).filter((l): l is Linha => !!l).map((l) => ({
            localId: String(l.local_id), esperados: Number(l.esperados), localizados: Number(l.localizados), noLugarCerto: Number(l.no_lugar_certo),
            percentualLocalizados: Number(l.percentual_localizados), percentualNoLugarCerto: Number(l.percentual_no_lugar_certo), diferencas: Number(l.diferencas),
          })),
          esperados: Number(x.esperados_total), localizados: Number(x.localizados_total), noLugarCerto: Number(x.no_lugar_certo_total),
          percentualLocalizados: Number(x.percentual_localizados), percentualNoLugarCerto: Number(x.percentual_no_lugar_certo),
          diferencas: (invDif.get(id) ?? []).map((d) => limpo({
            grupo: d.grupo as 'inesperado', tipo: d.tipo as 'fardo', id: String(d.item_id), fardoId: String(d.fardo_id), localId: txt(d.local_id),
            lidoEmId: txt(d.lido_em_id), quantidade: Number(d.quantidade), motivo: String(d.motivo), justificativa: txt(d.justificativa),
          })),
        } : undefined,
      });
    }),
    parametros: {
      limiteDiasEstoque: Number(p.limite_dias_estoque), alertaDofDias: p.alerta_dof_dias as [number, number], toleranciaVolumePct: Number(p.tolerancia_volume_pct),
      limitesCategoria: p.limites_categoria as [number, number], dormentesPorFardoPadrao: Number(p.dormentes_por_fardo_padrao),
      niveis: [...t('niveis_estoque')].sort(porOrdem).map((x) => ({ classe: Number(x.classe) as 1, tamanhoId: String(x.tamanho_id), minimo: Number(x.minimo), maximo: Number(x.maximo) })),
      alertaLaudoDias: p.alerta_laudo_dias as [number, number],
      feriados: [...t('feriados')].sort((a, b) => String(a.data).localeCompare(String(b.data))).map((x) => ({ data: dt(x.data)!, nome: String(x.nome), abrangencia: x.abrangencia as 'nacional' })),
      modoDemonstracao: !!p.modo_demonstracao,
    } as Parametros,
    contadores: Object.fromEntries(t('sequencias').map((x) => [String(x.nome), Number(x.valor)])),
  };
}
