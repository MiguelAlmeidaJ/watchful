// Read-only diagnostic; no database writes and no credentials or tokens in output.
const base = 'https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/';
const user = process.env.ANA_HIDROWEB_USERNAME;
const password = process.env.ANA_HIDROWEB_PASSWORD;
async function request(path, headers, params = {}) {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, redirect: 'error', signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error('HTTP_' + response.status);
  return response.json();
}
async function main() {
  if (!user || !password) throw new Error('MISSING_CREDENTIALS');
  const auth = await request('OAUth/v1', { Identificador: user, Senha: password });
  const token = auth?.items?.tokenautenticacao;
  if (typeof token !== 'string' || !token) throw new Error('UNEXPECTED_AUTH_SCHEMA');
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  for (const code of ['58385100', '58440000', '58612000']) {
    try {
      const data = await request('HidroinfoanaSerieTelemetricaAdotada/v1', { Authorization: 'Bearer ' + token }, {
        'Código da Estação': code,
        'Tipo Filtro Data': 'DATA_LEITURA',
        'Data de Busca (yyyy-MM-dd)': date,
        'Range Intervalo de busca': 'DIAS_1'
      });
      const rows = Array.isArray(data?.items) ? data.items : [];
      console.log(JSON.stringify({ station: code, count: rows.length, fields: Object.keys(rows[0] ?? {}), sample: rows.slice(0, 2) }));
    } catch (error) {
      console.error(code, /^HTTP_\d+$/.test(error?.message) ? error.message : 'REQUEST_OR_SCHEMA_ERROR');
      process.exitCode = 1;
    }
  }
}
main().catch(error => {
  console.error(/^(HTTP_\d+|MISSING_CREDENTIALS|UNEXPECTED_AUTH_SCHEMA)$/.test(error?.message) ? error.message : 'HIDROWEB_DIAGNOSTIC_FAILED');
  process.exitCode = 1;
});
