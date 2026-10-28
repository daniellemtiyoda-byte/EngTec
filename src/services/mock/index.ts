import type { Servicos } from '../contracts';
import { TOLERANCIA_VOLUME_PCT } from '../../dominio/parametros';
import type { Indicadores, ItemNf, Movimentacao, NotaFiscal, NovoTamanho, ProcessamentoImagem, SessaoInventario, Tamanho, Usuario } from '../../types/models';
import { pct, rotuloClasse } from '../../utils/format';
import { chaveAcessoValida } from '../../utils/nfeXml';
import { ApiError } from '../http';
import { criarDados } from './data';
import { receber } from './recebimento';
import { atraso, paginar, simularRede, volumeDormenteM3 } from './util';

let sessao: Usuario | null = null; // apenas em memória: nada de credenciais no armazenamento do navegador
let seq = 100_000; // acima dos ids gerados em data.ts
const novoId = (p: string) => `${p}${++seq}`;

export function criarServicosSimulados(): Servicos {
  const D = criarDados();

  function validarTamanho(n: NovoTamanho, id?: string) {
    if (D.tamanhos.some((t) => t.id !== id && t.codigo.toLowerCase() === n.codigo.toLowerCase())) {
      throw new ApiError(409, 'Já existe um tamanho com este código.', { codigo: 'Código já utilizado.' });
    }
  }
  const comVolume = (id: string, n: NovoTamanho): Tamanho => ({ id, ...n, volumeM3: volumeDormenteM3(n.larguraCm, n.alturaCm, n.comprimentoCm) });

  return {
    auth: {
      entrar: async ({ usuario, senha }) => {
        await atraso(500);
        if (!usuario.trim() || !senha) throw new ApiError(401, 'Usuário ou senha inválidos.');
        sessao = D.usuarioDemo;
        return sessao;
      },
      usuarioAtual: async () => { await atraso(150); return sessao; },
      sair: async () => { await atraso(150); sessao = null; },
    },
    dashboard: {
      indicadores: async (): Promise<Indicadores> => {
        await simularRede();
        const s = D.saldos;
        const soma = (f: (x: (typeof s)[number]) => number) => s.reduce((a, x) => a + f(x), 0);
        const porClasse = new Map<string, number>();
        for (const x of s) porClasse.set(rotuloClasse(x.classe), (porClasse.get(rotuloClasse(x.classe)) ?? 0) + x.disponivel);
        const meses = ['Jun', 'Jul', 'Ago', 'Set', 'Out'];
        return {
          disponivel: soma((x) => x.disponivel), bloqueado: soma((x) => x.bloqueado), emAnalise: soma((x) => x.emAnalise), divergente: soma((x) => x.divergente),
          metrosLineares: soma((x) => x.metrosLineares), volumeDocumentalM3: D.lotes.reduce((a, l) => a + l.volumeDocumentalM3, 0), volumeCalculadoM3: soma((x) => x.volumeM3),
          recebimentosPendentes: D.notas.filter((n) => n.situacao !== 'recebida').length,
          inventariosAbertos: D.sessoesInventario.filter((x) => x.estado !== 'aprovado' && x.estado !== 'rejeitado').length,
          recebimentosPorMes: meses.map((m, i) => ({ rotulo: m, valor: [4, 6, 5, 7, 3][i] })),
          estoquePorClasse: [...porClasse].map(([rotulo, valor]) => ({ rotulo, valor })),
          origem: 'simulado',
        };
      },
      alertas: async () => {
        await atraso(250);
        const divergentes = D.recebimentos.filter((r) => r.acimaTolerancia).map((r) => ({
          id: `al-vol-${r.id}`, nivel: 'critico' as const, titulo: `Divergência de volume acima de ${TOLERANCIA_VOLUME_PCT}% na NF ${r.nfNumero}`,
          descricao: `DOF ${r.dofNumero}: ${r.divergenciaVolumePct > 0 ? '+' : ''}${pct(r.divergenciaVolumePct)}. A norma manda recusar a carga e comunicar o órgão; os lotes ficam com divergência até serem liberados.`,
          link: '/recebimento',
        }));
        const semDof = D.notas.filter((n) => n.situacao === 'aguardando_dof').length;
        const aReceber = D.notas.filter((n) => n.situacao === 'aguardando_recebimento').length;
        return [
          ...divergentes,
          ...(semDof ? [{ id: 'al-sem-dof', nivel: 'atencao' as const, titulo: `${semDof} NF aguardando DOF`, descricao: 'O recebimento não avança sem o DOF cadastrado.', link: '/notas' }] : []),
          ...(aReceber ? [{ id: 'al-receber', nivel: 'atencao' as const, titulo: `${aReceber} NF aguardando recebimento`, descricao: 'NF com DOF pronta para conferência.', link: '/recebimento' }] : []),
          { id: 'al3', nivel: 'atencao' as const, titulo: 'Ajuste de inventário pendente de aprovação', descricao: 'O saldo oficial só muda após a aprovação.', link: '/inventario' },
          { id: 'al4', nivel: 'info' as const, titulo: 'Dados simulados em uso', descricao: 'Esta instalação está em modo de demonstração.', link: '/configuracoes' },
        ];
      },
    },
    fornecedores: { listar: (q) => paginar(D.fornecedores, q) },
    documentos: { listar: (q) => paginar(D.documentos, q) },
    notas: {
      listar: (q) => paginar(D.notas, q),
      cadastrar: async (n, xml) => {
        await atraso(600);
        const f = D.fornecedores.find((x) => x.id === n.fornecedorId);
        if (!f) throw new ApiError(422, 'Fornecedor não encontrado.', { fornecedorId: 'Selecione um fornecedor cadastrado.' });
        if (f.status === 'bloqueado') throw new ApiError(422, 'Fornecedor bloqueado.', { fornecedorId: 'Fornecedor bloqueado não pode emitir NF para recebimento.' });
        const chave = n.chaveAcesso?.replace(/\D/g, '') || undefined;
        if (chave && !chaveAcessoValida(chave)) throw new ApiError(422, 'Chave de acesso inválida.', { chaveAcesso: 'Confira os 44 dígitos da chave.' });
        if (chave && D.notas.some((x) => x.chaveAcesso === chave)) throw new ApiError(409, 'Já existe uma NF com esta chave de acesso.', { chaveAcesso: 'Chave de acesso já cadastrada.' });
        if (D.notas.some((x) => x.fornecedorId === f.id && x.numero === n.numero && x.serie === n.serie)) {
          throw new ApiError(409, 'Esta NF já foi cadastrada para o fornecedor.', { numero: 'NF já cadastrada (mesmo número e série).' });
        }
        if (!n.itens.length) throw new ApiError(422, 'Informe ao menos um item.');
        const id = novoId('nf');
        const itens: ItemNf[] = n.itens.map((it, i) => {
          const e = D.especies.find((x) => x.id === it.especieId);
          const t = D.tamanhos.find((x) => x.id === it.tamanhoId);
          if (!e || !t) throw new ApiError(422, 'Espécie ou tamanho do item não encontrado no cadastro.');
          return { id: `${id}-i${i + 1}`, descricao: it.descricao, especieId: e.id, especie: e.nomeCientifico, tamanhoId: t.id, tamanho: t.codigo, quantidade: it.quantidade };
        });
        const nf: NotaFiscal = {
          id, numero: n.numero, serie: n.serie, chaveAcesso: chave, fornecedorId: f.id, fornecedor: f.razaoSocial, emissao: n.emissao,
          origem: xml ? 'xml' : 'manual', xmlAnexado: !!xml, dofSugerido: n.dofSugerido, itens, quantidadeTotal: itens.reduce((a, x) => a + x.quantidade, 0),
          situacao: 'aguardando_dof',
        };
        D.notas.unshift(nf);
        return nf;
      },
      cadastrarDof: async (nfId, d, pdf) => {
        await atraso(600);
        const nf = D.notas.find((x) => x.id === nfId);
        if (!nf) throw new ApiError(404, 'NF não encontrada.');
        if (nf.dof) throw new ApiError(409, 'Esta NF já tem DOF (um DOF por NF).');
        if (!pdf.name.toLowerCase().endsWith('.pdf')) throw new ApiError(422, 'O DOF deve ser anexado em PDF.', { pdf: 'Anexe o PDF do DOF.' });
        if (D.notas.some((x) => x.dof?.codigoControle.toLowerCase() === d.codigoControle.toLowerCase())) {
          throw new ApiError(409, 'Código de controle já usado em outro DOF.', { codigoControle: 'Código de controle já cadastrado.' });
        }
        const volumes = [...new Map(nf.itens.map((i) => [i.especieId, i.especie]))].map(([especieId, especie]) => {
          const v = d.volumes.find((x) => x.especieId === especieId)?.volumeM3;
          if (!v || v <= 0) throw new ApiError(422, `Informe o volume do DOF para ${especie}.`, { [`vol_${especieId}`]: 'Informe o volume em m³.' });
          return { especieId, especie, volumeM3: v };
        });
        nf.dof = {
          numero: d.numero, codigoControle: d.codigoControle, validade: d.validade, volumes, volumeTotalM3: volumes.reduce((a, v) => a + v.volumeM3, 0),
          arquivoPdf: pdf.name.slice(0, 80), declaracao: 'pendente',
        };
        nf.situacao = 'aguardando_recebimento';
        return nf;
      },
    },
    recebimentos: {
      listar: (q) => paginar(D.recebimentos, q),
      confirmar: async (d, fotos) => {
        await atraso(700);
        const nf = D.notas.find((x) => x.id === d.nfId);
        if (!nf) throw new ApiError(404, 'NF não encontrada.');
        return receber(D, nf, d, { quando: new Date().toISOString(), usuario: D.usuarioDemo.nome, fotos: fotos.length, novoId });
      },
    },
    lotes: { listar: (q) => paginar(D.lotes, q) },
    fardos: { listar: (q) => paginar(D.fardos, q) },
    estoque: { listar: (q) => paginar(D.saldos, q) },
    movimentacoes: {
      listar: (q) => paginar(D.movimentacoes, q),
      registrar: async (n) => {
        await atraso(600);
        const lote = D.lotes.find((l) => l.codigo.toLowerCase() === n.loteCodigo.trim().toLowerCase());
        if (!lote) throw new ApiError(404, 'Lote não encontrado.', { loteCodigo: 'Lote inexistente.' });
        if (lote.estoqueStatus === 'bloqueado') throw new ApiError(409, 'Lote bloqueado: movimentação não permitida.');
        const m: Movimentacao = { id: novoId('m'), tipo: n.tipo, loteCodigo: lote.codigo, quantidade: n.quantidade, origem: n.origem || '—', destino: n.destino || '—', dataHora: new Date().toISOString(), usuario: D.usuarioDemo.nome, status: 'pendente' };
        D.movimentacoes.unshift(m);
        return m;
      },
    },
    inventario: {
      listar: (q) => paginar(D.sessoesInventario, q),
      criarSessao: async (d) => {
        await atraso(500);
        const s: SessaoInventario = { id: novoId('i'), descricao: d.descricao, local: d.local, abertaEm: new Date().toISOString(), estado: 'em_contagem', itensContados: 0, divergencias: 0, ajuste: 'nao_aplicavel' };
        D.sessoesInventario.unshift(s);
        return s;
      },
      registrarContagem: async (id, itens) => {
        await atraso(500);
        const s = D.sessoesInventario.find((x) => x.id === id);
        if (!s) throw new ApiError(404, 'Sessão não encontrada.');
        s.itensContados += itens.length;
        return s;
      },
      divergencias: (id, q) => paginar(D.divergenciasInventario.filter((x) => x.sessaoId === id), q),
    },
    visao: {
      listar: (q) => paginar(D.processamentos, q),
      enviarImagem: async (arquivo) => {
        await atraso(700);
        const p: ProcessamentoImagem = { id: novoId('p'), arquivo: arquivo.name.slice(0, 60), enviadoEm: new Date().toISOString(), estado: 'na_fila', revisao: 'nao_aplicavel' };
        D.processamentos.unshift(p);
        return p;
      },
    },
    patio: { listar: (q) => paginar(D.locaisPatio, q), transferencias: { listar: (q) => paginar(D.transferencias, q) } },
    relatorios: {
      listar: (q) => paginar(D.relatorios, q),
      solicitarExportacao: async (relatorioId, formato) => { await atraso(500); return { id: novoId('x'), relatorioId, formato, estado: 'solicitada' as const }; },
    },
    auditoria: { listar: (q) => paginar(D.auditoria, q) },
    especies: {
      listar: (q) => paginar(D.especies, q),
      atualizar: async (id, d) => {
        await atraso(500);
        const e = D.especies.find((x) => x.id === id);
        if (!e) throw new ApiError(404, 'Espécie não encontrada.');
        e.classe = d.classe ?? undefined;
        e.uso = d.uso;
        // A classe exibida em lotes e saldos é a da espécie.
        for (const x of [...D.lotes, ...D.saldos]) if (x.especieDocumental === e.nomeCientifico) x.classe = e.classe;
        return e;
      },
    },
    tamanhos: {
      listar: (q) => paginar(D.tamanhos, q),
      cadastrar: async (n) => {
        await atraso(500);
        validarTamanho(n);
        const t = comVolume(novoId('t'), n);
        D.tamanhos.push(t);
        return t;
      },
      atualizar: async (id, n) => {
        await atraso(500);
        const i = D.tamanhos.findIndex((x) => x.id === id);
        if (i < 0) throw new ApiError(404, 'Tamanho não encontrado.');
        validarTamanho(n, id);
        D.tamanhos[i] = comVolume(id, n);
        return D.tamanhos[i];
      },
    },
    volumetria: { listar: (q) => paginar(D.volumetria, q) },
    usuarios: { listar: (q) => paginar(D.usuarios, q) },
    sistema: { testarConexao: async () => { await atraso(300); return { ok: true, mensagem: 'Modo simulado: nenhuma conexão real foi testada.', simulado: true }; } },
  };
}
