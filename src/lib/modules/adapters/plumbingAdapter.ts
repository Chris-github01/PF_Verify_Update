import { BaseParserAdapter } from './adapterInterface';
import type { ParseInput, ParseResult, RuleVersion } from './adapterInterface';

export class PlumbingParserAdapter extends BaseParserAdapter {
  readonly moduleKey = 'plumbing_parser';

  async parse(_input: ParseInput): Promise<ParseResult> {
    return this.makeResult({
      success: true,
      line_items: [],
      warnings: ['PlumbingParserAdapter.parse() delegates to existing parsing pipeline — use start_parsing_job edge function'],
      metadata: { delegated: true },
      parser_version: '13.0.0',
    });
  }

  getRuleConfig(): Record<string, unknown> {
    return { source: 'src/lib/modules/parsers/plumbing/ruleConfig.ts', note: 'Import ruleConfig directly for live access' };
  }

  applyRuleVersion(version: RuleVersion): void {
    console.warn(`[plumbing_parser] Rule version ${version.version_id} received — simulation only, never applied to live parser`);
  }
}

export class PassiveFireParserAdapter extends BaseParserAdapter {
  readonly moduleKey = 'passive_fire_parser';

  async parse(_input: ParseInput): Promise<ParseResult> {
    return this.makeResult({
      success: true,
      line_items: [],
      warnings: ['PassiveFireParserAdapter: parser is protected and isolated from intelligence layer'],
      parser_version: '2.0.0',
    });
  }

  getRuleConfig(): Record<string, unknown> {
    return { protected: true, note: 'Passive fire parser rule config is read-only and isolated' };
  }

  applyRuleVersion(_version: RuleVersion): void {
    throw new Error('[passive_fire_parser] Rule versions CANNOT be applied to Passive Fire parser — it is protected');
  }
}

export class ElectricalParserAdapter extends BaseParserAdapter {
  readonly moduleKey = 'electrical_parser';

  async parse(_input: ParseInput): Promise<ParseResult> {
    return this.makeResult({
      success: false,
      warnings: ['Electrical parser not yet implemented'],
      parser_version: '0.1.0',
    });
  }

  getRuleConfig(): Record<string, unknown> {
    return { status: 'pending', note: 'Electrical parser rule config not yet defined' };
  }
}

export class HVACParserAdapter extends BaseParserAdapter {
  readonly moduleKey = 'hvac_parser';

  async parse(_input: ParseInput): Promise<ParseResult> {
    return this.makeResult({
      success: false,
      warnings: ['HVAC parser not yet implemented'],
      parser_version: '0.1.0',
    });
  }

  getRuleConfig(): Record<string, unknown> {
    return { status: 'pending', note: 'HVAC parser rule config not yet defined' };
  }
}

export class ActiveFireParserAdapter extends BaseParserAdapter {
  readonly moduleKey = 'active_fire_parser';

  async parse(_input: ParseInput): Promise<ParseResult> {
    return this.makeResult({
      success: true,
      warnings: ['ActiveFireParserAdapter: delegates to existing globalFireQuote parser'],
      parser_version: '0.1.0',
    });
  }

  getRuleConfig(): Record<string, unknown> {
    return { source: 'src/importer/parsers/globalFireQuote.ts' };
  }
}

const ADAPTERS: Record<string, BaseParserAdapter> = {
  plumbing_parser:     new PlumbingParserAdapter(),
  passive_fire_parser: new PassiveFireParserAdapter(),
  active_fire_parser:  new ActiveFireParserAdapter(),
  electrical_parser:   new ElectricalParserAdapter(),
  hvac_parser:         new HVACParserAdapter(),
};

export function getAdapter(moduleKey: string): BaseParserAdapter | undefined {
  return ADAPTERS[moduleKey];
}

export function getAvailableAdapters(): BaseParserAdapter[] {
  return Object.values(ADAPTERS);
}
