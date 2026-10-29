# PRD · Sistema de Rastreabilidade e Gestão de Estoque de Dormentes

Projeto CPTM · Jornada Inovação em Movimento · versão de 27/10/2026

> Cópia de trabalho do PRD. A versão viva fica no documento compartilhado do grupo; ao mudar uma regra, atualize os dois.

## Visão geral

O sistema substitui o controle em papel do almoxarifado de dormentes por um registro digital que acompanha cada lote de dormentes da nota fiscal até a entrega ao requisitante. O foco é rastreabilidade e controle de entradas, saídas, saldo e tempo de estocagem.

**Problema atual.** Hoje a CPTM não tem sistema para os dormentes. O recebimento, a armazenagem e a retirada são controlados em papel, e a retirada usa a RME (Requisição de Material), um formulário com data, nº da RME, almoxarife que entrega, supervisor que confere, lote de entrega e uma tabela de 22 espécies com quantidade e tamanho. O único controle de idade do estoque é uma marcação de lote "anterior a junho/2023" ou "após julho/2023".

Isso gera as dores descritas no plano de trabalho: falta de controle em tempo real, baixa rastreabilidade, tempo alto para localizar material, risco de perdas e extravios e ausência de indicadores. Como empresa pública, a CPTM presta contas ao IBAMA, e reunir essas informações a partir do papel é uma das dificuldades que ela relatou.

**Proposta.** Um sistema web e mobile de rastreabilidade e gestão de estoque, com a RME digitalizada, o FIFO calculado pela data real de entrada e os relatórios que a CPTM precisa para prestar contas ao IBAMA. No MVP todas as entradas são manuais, em formulários simples, e a rastreabilidade é feita por lote e fardo; a entrada automatizada (QR Code ou RFID) fica para uma fase futura. A determinação da espécie e a classificação de qualidade pertencem a um projeto separado, acessado por um botão dentro deste sistema.

**Posicionamento.** É uma solução focada no ciclo de vida do dormente no almoxarifado, que pode exportar dados ou se integrar a sistemas corporativos no futuro.

## Glossário

Estes termos devem ser usados exatamente assim nas telas, no código e na documentação.

| Termo | Significado |
| --- | --- |
| Dormente | Peça de madeira que sustenta os trilhos; é o material controlado pelo sistema |
| Fardo | Grupo de dormentes amarrados, normalmente 14, com quantidade variável, montado depois da inspeção com peças de um lote e de um mesmo resultado (e categoria, se aprovadas). É a unidade física que se movimenta no pátio |
| Fardo aberto | Fardo do qual já saíram dormentes e que mantém saldo |
| Lote | Conjunto de dormentes de uma mesma NF, espécie e tamanho, criado no recebimento. É a base do FIFO e da rastreabilidade |
| NF / NF-e | Nota fiscal do fornecedor; a NF-e pode ser importada pelo XML |
| DOF | Documento de Origem Florestal, exigido pelo IBAMA para transportar e armazenar madeira nativa |
| Sinaflor | Sistema do IBAMA onde a CPTM declara o recebimento dos DOFs |
| RME | Requisição de Material, o pedido de retirada de dormentes do estoque |
| Espécie | Madeira do dormente, identificada pelo nome científico (22 na lista atual) |
| Classe | Classificação que depende da espécie (ex. 1ª). Sempre exibida como "Classe" |
| Categoria | Classificação numérica do estado do dormente (rachaduras, defeitos). Sempre exibida como "Categoria" |
| Endereço | Localização no pátio (pátio, rua, posição) |
| Movimentação | Registro imutável de entrada, transferência, saída, perda ou ajuste |
| Baixa | Saída do estoque após conferência do supervisor |
| Plaqueta | Placa metálica do fornecedor presa ao dormente, com dados do fornecimento |

## Objetivos e indicadores

O MVP precisa provar, até o Gate 3, que é possível saber onde está cada lote, há quanto tempo ele está no pátio e para quem foi entregue, sem papel.

| Objetivo | Indicador | Como medir no piloto |
| --- | --- | --- |
| Localizar material mais rápido | Tempo médio de localização (min) | Cronometrar a busca de um lote antes (papel) e depois (sistema) |
| Garantir FIFO real | % de saídas que respeitaram o lote mais antigo | Relatório de expedição x sugestão do sistema |
| Controlar tempo de estocagem | Idade média do estoque (dias) e qtd. acima do limite | Dashboard de estoque |
| Reduzir perdas e divergências | Divergência no inventário (%) | Contagem física x saldo do sistema |
| Eliminar papel na retirada | % de RMEs emitidas no sistema | Contagem de RMEs digitais no período |
| Rastreabilidade completa | % de lotes com histórico NF → destino | Consulta por lote ou fardo |
| Sistema ágil em campo | Tempo para registrar uma movimentação (s) | Teste em celular no pátio |

Tempo de localização, perdas e tempo de resposta vêm do plano de trabalho; os demais foram acrescentados para medir FIFO, idade do estoque e digitalização. Os valores de partida (baseline) ainda precisam ser levantados com a CPTM.

## Usuários e perfis

Os perfis espelham os papéis que já aparecem na RME em papel, para que a assinatura vire login.

| Perfil | O que faz no sistema | Onde usa |
| --- | --- | --- |
| Almoxarife | Registra NF, confirma recebimento, etiqueta, armazena, separa e entrega | Celular no pátio e computador |
| Operador de pátio | Registra movimentações entre ruas e faz inventário | Celular no pátio |
| Supervisor de conferência | Confere e aprova a entrega da RME | Celular ou computador |
| Requisitante (manutenção / via permanente) | Abre RME, acompanha status, confirma recebimento | Computador ou celular |
| Gestor | Consulta dashboard, relatórios e histórico | Computador |
| Administrador | Cadastra usuários, espécies, tamanhos, locais e fornecedores | Computador |

O inspetor usa o sistema de inspeção, que é o outro projeto, e não precisa de perfil próprio aqui além do acesso pelo botão.

## Escopo

O MVP cobre o ciclo completo do dormente dentro do almoxarifado, da NF até a baixa, com o mínimo necessário em cada etapa para demonstrar rastreabilidade no piloto.

**Entra no MVP**

- Cadastro de NF e DOF e confirmação de recebimento com conferência de quantidade e volume
- Rastreabilidade por lote e fardo, ligando cada um à NF e ao DOF de origem
- Formação dos fardos depois da inspeção, pelo resultado de cada peça, com código gerado a partir do lote
- Endereçamento (pátio, rua, posição) e movimentação entre endereços
- Saldo de estoque por espécie, tamanho, lote e endereço, com idade de cada lote
- RME digital com destinatário, urgência e data limite
- Separação com sugestão FIFO e conferência do supervisor
- Baixa do estoque e histórico completo por lote e fardo
- Relatório de movimentação e dashboard com os indicadores
- Controles e relatórios para o IBAMA (DOF, saldo em m³ por espécie, divergências)
- Botão de acesso ao sistema de inspeção e bloqueio do material até o resultado

**Fica para depois**

- Entrada automatizada por QR Code por dormente, RFID ou sensores IoT
- Acompanhamento do dormente depois de instalado na via
- Declaração automática no Sinaflor/DOF (o MVP organiza os dados; a declaração continua no sistema do IBAMA)
- Gestão de contratos e pedidos de compra

**Integração com o projeto de inspeção**

O contrato entre os dois sistemas precisa ser combinado entre as equipes agora, para que se encaixem sem retrabalho.

| Direção | Dados | Quando |
| --- | --- | --- |
| Estoque → Inspeção | ID do lote, NF, quantidade recebida, espécie e tamanho declarados na NF | Ao clicar no botão após o recebimento (abre o Inspector) |
| Inspeção → Estoque | Por peça (código do lote + sequência, ex. LT26-0042-0007): resultado (aprovado, reprovado, quarentena), índice que define a categoria, data, inspetor e link do relatório | A cada peça inspecionada, banco a banco; o estoque só muda quando o almoxarife forma os fardos |

Se o outro projeto não estiver pronto a tempo, o resultado da inspeção é lançado manualmente no estoque, no mesmo formato de dados. Detalhes técnicos da integração (banco a banco, mapeamento provisório do veredito do Inspector, botão de abertura) estão em `docs/INTEGRACAO-INSPECAO.md`. O Inspector não identifica espécie nem tamanho: peças diferentes do declarado na NF são marcadas como divergentes na formação dos fardos.

## Fluxo de informação

1. **NF e DOF**: cadastro da nota (manual ou XML) e do DOF.
2. **Recebimento**: conferência da quantidade física contra a NF.
3. **Inspeção** (sistema externo, ou lançamento manual): cada peça do lote recebe um resultado; até o fim da inspeção o lote fica fora do estoque disponível.
4. **Fardos**: com todas as peças inspecionadas, os fardos são formados pelo resultado, ligados ao lote, à NF e ao DOF de origem; aprovado segue, reprovado ou em quarentena fica segregado.
5. **Armazenagem**: endereço (pátio, rua, posição).
6. **Estoque**: saldo e idade do lote.
7. **RME digital**: o requisitante faz o pedido.
8. **Separação FIFO**: o sistema sugere o lote mais antigo.
9. **Conferência**: o supervisor aprova.
10. **Baixa e entrega**: o histórico do lote é fechado.

Cada passo grava uma movimentação com lote, usuário, data e hora. O material só entra no estoque disponível depois de aprovado pela inspeção; a RME puxa a separação, que sugere o lote mais antigo, e a baixa só acontece após a conferência do supervisor. Fora do fluxo principal, o sistema também registra transferências entre ruas, inventários e ajustes.

## Requisitos funcionais

Os requisitos marcados como Essencial formam o MVP do Gate 3; os Desejáveis entram se sobrar tempo.

| ID | Etapa | Requisito | Prioridade |
| --- | --- | --- | --- |
| RF01 | Nota fiscal | Cadastrar NF manualmente ou importando o XML da NF-e, que preenche número, chave de acesso, fornecedor, data, itens e quantidades e impede cadastro duplicado | Essencial |
| RF02 | Nota fiscal | Guardar o XML da NF e anexar o PDF do DOF ao registro da entrada | Essencial |
| RF03 | Recebimento | Confirmar recebimento informando a quantidade física de cada item da NF, em unidades, registrar divergência com a NF e anexar fotos da carga (obrigatórias quando houver divergência ou avaria) | Essencial |
| RF04 | Recebimento | Criar o lote automaticamente ao confirmar o recebimento, um por espécie e tamanho da NF, com código sequencial por ano e data de recebimento | Essencial |
| RF05 | Inspeção | Botão que abre o sistema de inspeção com os dados do lote | Essencial |
| RF06 | Inspeção | Receber o resultado e a categoria de cada peça do lote, com opção de lançar o resultado manualmente, e concluir a inspeção formando os fardos | Essencial |
| RF07 | Fardo | Formar os fardos depois da inspeção, registrando quais dormentes (pelo código da etiqueta) vão em cada fardo (o sistema distribui, até 14 por fardo, sem misturar resultados ou categorias; o almoxarife ajusta e confirma), com código gerado a partir do lote (ex. LT26-0042-F03, fardo 3 do lote 42 de 2026), e imprimir etiqueta com código, espécie, classe, categoria e tamanho | Essencial |
| RF08 | Fardo | Baixar parte dos dormentes de um fardo e manter o saldo restante (fardo aberto) | Essencial |
| RF09 | Consulta | Buscar lote ou fardo pelo código e mostrar localização, NF, DOF e histórico | Essencial |
| RF10 | Armazenagem | Registrar endereço (pátio, rua, posição) do fardo | Essencial |
| RF11 | Armazenagem | Transferir fardos ou dormentes entre endereços | Essencial |
| RF12 | Estoque | Consultar saldo por espécie, tamanho, lote, endereço e status, em unidades e m³ | Essencial |
| RF13 | Estoque | Mostrar a idade de cada lote e alertar quando passar do limite | Essencial |
| RF14 | Estoque | Mapa visual do pátio por rua, colorido por espécie ou idade | Desejável |
| RF15 | Estoque | Inventário por contagem manual, com relatório de divergências e ajuste aprovado | Desejável |
| RF16 | RME | Abrir RME com destinatário, espécie, tamanho, quantidade, urgência e data limite | Essencial |
| RF17 | RME | Acompanhar status da RME (aberta, em separação, conferida, entregue, cancelada) | Essencial |
| RF18 | Separação | Sugerir lotes e endereços por FIFO para atender a RME | Essencial |
| RF19 | Separação | Validar lote, espécie e quantidade separados contra a RME e alertar divergência, registrando quais dormentes saem de cada fardo | Essencial |
| RF20 | Expedição | Conferência e aprovação do supervisor pelo login | Essencial |
| RF21 | Expedição | Dar baixa no estoque ao confirmar a entrega | Essencial |
| RF22 | Expedição | Gerar comprovante da RME em PDF, no formato do papel atual | Desejável |
| RF23 | Rastreabilidade | Histórico do lote e do fardo da NF ao destino, com usuário e data de cada evento | Essencial |
| RF24 | Relatórios | Relatório de movimentações por período, espécie, tipo e usuário | Essencial |
| RF25 | Relatórios | Dashboard com os indicadores do projeto | Essencial |
| RF26 | Relatórios | Exportar consultas para Excel | Desejável |
| RF27 | Cadastros | Espécies (22 da lista atual, com nome científico e classe), tamanhos (3, com largura, altura e comprimento; o volume em m³ é calculado pelo sistema), fornecedores, endereços e usuários | Essencial |
| RF28 | Material reprovado | Registrar destino do reprovado (devolução, descarte, segregação) | Desejável |
| RF29 | IBAMA | Cadastrar DOF (número, código de controle, validade, volume por espécie) vinculado à NF, sugerindo o número quando ele constar nas informações complementares do XML. Evolução: extrair os campos automaticamente do PDF do DOF, com confirmação do usuário | Essencial |
| RF30 | IBAMA | Alertar DOF com recebimento pendente de declaração no Sinaflor, com o prazo | Essencial |
| RF31 | IBAMA | Calcular divergência de volume recebido x DOF e sinalizar acima de 10% | Essencial |
| RF32 | IBAMA | Relatório de saldo em m³ por espécie e dimensão para conferir com o DOF | Essencial |
| RF33 | IBAMA | Registrar perdas com motivo e gerar relatório para comunicação ao órgão | Desejável |
| RF34 | IBAMA | Relatório anual de entradas e saídas por espécie e volume | Desejável |

## Telas do MVP

As telas seguem a ordem do fluxo do dormente. Cada uma só está pronta quando atende ao critério de aceite da terceira coluna.

| Tela | O que faz | Pronta quando |
| --- | --- | --- |
| Login | Acesso por matrícula e senha, com menu conforme o perfil | Cada perfil vê só as funções permitidas a ele |
| Cadastro de NF e DOF | Cadastra a NF manualmente ou por XML e registra o DOF com o PDF anexo | O XML preenche os campos; NF com chave de acesso repetida é bloqueada; o recebimento não avança sem DOF |
| Recebimento | Confere quantidades e registra divergências | Ao confirmar, o sistema cria um lote por espécie e tamanho, em unidades; divergência exige foto; divergência de volume acima de 10% gera alerta; lotes ficam "aguardando inspeção" |
| Inspeção | Abre o sistema de inspeção, acompanha as peças inspecionadas, permite lançar o resultado manualmente e forma os fardos | Os fardos só são formados com todas as peças com resultado; fardo aprovado fica disponível; reprovado, em quarentena ou com espécie divergente não aparece para separação; o lançamento manual e a formação registram quem fez |
| Armazenagem | Define e altera o endereço dos fardos | Toda mudança de endereço gera uma movimentação com usuário e data |
| Estoque | Consulta o saldo por fardo, com filtros por espécie, tamanho, lote, endereço e status; cada fardo abre os seus dormentes | Mostra quantidade e m³, idade (pela entrada do lote) e destaque acima do limite de dias; o fardo mostra quais dormentes tem e por onde saíram os que já saíram |
| RME | Abre a requisição e acompanha o status | RME tem destinatário, itens, urgência e data limite, e muda de status ao longo do fluxo |
| Separação e conferência | Sugere fardos para a RME e registra a conferência | A sugestão segue o FIFO e prioriza fardos abertos; pular a sugestão pede justificativa; a baixa só ocorre após aprovação do supervisor; saída parcial deixa o fardo aberto com o saldo certo |
| Consulta e rastreabilidade | Busca lote ou fardo pelo código | Mostra NF, DOF, endereço atual e todo o histórico até o destino |
| Relatórios e dashboard | Indicadores, movimentações e relatórios do IBAMA | Saldo em m³ por espécie e dimensão, lista de DOFs pendentes de declaração com prazo, movimentações por período |
| Cadastros | Espécies, tamanhos, fornecedores, endereços e usuários | Ao cadastrar um tamanho com largura, altura e comprimento, o sistema calcula o volume em m³ |

## Prestação de contas ao IBAMA

Dormentes de madeira nativa só podem ser transportados e armazenados com DOF (Documento de Origem Florestal), e o saldo declarado no sistema do IBAMA precisa refletir o estoque físico do pátio. O nosso sistema não substitui o Sinaflor/DOF, mas guarda os dados e gera os relatórios que a CPTM precisa para declarar e para atender uma vistoria.

| Obrigação | O que a norma pede | Como o sistema ajuda |
| --- | --- | --- |
| DOF por carga | Cada NF de produto florestal nativo vem com um DOF, que traz emissor, origem, destino, espécie, produto, quantidade, unidade, valor, transporte e código de controle (art. 31 e 35) | Cadastrar número e código de controle do DOF junto com a NF e não permitir recebimento sem DOF |
| Declarar o recebimento | O destinatário informa o recebimento no Sinaflor pelo código de controle até o dia seguinte ao fim da validade do DOF; se não fizer, novos DOFs ficam suspensos (art. 51) | Alerta de DOF pendente de declaração com o prazo, e registro de quem declarou e quando |
| Conferir volume | Divergência acima de 10% entre carga real e DOF/NF obriga a recusar a carga e comunicar o órgão; abaixo disso, pedir ajuste (art. 53) | Comparar o volume recebido (m³, por quantidade e tamanho) com o do DOF e sinalizar a faixa |
| Saldo fiel ao físico | O saldo no sistema oficial deve representar o estoque físico do pátio, com tolerância de 10% em inspeção (art. 41) | Saldo em m³ por espécie (nome científico) e dimensão, pronto para conferir com o saldo do DOF |
| Perdas | Perdas, incêndios e intempéries devem ser informados ao órgão, com o produto organizado por tipo, espécie e dimensões (art. 42) | Baixa por perda com motivo e relatório para a comunicação |
| Vistoria | O órgão pode vistoriar e pedir documentos a qualquer momento (art. 65) | Inventário por endereço, espécie e lote, com NF e DOF de origem de cada lote |
| Relatório anual (a confirmar) | Empresas inscritas no CTF/APP em atividades sujeitas ao RAPP entregam relatório anual | Relatório anual de entradas e saídas por espécie e volume |

Artigos da [IN Ibama 21/2014](https://www.ibama.gov.br/phocadownload/dof/legislacao/IN-IBAMA-21-24.12.2014-Sinaflor.pdf). Dormentes constam entre os produtos que exigem DOF no [FAQ do DOF da Semil-SP](https://sigam.ambiente.sp.gov.br/sigam3/repositorio/571/documentos/Perguntas%20frequentes%2009.11.2023-revis%C3%A3o.pdf). O IBAMA trabalha com volume e nome científico, então o cadastro de tamanhos guarda as três dimensões e o sistema calcula o volume em m³, enquanto o cadastro de espécies guarda o nome científico (a RME já usa essa lista).

## Regras de negócio

A regra central é que nenhuma movimentação acontece sem usuário identificado e lote de referência, e o saldo nunca é editado diretamente.

1. **Unidade de rastreio.** O rastreio é por lote (NF + espécie + tamanho), por fardo e por dormente. Na inspeção cada peça recebe uma etiqueta impressa com o código do lote e a sua sequência (ex. LT26-0042-0007), que é o ID do dormente. O fardo é formado depois da inspeção, recebe um código formado pelo lote e pela sua sequência dentro dele, e o sistema registra quais dormentes estão nele; movimentar um fardo movimenta todos os dormentes dele. A separação da RME, as perdas e os ajustes informam quais dormentes saem, então cada peça é rastreada da NF ao destino. A leitura automática (QR Code, RFID) continua para a fase de automação: no MVP o código da etiqueta é digitado ou tocado na tela.
2. **Lote.** Todo recebimento gera um lote com a data de entrada. A idade do lote é calculada a partir dessa data e substitui a marcação "antes/após julho de 2023" do papel.
3. **Bloqueio por inspeção.** Lote com a inspeção não concluída (sem fardos) e fardos em "quarentena", "reprovado" ou com espécie/tamanho divergente da NF não aparecem como disponíveis nem podem ser separados para RME.
4. **FIFO.** A separação sugere sempre o lote disponível mais antigo da espécie e do tamanho pedidos. Pular a sugestão exige justificativa registrada.
5. **Alerta de idade.** Lotes acima de um limite de dias (a definir com a CPTM) aparecem em destaque no estoque e no dashboard.
6. **Saldo por movimentação.** Toda entrada, transferência, saída e ajuste vira um registro imutável. O saldo é calculado a partir desses registros; correções são feitas por um novo registro de ajuste, nunca apagando o anterior.
7. **Saída parcial de fardo.** Os fardos têm normalmente 14 dormentes, mas a quantidade varia e é confirmada na formação, depois da inspeção. Ao retirar parte de um fardo, por exemplo 8 de 14, o sistema baixa os 8, o fardo fica com saldo 6 e passa ao status "aberto". Na separação, fardos abertos da mesma espécie e tamanho são sugeridos antes de abrir um novo, respeitando o FIFO.
8. **Conferência em duas pessoas.** A baixa só acontece com a separação do almoxarife e a conferência do supervisor, como na RME em papel.
9. **Ajuste de inventário.** Divergências de inventário só alteram o saldo depois de aprovadas pelo supervisor ou gestor.
10. **Registro automático.** Data, hora e usuário de cada ação são gravados pelo sistema, sem digitação.

**Classe x categoria.** Classe é determinada pela espécie, então cada uma das 22 espécies tem sua classe no cadastro (a plaqueta mostra, por exemplo, Dialium guianense / 1ª). Categoria vem do estado do dormente, e quanto mais defeitos como rachaduras, mais baixa ela é, numa escala numérica (1, 2, 3...) a combinar com o projeto de inspeção. As duas chegam do projeto de inspeção, mas também podem ser lançadas manualmente neste sistema, com registro de quem lançou.

## Modelo de dados

O núcleo do modelo é o Lote, ligado à NF e ao DOF e dividido em fardos, com todas as mudanças registradas em Movimentação.

| Entidade | Principais campos | Relaciona com |
| --- | --- | --- |
| Fornecedor | CNPJ, razão social, contato | NotaFiscal |
| NotaFiscal | número, série, data de emissão, fornecedor, status do recebimento | Fornecedor, ItemNF, DOF |
| DOF | número, código de controle, validade, volume (m³) por espécie, status da declaração (pendente, declarado), data e responsável da declaração | NotaFiscal |
| ItemNF | espécie, tamanho, quantidade declarada, quantidade recebida | NotaFiscal, Lote |
| Especie | nome científico, família, nome popular, classe, uso (via corrida ou AMV) | ItemNF, Dormente |
| Tamanho | código, largura, altura e comprimento (cm); volume em m³ calculado pelo sistema | ItemNF, Dormente |
| Lote | código, data de entrada, NF de origem, ata de registro, contrato, tratamento e empresa, empresa inspetora e ano, status de inspeção | ItemNF, Dormente |
| Fardo | código (lote + sequência, ex. LT26-0042-F03), lote, resultado da inspeção, categoria, endereço atual, quantidade atual, quem formou e quando | Dormente, Endereco |
| Dormente | código individual (etiqueta da inspeção: lote + sequência), lote, fardo, resultado da inspeção, categoria, situação (em estoque ou baixado) e a baixa (saída por RME, perda ou ajuste, com referência) | Lote, Fardo, Movimentacao |
| Endereco | pátio, rua, posição, capacidade | Fardo, Dormente |
| Movimentacao | tipo (entrada, transferência, saída, perda, ajuste), origem, destino, quantidade, dormentes (saída, perda e ajuste), usuário, data/hora, referência (NF ou RME) | Dormente, Fardo, RME |
| RME | número, requisitante, destinatário, urgência, data limite, status, almoxarife, supervisor | ItemRME, Movimentacao |
| ItemRME | espécie, tamanho, quantidade pedida, quantidade entregue | RME |
| Inspecao | por peça: código da peça (lote + sequência), referência externa (link do relatório), resultado, categoria, inspetor, data, se é a vigente | Lote, Dormente |
| Usuario | nome, matrícula, perfil | Movimentacao, RME |

A tabela Inspecao guarda apenas o resultado recebido do outro sistema; o checklist detalhado fica no projeto de inspeção.

## Dados iniciais

O sistema deve começar com estes cadastros. Os campos marcados "a definir" são parametrizáveis e serão preenchidos quando a CPTM responder; para testes, a equipe usa valores provisórios identificados como tal.

**Espécies (lista da RME atual)**

| Nº | Espécie | Classe |
| --- | --- | --- |
| 1 | Apuleia leiocarpa | a definir |
| 2 | Apuleia molaris | a definir |
| 3 | Aspidosperma polyneuron | a definir |
| 4 | Bowdichia brasiliensis ou Bowdichia spp | a definir |
| 5 | Bowdichia nitida | a definir |
| 6 | Bowdichia racemosa | a definir |
| 7 | Dialium guianense | 1ª (conforme plaqueta) |
| 8 | Diplotropis purpurea | a definir |
| 9 | Dipteryx odorata | a definir |
| 10 | Dipteryx spp. | a definir |
| 11 | Enterolobium schomburgkii | a definir |
| 12 | Goupia glabra | a definir |
| 13 | Hymenaea courbaril | a definir |
| 14 | Hymenaea intermedia | a definir |
| 15 | Hymenolobium petraeum ou Hymenolobium spp | a definir |
| 16 | Mezilaurus itauba | a definir |
| 17 | Ocotea neesiana | a definir |
| 18 | Tabebuia serratifolia | a definir |
| 19 | Angelim Vermelho (Promap, AMV) | a definir |
| 20 | Coimal (dormentes antigos, AMV) | a definir |
| 21 | Veneer (dormentes antigos, AMV) | a definir |
| 22 | Astronium graveolens | a definir |

**Tamanhos.** Três tamanhos (T1, T2 e T3), com largura, altura e comprimento a definir. O único valor conhecido é o comprimento de 2,80 m visto na plaqueta.

**Categorias.** Escala numérica (1, 2, 3), com número de níveis e critérios a combinar com o projeto de inspeção.

**Resultados de inspeção.** Aguardando inspeção, aprovado, reprovado, quarentena.

## Requisitos não funcionais

O sistema será usado no pátio, ao ar livre e no celular, então rapidez de registro e telas simples pesam mais que recursos extras.

| Tema | Requisito |
| --- | --- |
| Plataforma | Web responsiva, funcionando no navegador do celular, sem instalar app |
| Entrada de dados | Formulários manuais com listas de seleção e validação, para reduzir erro de digitação, e importação do XML da NF-e |
| Conectividade | No MVP o uso é online, pelo Wi-Fi do pátio. Na fase seguinte entra o modo offline, que guarda os registros no celular e envia ao reconectar; a tecnologia escolhida já deve permitir isso (PWA) |
| Usabilidade | Telas de campo com botões grandes e no máximo 3 toques por operação |
| Segurança | Login individual por matrícula e permissões por perfil |
| Auditoria | Nenhum registro de movimentação pode ser apagado |
| Dados | Banco relacional (ex. MySQL ou PostgreSQL) com backup diário |
| Disponibilidade | Hospedagem em nuvem durante o piloto |

**Automação futura.** O sistema deve deixar pronto o ponto de entrada para QR Code ou RFID, de modo que a entrada automatizada substitua os formulários sem mudar o modelo de dados.

## Riscos e mitigações

O maior risco é de prazo: o MVP precisa estar testado no pátio antes do Gate 3, em novembro.

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Escopo grande para o prazo do programa | MVP incompleto no Gate 3 | Entregar só os requisitos Essenciais e cortar o resto sem negociar |
| Projeto de inspeção atrasar | Lotes sem espécie e categoria confirmadas | Combinar o formato de dados cedo; lançamento manual do resultado no MVP |
| Saldo do sistema divergir do declarado ao IBAMA | Multa e suspensão de DOF | Relatório mensal de conferência saldo x DOF |
| DOF não declarado no prazo | Suspensão de novos DOFs para a CPTM | Alerta de prazo no recebimento |
| Sinal fraco no pátio | Operação travada | Uso online pelo Wi-Fi no MVP; modo offline com sincronização na fase seguinte, com conflitos enviados ao supervisor |
| Resistência à troca do papel | Baixa adesão | Telas simples, RME digital parecida com a de papel, treinamento curto |
| Saldo inicial desconhecido | Estoque começa errado | Inventário inicial do estoque existente na área do piloto |

## Roadmap

O MVP fecha em quatro semanas antes do Gate 3 (entrega final em novembro):

1. **Semana 1**: cadastros, NF, DOF e recebimento.
2. **Semana 2**: lote, fardo, endereço e saldo com idade.
3. **Semana 3**: RME, FIFO, conferência e baixa.
4. **Semana 4**: IBAMA, dashboard, integração e piloto no pátio.

**Depois do programa**: modo offline, QR Code ou RFID, leitura automática do DOF, acompanhamento do dormente na via.

As semanas são relativas e devem ser ajustadas à data exata do Gate 3. A ordem segue o fluxo do dormente, para que cada semana termine com uma parte demonstrável, e o piloto no pátio gera os números dos indicadores para o relatório final.

## Premissas e perguntas em aberto

**Premissas adotadas**

- A CPTM não tem sistema para dormentes; todo o controle hoje é em papel, inclusive o que é usado para prestar contas ao IBAMA
- A marcação "antes/após julho de 2023" na RME existe para controlar há quanto tempo o lote está em estoque
- Existem cerca de 3 tamanhos de dormente
- Cada dormente chega com uma plaqueta metálica com fornecedor, ata de registro, espécie e classe, comprimento, tratamento e empresa, empresa inspetora e ano, e contrato. Esses dados se repetem em todo o fornecimento, então identificam o lote, não o dormente individual; o QR Code por dormente fica para a fase de automação

**A confirmar com a CPTM**

- [ ] Quais a largura, a altura e o comprimento de cada um dos 3 tamanhos?
- [ ] Qual o volume médio de entradas e saídas por mês?
- [ ] A ata de registro e o contrato da plaqueta também aparecem na NF ou no DOF?
- [ ] Qual o limite de dias em estoque que deve gerar alerta?
- [x] Categoria é mesmo a classificação de qualidade da inspeção?
- [ ] Como os pátios e ruas são organizados e nomeados hoje?
- [ ] Quem abre a RME hoje e quem aprova?
- [ ] Quantos níveis de categoria existem e o que define cada um?
- [x] Há sinal de celular ou Wi-Fi no pátio?
- [ ] Qual área do almoxarifado pode receber o piloto?

**A confirmar sobre o IBAMA**

- [ ] A CPTM é inscrita no CTF/APP e tem pátio cadastrado no Sinaflor? Quem declara o recebimento dos DOFs hoje?
- [ ] Que informações o IBAMA (ou o órgão estadual) já pediu e com que frequência?
- [ ] A CPTM entrega RAPP anual? Em qual atividade?
- [ ] Os dormentes retirados da via também precisam de controle de destinação?
