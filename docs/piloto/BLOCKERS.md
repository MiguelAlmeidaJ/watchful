# Dependências externas e impedimentos

| Dependência | Evidência e encaminhamento |
| --- | --- |
| ANA HidroWebService | A API atual exige autorização de acesso. O comunicado da ANA descreve o serviço legado como defasado e informa prazo de descontinuação. Verificar o contrato e a atualidade dos dados antes de considerar o legado operacional. O acesso autorizado pode ser validado em paralelo à integração de arquivos oficiais. [Manual da ANA](https://www.gov.br/ana/pt-br/assuntos/monitoramento-e-eventos-criticos/monitoramento-hidrologico/orientacoes-manuais/manuais-de-sistemas-e-servicos-de-disponibilizacao-de-dados-hidrologicos) · [Comunicado do legado](https://www.ana.gov.br/telemetria1ws/Dados.aspx) |
| CEMADEN | A página oficial oferece download com confirmação de segurança e horários UTC. Usar importação legítima ou acesso institucional autorizado para automação. [Mapa Interativo](https://www2.cemaden.gov.br/mapainterativo/) |
| INMET | Em 24/11/2026 o endpoint de catálogo fechou a conexão e a página oficial do catálogo retornou HTTP 503 no ambiente local. A verificação de estações candidatas e observações segue aberta. Existe importação administrativa do CSV oficial quando disponível. [Catálogo](https://portal.inmet.gov.br/paginas/catalogoaut) |
| Homologação | Limiar de risco regional, representatividade de estação, disponibilidade de abrigos e eventual rota de evacuação exigem comprovação e revisão de responsáveis técnicos. A plataforma deve preservar evidências e permitir revisão |
| Push e dispositivos | Credenciais de plataformas, aparelhos e infraestrutura de compilação precisam ser verificados. O bundle Android não comprova a execução nativa ou entrega de push |

O [inventário das fontes](SOURCES.md) registra a procedência e as evidências de cada integração.

Pendências de engenharia continuam no plano. Um item externo só é dado como resolvido após evidência de acesso e verificação.
