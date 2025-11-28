import { supabase } from '../supabase';
import { generateSHA256Hash } from './hashGenerator';

export interface BlockchainRecord {
  id: string;
  entityType: 'quote_upload' | 'quote_finalized' | 'report_generated' | 'award_decision' | 'contract_signed';
  entityId: string;
  contentHash: string;
  blockchainTxId?: string;
  blockchainStatus: 'pending' | 'confirmed' | 'failed';
  metadata: Record<string, any>;
  createdAt: string;
  confirmedAt?: string;
}

export async function recordOnBlockchain(
  entityType: BlockchainRecord['entityType'],
  entityId: string,
  content: object,
  metadata: Record<string, any>
): Promise<BlockchainRecord> {
  const contentHash = await generateSHA256Hash(content);

  const { data: record, error } = await supabase
    .from('blockchain_records')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      content_hash: contentHash,
      blockchain_status: 'pending',
      metadata
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create blockchain record: ${error.message}`);
  }

  submitToICP(record.id, contentHash, metadata).catch(err => {
    console.error('Failed to submit to ICP:', err);
  });

  return {
    id: record.id,
    entityType: record.entity_type,
    entityId: record.entity_id,
    contentHash: record.content_hash,
    blockchainTxId: record.blockchain_tx_id,
    blockchainStatus: record.blockchain_status,
    metadata: record.metadata,
    createdAt: record.created_at,
    confirmedAt: record.confirmed_at
  };
}

async function submitToICP(
  recordId: string,
  contentHash: string,
  metadata: Record<string, any>
): Promise<void> {
  try {
    const { data: configData } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'ICP_CANISTER_ID')
      .single();

    const canisterId = configData?.value;

    if (!canisterId) {
      console.warn('ICP canister not configured, skipping blockchain submission');
      return;
    }

    const payload = {
      record_id: recordId,
      content_hash: contentHash,
      timestamp: new Date().toISOString(),
      metadata: {
        organisation_id: metadata.organisation_id,
        user_id: metadata.user_id,
        entity_type: metadata.entity_type
      }
    };

    const response = await fetch(`https://${canisterId}.ic0.app/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`ICP submission failed: ${response.status}`);
    }

    const result = await response.json();

    await supabase
      .from('blockchain_records')
      .update({
        blockchain_tx_id: result.transaction_id,
        blockchain_status: 'confirmed',
        confirmed_at: new Date().toISOString()
      })
      .eq('id', recordId);

    console.log(`Blockchain record confirmed: ${result.transaction_id}`);
  } catch (error) {
    console.error('ICP submission error:', error);

    await supabase
      .from('blockchain_records')
      .update({
        blockchain_status: 'failed'
      })
      .eq('id', recordId);
  }
}

export async function getBlockchainRecord(
  entityType: BlockchainRecord['entityType'],
  entityId: string
): Promise<BlockchainRecord | null> {
  const { data, error } = await supabase
    .from('blockchain_records')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    entityType: data.entity_type,
    entityId: data.entity_id,
    contentHash: data.content_hash,
    blockchainTxId: data.blockchain_tx_id,
    blockchainStatus: data.blockchain_status,
    metadata: data.metadata,
    createdAt: data.created_at,
    confirmedAt: data.confirmed_at
  };
}

export async function verifyBlockchainRecord(
  recordId: string,
  currentContent: object
): Promise<{ valid: boolean; reason?: string }> {
  const { data: record } = await supabase
    .from('blockchain_records')
    .select('*')
    .eq('id', recordId)
    .single();

  if (!record) {
    return { valid: false, reason: 'Record not found' };
  }

  const currentHash = await generateSHA256Hash(currentContent);

  if (currentHash !== record.content_hash) {
    return { valid: false, reason: 'Content has been modified' };
  }

  if (record.blockchain_status !== 'confirmed') {
    return { valid: false, reason: 'Not confirmed on blockchain' };
  }

  return { valid: true };
}

export async function getAllBlockchainRecords(
  organisationId: string,
  options?: {
    entityType?: BlockchainRecord['entityType'];
    limit?: number;
    offset?: number;
  }
): Promise<BlockchainRecord[]> {
  let query = supabase
    .from('blockchain_records')
    .select('*')
    .eq('metadata->>organisation_id', organisationId)
    .order('created_at', { ascending: false });

  if (options?.entityType) {
    query = query.eq('entity_type', options.entityType);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map(record => ({
    id: record.id,
    entityType: record.entity_type,
    entityId: record.entity_id,
    contentHash: record.content_hash,
    blockchainTxId: record.blockchain_tx_id,
    blockchainStatus: record.blockchain_status,
    metadata: record.metadata,
    createdAt: record.created_at,
    confirmedAt: record.confirmed_at
  }));
}

export function getBlockchainExplorerUrl(txId: string): string {
  return `https://dashboard.internetcomputer.org/transaction/${txId}`;
}
