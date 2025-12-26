import { generateFastPreletAppendix } from './preletAppendixGenerator.ts';

export function generateJuniorPackHTML(): string {
  throw new Error('Junior pack not implemented in this version');
}

export function generateSeniorReportHTML(): string {
  throw new Error('Senior report not implemented in this version');
}

export function generatePreletAppendixHTML(
  projectName: string,
  supplierName: string,
  totalAmount: number,
  appendixData: any,
  organisationLogoUrl?: string
): string {
  console.log('[PRELET] Using FAST generator (optimized for speed)');
  return generateFastPreletAppendix(
    projectName,
    supplierName,
    appendixData,
    organisationLogoUrl
  );
}