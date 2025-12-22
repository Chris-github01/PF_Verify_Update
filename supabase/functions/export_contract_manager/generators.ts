/**
 * Contract Manager PDF Generators - MIGRATED TO UNIFIED PRINT ENGINE
 * This file now uses the unified contractPrintEngine for all PDF generation
 *
 * BACKUP: generators.ts.backup contains the original implementation
 * ROLLBACK: Run rollback-contract-manager.sh to restore original files
 */

import { generateContractPDF } from './contractPrintEngine.ts';

export function generateJuniorPackHTML(
  projectName: string,
  supplierName: string,
  scopeSystems: any[],
  inclusions: string[],
  exclusions: string[],
  organisationLogoUrl?: string,
  lineItems?: any[],
  supplierContact?: any
): string {
  const rawData = {
    project: {
      name: projectName
    },
    supplier: {
      name: supplierName,
      contactName: supplierContact?.contactName,
      contactEmail: supplierContact?.contactEmail,
      contactPhone: supplierContact?.contactPhone,
      address: supplierContact?.address
    },
    financial: {
      totalAmount: 0
    },
    systems: scopeSystems,
    inclusions,
    exclusions,
    allowances: [],
    lineItems: lineItems || [],
    organisationLogoUrl
  };

  const { html, validation } = generateContractPDF('site_team', rawData);

  if (!validation.valid) {
    console.warn('PDF validation warnings:', validation.warnings);
    console.error('PDF validation errors:', validation.errors);
  }

  return html;
}

export function generateSeniorReportHTML(
  projectName: string,
  supplierName: string,
  totalAmount: number,
  scopeSystems: any[],
  inclusions: string[],
  exclusions: string[],
  organisationLogoUrl?: string,
  additionalData?: any
): string {
  const rawData = {
    project: {
      name: projectName,
      client: additionalData?.client,
      mainContractor: additionalData?.mainContractor
    },
    supplier: {
      name: supplierName,
      contactName: additionalData?.supplier?.contactName,
      contactEmail: additionalData?.supplier?.contactEmail,
      contactPhone: additionalData?.supplier?.contactPhone,
      address: additionalData?.supplier?.address
    },
    financial: {
      totalAmount,
      retentionPercentage: additionalData?.retentionPercentage || 3,
      paymentTerms: additionalData?.paymentTerms,
      liquidatedDamages: additionalData?.liquidatedDamages
    },
    projectManager: additionalData?.projectManager,
    systems: scopeSystems,
    inclusions,
    exclusions,
    allowances: [],
    organisationLogoUrl,
    awardReport: additionalData?.awardReport
  };

  const { html, validation } = generateContractPDF('senior_mgmt', rawData);

  if (!validation.valid) {
    console.warn('PDF validation warnings:', validation.warnings);
    console.error('PDF validation errors:', validation.errors);
  }

  return html;
}

export function generatePreletAppendixHTML(
  projectName: string,
  supplierName: string,
  totalAmount: number,
  appendixData: any,
  organisationLogoUrl?: string
): string {
  const rawData = {
    project: {
      name: projectName
    },
    supplier: {
      name: supplierName
    },
    financial: {
      totalAmount
    },
    systems: [],
    inclusions: appendixData?.inclusions || [],
    exclusions: appendixData?.exclusions || [],
    allowances: [],
    organisationLogoUrl,
    appendixData
  };

  const { html, validation } = generateContractPDF('prelet_appendix', rawData);

  if (!validation.valid) {
    console.warn('PDF validation warnings:', validation.warnings);
    console.error('PDF validation errors:', validation.errors);
  }

  return html;
}
