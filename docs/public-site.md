# Rotas web
- /: página institucional pública, sem autenticação e sem requisições a APIs internas.
- /admin: aplicação existente, com login e autorização mantidos na API.
A página pública apresenta o propósito, fontes e capacidades do piloto. Não expõe medições, setores, alertas, informações de organizações ou dados de usuários. O gráfico territorial é uma ilustração conceitual explicitamente rotulada, não um mapa real. Uma futura visão pública de dados exige API pública específica, critérios de publicação, cobertura e atualização. A rota administrativa tem metadados noindex, que não substituem autenticação. Não foram adicionadas dependências ou migrações.
