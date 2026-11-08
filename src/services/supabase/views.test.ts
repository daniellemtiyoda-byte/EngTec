import { describe, expect, it } from 'vitest';
import { contratoView, dofView, entregaView, fardoView, itemContratoView, ataView, localView, saldoPorItem } from '../mock/consultas';
import { criarDados } from '../mock/data';
import { AGORA } from '../regras.suite';
import { criarBanco, criarContas, como, executarSeed } from './bancoDeTeste';

/** As views dos campos calculados (0004) dão o mesmo resultado que as consultas do app, na história de demonstração. */
describe('views do banco × consultas do app', () => {
  it('fardo, item do contrato, contrato, ata, local, DOF, entrega e estoque por item', async () => {
    const db = await criarBanco();
    const contas = await criarContas(db);
    await db.query(`select set_config('holz.agora', $1, false)`, [AGORA.toISOString()]);
    await executarSeed(db);
    const e = criarDados(AGORA);
    const hoje = '2026-11-06';
    const ler = <T,>(sql: string) => como(db, contas.gestor, async () => (await db.query<T>(sql)).rows, AGORA.toISOString());

    const fardos = await ler<Record<string, unknown>>(`select id, saldo, disponivel, reservados, situacao, aberto, idade_dias, acima_limite_dias, em_cura_ate::text from public.v_fardos order by id`);
    expect(fardos).toEqual([...e.fardos].sort((a, b) => a.id.localeCompare(b.id)).map((f) => {
      const v = fardoView(e, f, hoje);
      return { id: v.id, saldo: v.saldo, disponivel: v.disponivel, reservados: v.reservados, situacao: v.situacao, aberto: v.aberto,
        idade_dias: v.idadeDias ?? null, acima_limite_dias: v.acimaLimiteDias, em_cura_ate: v.emCuraAte ?? null };
    }));

    const itens = await ler<Record<string, unknown>>(`select id, emitidos, recebidos, aprovados, reprovados, saldo_a_emitir from public.v_contrato_itens order by id`);
    expect(itens).toEqual(e.contratos.flatMap((c) => c.itens.map((i) => itemContratoView(e, c.id, i))).sort((a, b) => a.id.localeCompare(b.id))
      .map((i) => ({ id: i.id, emitidos: i.emitidos, recebidos: i.recebidos, aprovados: i.aprovados, reprovados: i.reprovados, saldo_a_emitir: i.saldoAEmitir })));

    const contratos = await ler<Record<string, unknown>>(`select id, situacao_calculada, fornecedor_id from public.v_contratos order by id`);
    expect(contratos).toEqual(e.contratos.map((c) => contratoView(e, c, hoje)).sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => ({ id: c.id, situacao_calculada: c.situacao, fornecedor_id: c.fornecedorId })));

    const atas = await ler<Record<string, unknown>>(`select ata_id, tamanho_id, contratado, saldo from public.v_ata_itens order by ata_id, ordem`);
    expect(atas).toEqual(e.atas.flatMap((a) => ataView(e, a, hoje).itens.map((i) => ({ ata_id: a.id, tamanho_id: i.tamanhoId, contratado: i.contratado, saldo: i.saldo }))));

    const locais = await ler<Record<string, unknown>>(`select id, ocupacao, fardos from public.v_locais order by id`);
    expect(locais).toEqual(e.locais.map((l) => localView(e, l, hoje)).map((l) => ({ id: l.id, ocupacao: l.ocupacao, fardos: l.fardos })));

    const dofs = await ler<Record<string, unknown>>(`select id, prazo_declaracao::text, dias_para_prazo, nivel_prazo, situacao_declaracao, pode_declarar from public.v_dofs order by public.ordem_id(id)`);
    expect(dofs).toEqual(e.dofs.map((d) => dofView(e, d, hoje)).map((d) => ({
      id: d.id, prazo_declaracao: d.prazoDeclaracao, dias_para_prazo: d.diasParaPrazo, nivel_prazo: d.nivelPrazo, situacao_declaracao: d.situacaoDeclaracao, pode_declarar: d.podeDeclarar,
    })));

    const entregas = await ler<Record<string, unknown>>(`select id, prazo_laudo::text, pode_emitir_laudo, etapa from public.v_entregas order by public.ordem_id(id)`);
    expect(entregas).toEqual(e.entregas.map((x) => entregaView(e, x, hoje)).map((x) => ({ id: x.id, prazo_laudo: x.prazoLaudo ?? null, pode_emitir_laudo: x.podeEmitirLaudo, etapa: x.etapa })));

    const estoque = await ler<Record<string, unknown>>(`select classe, tamanho_id, em_estoque, em_cura, liberacao_cura::text, aguardando_inspecao, reservado, nao_localizado, minimo, maximo, situacao
      from public.v_estoque_por_item order by tamanho_id, classe`);
    expect(estoque).toEqual(saldoPorItem(e, hoje).sort((a, b) => a.tamanhoId.localeCompare(b.tamanhoId) || a.classe - b.classe).map((s) => ({
      classe: s.classe, tamanho_id: s.tamanhoId, em_estoque: s.emEstoque, em_cura: s.emCura, liberacao_cura: s.liberacaoCura ?? null, aguardando_inspecao: s.aguardandoInspecao,
      reservado: s.reservado, nao_localizado: s.naoLocalizado, minimo: s.minimo, maximo: s.maximo, situacao: s.situacao,
    })));
  }, 120_000);
});
