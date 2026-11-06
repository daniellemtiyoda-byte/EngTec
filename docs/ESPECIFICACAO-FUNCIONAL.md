# Especificação Funcional · Sistema de Rastreabilidade de Dormentes (CPTM)

Versão de 05/11/2026 · Dani, revisada com as decisões de 05/11/2026 (saldo, faltas, não localizados, reposição, QR dos locais, fornecedor da ata, inspeção e login) e de 06/11/2026 (NF e DOF antes da chegada, entrega a caminho). Documento de origem: https://claude.ai/artifact/4rUyTJs9equ4ZYVKtETNVi

## 1. Visão geral e escopo

O sistema dá a cada dormente um QR code individual e acompanha sua vida do contrato até a saída para a via. Assim, qualquer funcionário consulta os dados de um dormente na hora, e a CPTM passa a controlar o estoque do armazém com dados confiáveis.

**Problema.** Hoje o controle dos dormentes é feito em papel. A plaquinha que o fornecedor fixa em cada dormente identifica o contrato, a espécie e o tratamento, mas não diferencia um dormente do outro. Não há registro de onde cada fardo está no armazém, o tempo em estoque não é acompanhado, e a prestação de contas ao IBAMA (DOF e Sinaflor) depende de controles manuais.

**Objetivo.** Garantir a rastreabilidade individual de cada dormente, mostrar o estoque por espécie, tamanho, situação e local, e alertar sobre falta ou excesso de material, dormentes parados há muito tempo e DOFs perto do prazo.

**Perfis de usuário**

| Perfil | O que faz no sistema |
| --- | --- |
| Administrador | Mantém os cadastros, os usuários e os contratos |
| Almoxarife | Registra recebimentos, guarda e movimenta fardos, separa e entrega as saídas |
| Gestor | Acompanha o painel, os indicadores e os alertas |
| Requisitante (manutenção ou via permanente) | Pede dormentes para uma obra ou trecho e acompanha a saída |
| Qualquer usuário logado | Lê um QR code e consulta a ficha do dormente |
| Fornecedor (simulado) | Usa apenas o Simulador do fornecedor, na demonstração |

**Escopo do protótipo**

| Entra no protótipo | Fica fora (melhoria futura) |
| --- | --- |
| Cadastros de espécies, tamanhos, tratamentos, fornecedores, locais e usuários | Back-end próprio (os dados ficam no Supabase) e integração real com o sistema de inspeção |
| Contratos | Declaração automática da DOF no Sinaflor |
| Simulador do fornecedor (geração de QR para demonstração) | Etiqueta de contingência para dormente sem QR |
| Reprovados segregados | Devolução dos reprovados ao fornecedor |
| Recebimento com NF e DOF | Aprovações em duas etapas e ajustes de inventário |
| Inspeção (retorno simulado) | Uso offline e RFID |
| Estoque com localização e movimentações | |
| Ficha do dormente pelo QR code | |
| Saída para obra ou trecho | |
| Painel com indicadores e alertas | |
| Login e banco no Supabase (até lá, login simulado com escolha de perfil e dados de demonstração) | |

Em aberto: até onde vai a localização no armazém, só a área ou também a posição do fardo dentro dela; e o nome popular das espécies (ex. "Jataipeba" para *Dialium guianense*), a confirmar com a CPTM.

## 2. Glossário e regra de identificação

Todo dormente terá um ID único, formado pelo número do contrato mais uma sequência, gravado em QR code na plaquinha que o fornecedor já fixa hoje.

**Glossário**

| Termo | Definição |
| --- | --- |
| Ata de Registro de Preços | Documento da licitação que registra fornecedor, itens e preços (ex. AR00224) |
| Contrato | Compra firmada a partir de uma ata, com fornecedor, espécies, tamanhos e quantidades (ex. AR00224-01) |
| Fornecedor | Empresa contratada que entrega os dormentes com a plaquinha fixada |
| Espécie (essência) | Madeira do dormente, com nome científico (ex. Dialium guianense) |
| Classe | Classificação da espécie no cadastro (ex. 1ª) |
| Tamanho | Comprimento, largura e altura do dormente; o volume em m³ é calculado pelo sistema |
| Tratamento | Preservativo aplicado e empresa que fez o tratamento (ex. CCA / Granoski) |
| Empresa inspetora | Empresa contratada pelo fornecedor para inspecionar o lote antes da entrega (ex. UFV) |
| NF | Nota fiscal da entrega |
| DOF | Documento de Origem Florestal que acompanha a madeira e é declarado no Sinaflor |
| Fardo | Conjunto de dormentes amarrados que chega montado pelo fornecedor |
| Dormente | Peça individual, rastreada pelo seu ID |
| ID do dormente | Código único do dormente, gravado no QR code e escrito na plaquinha |
| Inspeção de recebimento | Inspeção automatizada da CPTM, dormente a dormente, que mede e classifica cada peça |
| Categoria | Resultado de qualidade dado pela inspeção de recebimento: 1, 2 ou 3 (provisório, a confirmar com o time da inspeção) |
| Entrega | O que o fornecedor envia de uma vez: uma NF, uma DOF e os seus fardos. É cadastrada na tela NF e DOF antes da chegada e fica "a caminho" até ser recebida |
| Local | Endereço do armazém onde o fardo está guardado, identificado por um QR próprio |
| Saída | Retirada de dormentes do estoque para uma obra ou trecho |

**Regra de identificação**

| Item | Regra |
| --- | --- |
| Formato do ID do dormente | Número do contrato + sequência de 6 dígitos (ex. AR00224-01-000357) |
| Formato do ID do fardo | Número do contrato + F + sequência (ex. AR00224-01-F012) |
| Formato do ID do local | LOC + código do local (ex. LOC-A03), em etiqueta afixada no local |
| Conteúdo do QR | Link do sistema com o ID; a câmera comum do celular abre a ficha depois do login |
| Plaquinha | O QR é gravado na plaquinha atual, com o ID escrito logo abaixo para leitura manual |
| Quem gera | O fornecedor, seguindo o padrão definido em anexo técnico do contrato |
| No protótipo | Os QR codes são gerados pelo Simulador do fornecedor, só para demonstração |
| Unicidade | Como cada contrato é único, nenhum ID se repete; um ID nunca é reaproveitado |
| Dormente sem QR legível | Fica pendente na inspeção; a etiqueta de contingência é melhoria futura |

Plaquinha: a atual mede cerca de 5 x 7 cm. A proposta é gravar o QR na plaquinha menor do contrato (que já fica logo abaixo), trocando o texto "Contrato" pelo QR com o ID escrito ao lado. O tamanho pode ser ajustado conforme a necessidade do projeto; o essencial é dar acesso às informações do dormente em tempo real.

## 3. Jornada do dormente

O dormente nasce no contrato, chega identificado pelo fornecedor e é lido pelo QR no recebimento, na inspeção, na guarda e na saída, sem nenhuma digitação de código. A NF e a DOF são cadastradas antes da chegada, o que cria a entrega "a caminho" que o almoxarife escolhe ao receber.

```
Contrato → Fornecedor grava o QR → NF e DOF cadastradas (entrega a caminho) → Recebimento (leitura dos fardos) → Inspeção peça a peça → Aprovado?
   sim → Estoque (fardo no seu local) → Saída (baixa por ID)
   não → Segregado (a devolução ao fornecedor fica fora do protótipo)
```

Os fardos chegam montados. Na inspeção, o fardo é aberto, cada dormente passa pela câmera e o fardo é fechado de novo só com os aprovados; os reprovados saem do fardo e ficam segregados. Se um dormente do fardo não for lido (falta ou QR ilegível), a inspeção pode ser concluída com justificativa e ele fica "não localizado".

**Situações do dormente**

| Situação | Quando acontece |
| --- | --- |
| Emitido | O ID foi gerado para o contrato, mas o dormente ainda não chegou |
| Aguardando inspeção | O fardo dele foi lido no recebimento |
| Em estoque | Foi aprovado na inspeção e está num fardo guardado |
| Reservado | Foi separado para uma saída ainda não entregue |
| Baixado | Saiu para a obra ou trecho |
| Reprovado | Foi rejeitado na inspeção e está segregado (a devolução ao fornecedor fica fora do protótipo) |
| Não localizado | Não foi lido quando a inspeção do seu fardo foi concluída (falta ou QR ilegível); aparece como pendência para o gestor e pode ser inspecionado depois, se for encontrado |

**Saldo.** O saldo físico do fardo é o número de dormentes em estoque mais os reservados, que ainda estão fisicamente nele. Disponível para nova saída é só o que está em estoque.

**Situações do fardo**

| Situação | Quando acontece |
| --- | --- |
| Em trânsito | O fornecedor gerou o fardo, mas ele ainda não chegou, ou não foi lido no recebimento da sua entrega (falta) e pode ser recebido depois |
| Aguardando inspeção | Foi recebido e espera a inspeção |
| Em inspeção | A inspeção dos seus dormentes começou e ainda não foi concluída |
| Em estoque | Foi inspecionado, fechado e guardado num local |
| Aberto | Teve parte dos dormentes retirada numa saída |
| Baixado | Ficou sem dormentes |

## 4. Modelo de dados

O banco tem dois níveis de detalhe, o fardo e o dormente, e todo dormente aponta para o fardo, o contrato, o recebimento e a inspeção de onde veio. Nenhuma informação é digitada duas vezes: o que vem do contrato não é repetido no recebimento, e o que vem da inspeção não é repetido no estoque.

| Entidade | Campos principais | Liga com |
| --- | --- | --- |
| Fornecedor | Razão social, CNPJ, cidade/UF, situação, CTF IBAMA e validade (bloqueio calculado), certificados | Espécies que fornece, atas |
| Espécie | Nome científico, nome popular, classe | Tamanhos, itens do contrato |
| Tamanho | Código, comprimento, largura, altura, volume calculado | Itens do contrato |
| Tratamento | Preservativo, empresa de tratamento | Itens do contrato |
| Empresa inspetora | Nome, CNPJ (opcional), ativa ou inativa | Contratos |
| Local | Código, descrição, tipo, capacidade em dormentes, QR | Fardos guardados |
| Usuário | Nome, e-mail, perfil, ativo | Todo registro guarda quem fez |
| Ata | Número, fornecedor, vigência | Contratos |
| Contrato | Número, ata, empresa inspetora (do cadastro), situação (o fornecedor vem da ata) | Itens, entregas, fardos, dormentes, NFs |
| Item do contrato | Espécie, tamanho, tratamento, quantidade em unidades | Contrato, dormentes |
| Entrega | NF, DOF, fardos esperados, situação (a caminho, recebida em parte, recebida) | Contrato, NF, DOF, fardos, recebimento |
| Fardo | ID, contrato, quantidade inicial, saldo físico e disponível (calculados), local, situação | Dormentes, recebimento, movimentações |
| Dormente | ID, item do contrato, fardo, situação, categoria, medidas | Fardo, inspeção, saída |
| NF | Número, chave, fornecedor, data, XML | Contrato, entrega, DOF |
| DOF | Número, validade, volume por espécie, PDF, declarado no Sinaflor | NF |
| Recebimento | Data, responsável, conformidade, fotos | Entrega, fardos recebidos |
| Inspeção | Dormente, resultado (aprovado ou reprovado), categoria, medidas, inspetor, data | Dormente, fardo |
| Movimentação | Tipo (guarda, transferência, saída), fardo, de, para, quem, quando | Fardo, local, saída |
| Saída | Número, destino (obra ou trecho), solicitante, situação | Itens, dormentes baixados |

Mudança em relação ao sistema atual: sai o conceito de lote (NF + espécie + tamanho, com código LT26-0042). O agrupamento passa a ser o contrato e o fardo, e o ID do dormente vem da plaquinha, não de uma etiqueta impressa na inspeção.

## 5. Módulos e regras de negócio

São dez módulos, um para cada etapa da jornada mais os de apoio. O detalhe das telas e da interface fica no plano de desenvolvimento (`docs/PLANO-V2.md`).

| Módulo | O que faz | Regras principais |
| --- | --- | --- |
| Cadastros | Espécies, tamanhos, tratamentos, fornecedores, empresas inspetoras, locais | Nada é apagado, só inativado, e o inativado pode ser reativado respeitando as regras de cada cadastro (o fornecedor com CTF vencido continua bloqueado); o contrato escolhe a empresa inspetora no cadastro (só as ativas); volume do tamanho sempre calculado; fornecedor com CTF vencido fica bloqueado automaticamente para novas atas e contratos, calculado pela validade; cada local tem um QR (LOC-código) |
| Contratos | Ata, contrato e itens | O contrato herda o fornecedor da ata (não é digitado de novo); itens em unidades; se informado em m³, o sistema converte pelo volume do tamanho e arredonda para baixo; mostra quanto já foi entregue de cada item |
| Simulador do fornecedor | Gera fardos e IDs de dormentes e imprime etiquetas | Só para demonstração, com aviso fixo na tela; o contrato é cumprido por aprovados, então pode emitir reposição dos reprovados, desde que emitidos menos reprovados não passe da quantidade do item; ID nunca repetido |
| NF e DOF | Cadastro da NF (XML ou digitada) e da DOF antes da chegada, prazo e declaração no Sinaflor | Cadastram o administrador (no escritório, antes da chegada) e o almoxarife; só o almoxarife declara a DOF; cadastrar NF e DOF cria a entrega "a caminho"; sem DOF não há entrega; chave de NF repetida é recusada; os fardos da entrega podem ser indicados no cadastro ou só na leitura do recebimento (provisório); no protótipo, o Simulador gera a entrega já com NF e DOF |
| Recebimento | Escolha da entrega, leitura dos fardos e conferência | O almoxarife escolhe uma entrega "a caminho"; cadastrar NF e DOF na hora é exceção; sem DOF não há recebimento; diferença de quantidade ou avaria exige foto; divergência de volume por espécie acima de 10% gera alerta (IN IBAMA) e pede justificativa; quando a divergência vem só dos fardos que faltaram, a justificativa é preenchida pelo sistema com a lista deles (a pessoa pode complementar) e, quando eles chegam, a divergência da DOF é recalculada; fardo esperado e não lido continua em trânsito, o recebimento é concluído com ocorrência de falta e o fardo pode ser recebido depois |
| Inspeção | Recebe o resultado de cada dormente | Vem do sistema de inspeção pelo banco compartilhado; no protótipo, simulada por botão; resultado só aprovado ou reprovado (o ATENÇÃO do sistema de inspeção conta como reprovado) e categoria 1, 2 ou 3 pelos limites 80 e 50 do índice, ambos provisórios, a confirmar com o time da inspeção; reprovados saem do fardo; ID que não pertence ao fardo vira pendência; o fardo pode ser concluído com dormentes não lidos, com justificativa obrigatória, e eles ficam não localizados |
| Estoque | Saldo, fardos, locais e movimentações | Saldo físico do fardo = dormentes em estoque + reservados; disponível para nova saída = só em estoque; guardar e transferir é lendo o QR do fardo e o QR do local (ou escolhendo o local) |
| Ficha do dormente | Tela aberta pelo QR | Mostra contrato, fornecedor, NF, DOF, inspeção, local e histórico; só leitura |
| Saída | Requisição, separação e entrega | Sugere fardos abertos primeiro e depois os mais antigos, só com dormentes disponíveis; separação lendo os QR reserva os dormentes; a baixa só acontece na entrega |
| Painel | Indicadores e alertas | Falta e excesso por espécie e tamanho, tempo em estoque, DOFs perto do prazo, dormentes não localizados, pendências de cada perfil |

DOF: o prazo de declaração no Sinaflor é o dia seguinte ao fim da validade. O sistema alerta com 3 dias e com 1 dia de antecedência, e a declaração é marcada à mão, com registro de quem e quando.

## 6. Perfis e permissões

Cada perfil vê no menu só o que pode usar, e a leitura da ficha do dormente pelo QR é liberada para todos os usuários logados. O login é feito pelo Supabase Auth (e-mail e senha), com a sessão guardada no aparelho para o QR abrir a ficha sem novo login; até o banco ser criado, o protótipo usa um login simulado em que o nome do usuário escolhe o perfil. As contas são criadas no painel do Supabase; no sistema, o administrador só altera o perfil e a situação de cada usuário.

| Módulo | Administrador | Almoxarife | Gestor | Requisitante |
| --- | --- | --- | --- | --- |
| Cadastros | Edita | Consulta | Consulta | Não vê |
| Contratos | Edita | Consulta | Consulta | Não vê |
| Simulador do fornecedor | Usa | Usa | Não vê | Não vê |
| NF e DOF | Cadastra | Cadastra e declara | Consulta | Não vê |
| Recebimento | Consulta | Registra | Consulta | Não vê |
| Inspeção | Consulta | Acompanha e simula | Consulta | Não vê |
| Estoque | Consulta | Guarda e transfere | Consulta | Consulta saldo |
| Ficha do dormente | Lê | Lê | Lê | Lê |
| Saída | Consulta | Separa e entrega | Consulta | Abre e acompanha |
| Painel | Completo | Pendências do dia | Completo, com os não localizados | Suas saídas |
| Usuários | Edita perfil e situação | Não vê | Não vê | Não vê |

## 7. Indicadores e melhorias futuras

Os indicadores respondem aos que a CPTM pediu no plano de trabalho (tempo de localização, perdas e movimentações) e aos pontos de controle de estoque que o grupo levantou.

| Indicador | Como o sistema calcula |
| --- | --- |
| Estoque por espécie e tamanho | Dormentes em estoque, comparados a um mínimo e um máximo por item |
| Falta ou excesso | Itens abaixo do mínimo ou acima do máximo |
| Tempo em estoque | Dias desde o recebimento do fardo; alerta acima de um limite (a definir com a CPTM) |
| Entregas dos contratos | Quantidade recebida contra a contratada, por item |
| Taxa de reprovação | Reprovados sobre inspecionados, por fornecedor e espécie |
| Reprovação por empresa inspetora | Reprovados sobre inspecionados na inspeção da CPTM, agrupados pela empresa inspetora do contrato |
| Não localizados | Dormentes não lidos na conclusão da inspeção, ainda não encontrados |
| DOFs a declarar | DOFs com prazo vencido, em até 1 dia e em até 3 dias |
| Rastreabilidade | Dormentes baixados com histórico completo do contrato à saída |

**Melhorias futuras**

- Etiqueta de contingência para dormente que chega sem QR ou com QR ilegível
- Devolução dos reprovados ao fornecedor
- Portal real do fornecedor, no lugar do simulador
- Integração real com o sistema de inspeção (e confirmação do mapeamento do ATENÇÃO e das categorias) e com o Sinaflor
- Inventário físico por leitura de QR e ajustes com aprovação
- Uso offline no pátio e leitura por RFID

Em aberto: até onde vai a localização (área ou posição do fardo), valores de mínimo e máximo por item, limite de dias em estoque e o nome popular das espécies ("Jataipeba" para *Dialium guianense*).
