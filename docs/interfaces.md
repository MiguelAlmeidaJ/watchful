# Fase 06 — Interfaces web e mobile
Código publicado, sem instalação ou execução.
## Web
Next.js, Tailwind, Lucide, MapLibre. Painel responsivo com login, organização/município, dashboard, estações, observações, acumulados, histórico tabular, previsões, sete camadas de mapa com consulta por viewport, áreas, alertas e revisão, regras, avaliações, ocorrências, abrigos, organizações, usuários, auditoria e notificações. Formulários iniciais para operações selecionadas; importação GeoJSON, edição completa de catálogos, gráficos avançados e gestão de ciclo de vida ainda exigem API ou desenvolvimento adicional. Alertas exibidos por organização (não filtrados por município). Contagens/listas limitadas pela API.
## Mobile
Expo/React Native, safe areas, Lucide, MapLibre React Native. Login, região autorizada, observações, mapa, alertas internos, notificações in-app, inscrição municipal e perfil. Contatos essenciais embutidos durante sessão; acesso offline antes de login, cache offline persistente, push externo e cadastro público ainda pendentes. MapLibre exige development build nativo; Expo Go não basta. Versão de SDK/plugin e tipos devem ser validados em fase 07. Sem localização contínua.
## Cliente compartilhado
packages/api-client: HTTP com timeout, tratamento de erros e refresh single-flight, tokens exclusivamente em memória. Recarregar a página ou reiniciar aplicativo exige login. Logout tenta revogar refresh; falha de rede não garante revogação. Sem localStorage ou persistência de senha. Em produção exigir HTTPS, rate limit e revisar ciclo de sessão. Cliente não substitui autorização no servidor.
## Configuração
Copiar .env para apps/web/.env.local e apps/mobile/.env (somente variáveis públicas apropriadas, nunca segredos). NEXT_PUBLIC_API_URL e EXPO_PUBLIC_API_URL devem apontar para API /api/v1; dispositivo físico usa IP LAN e rede autorizada. NEXT_PUBLIC_MAP_STYLE_URL e EXPO_PUBLIC_MAP_STYLE_URL opcionais; usar apenas provedor licenciado com atribuição. Sem configuração, mapa exibe geometrias sobre fundo neutro.
Endpoints auxiliares GET organizations/:id/municipalities e GET geo/municipalities/:id/extent. Não há migração nova.
## Pendências
Push Expo/FCM/APNs e recibos, NativeWind, offline real, gráficos, formulários restantes, paginação, acessibilidade, proteção de sessão, responsividade, testes de contratos e builds nativos. Publicação interna segue desligada por padrão; nenhum alerta público. Não é sistema de emergência homologado.
