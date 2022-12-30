export const host = ['host', {
  alias: 'h',
  describe: 'KantanTX instance host URI',
  demandOption: true,
  type: 'string'
}] as const;

export const apiKey = ['apikey', {
  alias: 'a',
  describe: 'KantanTX User API Key',
  demandOption: true,
  type: 'string',
}] as const;
