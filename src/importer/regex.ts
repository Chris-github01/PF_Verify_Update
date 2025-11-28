export const RX_INDEX = /^\s*(\d{1,3})\s+/;
export const RX_REF   = /\b(V\d+(?:\.\d+)?|FAS\d+|FC\d+)\b/;   // V33.4, FAS190143, FCxxxx
export const RX_QTYU  = /\s(\d+(?:\.\d+)?)\s+(No\.|Nr|ea|lm|m2|m)\b/i;
export const RX_MONEY = /\$?\s*([\d,]+\.\d{2})/g;              // captures numbers with 2 decimals
export const RX_TOTALS_BLOCK =
  /(Sub-?Total|Subtotal)\s*\$?\s*([\d,]+\.\d{2}).*?(P&?G.*?\$?\s*([\d,]+\.\d{2}))?.*?(PS3.*?QA.*?\$?\s*([\d,]+\.\d{2}))?.*?(Grand\s*Total.*?\$?\s*([\d,]+\.\d{2}))/is;
