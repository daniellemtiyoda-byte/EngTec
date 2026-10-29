# Integração com o sistema de inspeção (Railway Edge Inspector) — PROPOSTA

> **Estado: proposta do front-end, pendente de aprovação do grupo, do back-end e da equipe do Inspector.**
> O front já funciona com este desenho no modo simulado (`VITE_USE_MOCK=true`). Nada aqui foi combinado ainda.

## O que é o Inspector

App de desktop (Electron, Windows) de outra equipe que inspeciona dormentes **peça por peça**: fotografa as 4 faces,
uma rede neural local marca rachadura, podridão, fungo, nó e deterioração, e o app dá para cada peça:

- veredito `APROVADO`, `ATENÇÃO` ou `REJEITADO`;
- índice de integridade de 0 a 100;
- relatório em PDF e fotos marcadas.

Ele grava em PostgreSQL (opcional, configurado no próprio app) e, no futuro, em Supabase. Tabelas que ele cria sozinho:

| Tabela | Uma linha por | Campos que interessam ao Holz Trilho |
|---|---|---|
| `inspecoes` | peça | `id` (UUID), `codigo_peca`, `veredito`, `pontuacao` (índice 0–100), `operador`, `estacao`, `criado_em` |
| `inspecao_faces` | face | não usamos: o detalhe técnico fica no Inspector |

O Inspector **não** identifica espécie nem tamanho e não tem a noção de lote nem um "finalizar lote".

## Fluxo combinado

```
NF + DOF ─> Recebimento (unidades) ─> Lote LT26-0042, "aguardando inspeção", sem fardos
                                          │
          Holz Trilho imprime as etiquetas LT26-0042-0001 ... -0150; uma é colada em cada peça
                                          │
          Inspector: cada peça com codigo_peca = o código da etiqueta
                                          │  (banco a banco, sem ação de ninguém)
          Holz Trilho: "Em inspeção", x de N peças com resultado
                                          │
          Almoxarife: "Formar fardos" (o sistema distribui as peças pelos fardos, ele ajusta e confirma)
                                          │
          Fardos por resultado: aprovadas por categoria → disponíveis; quarentena, reprovadas e divergentes → segregados
```

- O recebimento é confirmado na chegada (NF, DOF, volume IBAMA, alerta do Sinaflor seguem normais). A inspeção pode vir dias depois.
- **Nada muda no estoque** enquanto as peças chegam. O estoque só muda quando o almoxarife conclui a formação dos fardos.
- Os fardos só têm peças de um lote e de um grupo (mesmo resultado; aprovadas também com a mesma categoria), até 14 por fardo.
- Vale a inspeção mais recente de cada peça; as anteriores ficam no histórico do lote.
- O código da etiqueta é o ID do dormente: o Holz Trilho registra em qual fardo cada peça está e, na separação da RME, na perda
  e no ajuste, quais peças saem. Assim cada dormente é rastreado da NF ao destino.
- Se o Inspector imprimir a etiqueta ele mesmo (impressora de etiquetas na estação), o formato é o mesmo: `LTaa-NNNN-SSSS`.

## Integração banco a banco (back-end)

1. **Banco:** o Inspector aponta a conexão PostgreSQL dele para o banco do Holz Trilho, num schema próprio (`inspecao`),
   com um usuário só dele. Esse usuário precisa de `CREATE`/`ALTER` no schema, porque o Inspector cria e altera as tabelas sozinho,
   e de `INSERT`/`UPDATE`/`DELETE` só nelas. Ele não acessa mais nada.
2. **Leitura:** um trigger em `inspecao.inspecoes` (ou um job a cada minuto) lê as linhas novas e alteradas e:
   - reconhece `codigo_peca` no padrão `^LT\d{2}-\d{4}-\d{4}$` (lote + sequência);
   - acha o lote; se o código não bater com nenhum lote aberto, guarda numa lista de **não vinculadas** para alguém corrigir;
   - aplica o mapeamento abaixo e grava a inspeção da peça (`InspecaoPeca` em `src/types/models.ts`), marcando a anterior da mesma peça como não vigente;
   - recusa peça de lote com a inspeção já concluída (fica nas não vinculadas).
3. **Mapeamento provisório** (a confirmar com o grupo e com a CPTM):

   | Inspector | Holz Trilho |
   |---|---|
   | `APROVADO` | `aprovado` |
   | `ATENÇÃO` | `quarentena` |
   | `REJEITADO` | `reprovado` |
   | `pontuacao` ≥ 80 | Categoria 1 |
   | `pontuacao` 50–79 | Categoria 2 |
   | `pontuacao` < 50 | Categoria 3 |

   Os limites 80 e 50 são parâmetros do servidor (`categoria1IndiceMin`, `categoria2IndiceMin`), editáveis em Configurações.
4. **Relatório:** o Holz Trilho guarda só o resultado e um link (`relatorioUrl`) para o PDF do Inspector, servido pelo back-end
   com controle de acesso. As fotos não são copiadas.
5. **Contratos com o front:** em `docs/CONTRATOS-API.md` (inspeção, sugestão e formação de fardos, lançamento manual).

### Cuidados

- O Inspector guarda a string de conexão (com a senha) em texto puro no `config.json` do PC da linha. Por isso o usuário dele
  tem de ser restrito ao schema `inspecao`.
- O Inspector conecta com SSL sem conferir o certificado (`rejectUnauthorized: false`). Pedir à equipe dele que confira, ou usar uma rede privada.
- O Inspector grava as fotos dentro do banco (`BYTEA` em `inspecao_faces`): são 4 a 8 JPEGs por peça, e o banco cresce rápido.
  Considere um disco ou tablespace separado para o schema, ou um expurgo das fotos já com PDF.
- Ao reenviar uma inspeção, o Inspector atualiza só `veredito`, `resumo` e `pontuacao` (`ON CONFLICT ... DO UPDATE`).
  O trigger precisa tratar `UPDATE` também.

## Botão "Inspecionar no Inspector" (RF05) — pedido à equipe do Inspector

O Holz Trilho abre o Inspector por um endereço próprio:

```
railway-inspector://inspecionar?lote=LT26-0042&nf=1010&especie=Dialium%20guianense&tamanho=T1&quantidade=150
```

O que pedimos ao Inspector (cerca de 20 linhas no `main.js` do Electron):

1. Registrar o protocolo `railway-inspector` (`app.setAsDefaultProtocolClient('railway-inspector')`) e tratar o endereço ao abrir
   (`process.argv` no Windows, `second-instance` com `app.requestSingleInstanceLock()` quando o app já está aberto).
2. Validar os parâmetros (lote no padrão `LT\d{2}-\d{4}`, quantidade inteira) e mostrar o lote na tela, sem executar nada vindo do endereço.
3. Preencher sozinho o `codigo_peca` de cada peça: `<lote>-0001`, `-0002`... até a quantidade, para o operador não digitar.
   A ordem precisa ser a das etiquetas coladas nas peças (ou o operador lê o código da etiqueta e confirma).

Enquanto isso não existe, o botão do Holz Trilho mostra os mesmos dados para copiar e digitar à mão. No celular só aparecem os dados,
porque o Inspector não abre lá.

## Pontos em aberto

- Mapeamento final do veredito e número de categorias, com os critérios de cada uma (CPTM + equipe do Inspector).
- Quem resolve as peças com espécie ou tamanho diferente da NF (fardo bloqueado com `motivoBloqueio`) e como.
- Destino do reprovado (RF28: devolução, descarte, segregação).
- Reinspeção de peça que já está em fardo (exige mover entre fardos com ajuste aprovado).
- Se o Inspector passar a usar Supabase em vez de PostgreSQL próprio, a leitura muda (webhook do Supabase chamando o back-end).
