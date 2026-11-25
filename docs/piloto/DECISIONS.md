# Decisões técnicas

- Preservar NestJS modular, PostgreSQL/PostGIS, Redis/BullMQ e as interfaces atuais. Mudanças são incrementais e verificadas pelos pontos de entrada usuais.
- Usar uma definição de precipitação horária confiável no banco, consumida pela API e pelo worker. Preservar medições anteriores e interpretar a qualidade legada de forma conservadora. Diferenciar o estado da precipitação do estado agregado das demais variáveis.
- Preservar as migrações aplicadas. A evolução do esquema ocorre em nova migração.
- Tratar coletas e publicações operacionais como opções explícitas de cada ambiente. Testes de alertas e entrega usam ambiente isolado e destinatários sintéticos.
- Identificar observações, previsões e informações oficiais pela proveniência. Critérios experimentais e limiares fictícios pertencem às simulações, nunca ao piloto operacional.
- Manter levantamentos antigos em `historical_risk_sectors`. Os metadados originais de tipologia, grau e data permanecem consultáveis. O grau combinado do SGB é exibido como publicado e a camada não participa das regras de risco ou da criação de alertas.
