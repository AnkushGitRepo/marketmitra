// Brand and former names people type instead of the NSE symbol. Hand-maintained and
// small on purpose: anything not listed goes through the live symbol search.

const ALIASES: Readonly<Record<string, string>> = {
  AIRTEL: 'BHARTIARTL',
  BHARTI: 'BHARTIARTL',
  VI: 'IDEA',
  VODAFONE: 'IDEA',
  JIO: 'JPL',
  HDFC: 'HDFCBANK',
  SBI: 'SBIN',
  LNT: 'LT',
  HUL: 'HINDUNILVR',
  INFOSYS: 'INFY',
  ZOMATO: 'ETERNAL',
};

/** The NSE symbol for what the user typed: a known alias, else the input upper-cased. */
export function resolveSymbolAlias(input: string): string {
  const key = input.trim().toUpperCase();
  return ALIASES[key] ?? key;
}
