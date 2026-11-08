import { describe, expect, it } from 'vitest';
import { AGORA, falhaCom, localPorCodigo, regrasDosServicos } from '../regras.suite';
import type { Perfil } from '../../dominio/permissoes';
import type { Usuario } from '../../types/models';
import { criarDados, usuarioDemo } from './data';
import { criarServicosSimulados } from './index';
import { receber } from './recebimento';
import { violacoes } from './invariantes';

/** Serviços simulados com relógio fixo, sem armazenamento e sem espera; `como` troca o usuário logado. */
function montar(perfil: Perfil | null = 'almoxarife', armazenamento: Map<string, string> = new Map()) {
  let usuario: Usuario | null = perfil ? usuarioDemo(perfil) : null;
  const store = { getItem: (k: string) => armazenamento.get(k) ?? null, setItem: (k: string, v: string) => void armazenamento.set(k, v), removeItem: (k: string) => void armazenamento.delete(k) };
  const s = criarServicosSimulados({ agora: () => AGORA, armazenamento: store, atrasoMs: 0, usuarioAtual: async () => usuario });
  /** Violações dos invariantes no estado salvo (vazia = tudo certo). */
  const invariantes = () => violacoes(JSON.parse(armazenamento.get('holz:demo:estado')!), '2026-11-06');
  return { s, como: (p: Perfil | null) => { usuario = p ? usuarioDemo(p) : null; }, invariantes };
}


regrasDosServicos(async (perfil) => {
  const { s, como, invariantes } = montar(perfil);
  return { s, como, invariantes: async () => invariantes() };
});

describe('recebimento (regra direta no estado)', () => {
  it('divergência que não vem da falta continua exigindo justificativa', async () => {
    // Na regra: a DOF da entrega fixa com o dobro do volume. Todos os fardos lidos, sem falta: a pessoa justifica.
    const e = criarDados(AGORA);
    const en = e.entregas.find((x) => x.situacao === 'a_caminho')!;
    const dof = e.dofs.find((d) => d.id === en.dofId)!;
    dof.volumes = dof.volumes.map((v) => ({ ...v, volumeM3: v.volumeM3 * 2 }));
    const insp = e.locais.find((l) => l.codigo === 'INSP-01')!;
    const ctx = { agora: () => AGORA, quem: 'teste' };
    const dados = { fardosLidos: [...en.fardosIds], ocorrencias: [], localEsperaId: insp.id };
    await falhaCom(Promise.resolve().then(() => receber(e, en.id, dados, ctx)), 422, 'justificativaDivergencia');
    const rec = receber(e, en.id, { ...dados, justificativaDivergencia: 'DOF emitida com o volume errado; fornecedor vai corrigir.' }, ctx);
    expect(rec.justificativaAutomatica).toBe(false);
  });
});

describe('persistência', () => {
  it('guarda no armazenamento, sobrevive a recarregar e reinicia a demonstração', async () => {
    const store = new Map<string, string>();
    const a = montar('administrador', store);
    await a.s.locais.criar({ codigo: 'C-01', descricao: 'Pátio C', tipo: 'armazenagem', capacidade: 50 });
    const b = montar('administrador', store);
    expect((await b.s.locais.obterPorCodigo('C-01')).descricao).toBe('Pátio C');
    await b.s.parametros.reiniciarDemonstracao();
    const c = montar('administrador', store);
    await falhaCom(c.s.locais.obterPorCodigo('C-01'), 404);
  });
  it('estado salvo em formato antigo (mesma versão) é descartado e a demonstração é recriada; as telas carregam', async () => {
    const casos: ((e: Record<string, any>) => void)[] = [
      (e) => { for (const f of e.fardos) delete f.dataTratamento; for (const d of e.dormentes) delete d.dataTratamento; },  // fardo de antes da marcação (Estoque quebrava)
      (e) => { delete e.eventos; for (const r of e.rmes) r.historico = []; },  // RME de antes da entidade Evento
      (e) => { delete e.parametros.feriados; },
      (e) => { e.rmes[0].criadoEm = 'ontem'; },  // data que não monta a tela
      (e) => { e.versao = 7; },
    ];
    for (const estragar of casos) {
      const store = new Map<string, string>();
      montar('administrador', store);
      const salvo = JSON.parse(store.get('holz:demo:estado')!);
      salvo.locais.push({ ...salvo.locais[0], id: 'lo-antigo', codigo: 'ANTIGO' });  // marca para saber se foi recriado
      estragar(salvo);
      store.set('holz:demo:estado', JSON.stringify(salvo));
      const { s, invariantes } = montar('administrador', store);
      await falhaCom(s.locais.obterPorCodigo('ANTIGO'), 404);
      expect((await s.estoque.porItem()).total).toBeGreaterThan(0);
      expect((await s.estoque.porFardo()).total).toBeGreaterThan(0);
      expect((await s.rme.listar()).total).toBe(7);
      expect(invariantes()).toEqual([]);
    }
  });
  it('registro novo sem um campo opcional que a demonstração sempre tem (inventário aberto) não apaga os dados', async () => {
    const store = new Map<string, string>();
    const a = montar('almoxarife', store);
    const local = await localPorCodigo(a.s, 'A-01');
    const inv = await a.s.inventarios.abrir([local.id]);
    const b = montar('almoxarife', store);
    expect((await b.s.inventarios.obter(inv.id)).situacao).toBe('aberto');
  });
  it('estado salvo no formato atual é mantido', async () => {
    const store = new Map<string, string>();
    montar('administrador', store);
    const salvo = JSON.parse(store.get('holz:demo:estado')!);
    salvo.locais.push({ ...salvo.locais[0], id: 'lo-novo', codigo: 'NOVO' });
    store.set('holz:demo:estado', JSON.stringify(salvo));
    const { s } = montar('administrador', store);
    expect((await s.locais.obterPorCodigo('NOVO')).id).toBe('lo-novo');
  });
});

