import { Shield, CheckCircle, Clock, XCircle, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getBlockchainRecord, getBlockchainExplorerUrl, type BlockchainRecord } from '../lib/blockchain/icpClient';

interface BlockchainBadgeProps {
  entityType: BlockchainRecord['entityType'];
  entityId: string;
  size?: 'sm' | 'md' | 'lg';
  showDetails?: boolean;
}

export function BlockchainBadge({ entityType, entityId, size = 'md', showDetails = true }: BlockchainBadgeProps) {
  const [record, setRecord] = useState<BlockchainRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadRecord();
  }, [entityType, entityId]);

  async function loadRecord() {
    try {
      const data = await getBlockchainRecord(entityType, entityId);
      setRecord(data);
    } catch (error) {
      console.error('Failed to load blockchain record:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 ${getSizeClasses(size)}`}>
        <Clock className={getIconSize(size)} />
        <span>Verifying...</span>
      </div>
    );
  }

  if (!record) {
    return null;
  }

  const { icon: Icon, color, bgColor, label } = getStatusConfig(record.blockchainStatus);

  return (
    <>
      <button
        onClick={() => showDetails && setShowModal(true)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${bgColor} ${color} ${getSizeClasses(size)} ${
          showDetails ? 'hover:opacity-80 cursor-pointer' : ''
        } transition-opacity`}
      >
        <Icon className={getIconSize(size)} />
        <span className="font-medium">{label}</span>
        {record.blockchainStatus === 'confirmed' && <Shield className={getIconSize(size)} />}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-full ${bgColor}`}>
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Blockchain Verification</h3>
                  <p className="text-sm text-gray-500">Immutable audit trail</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Status</span>
                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${bgColor} ${color} text-sm font-medium`}>
                    <Icon className="w-4 h-4" />
                    {label}
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="mb-3">
                  <span className="text-sm font-medium text-gray-700 block mb-1">Content Hash</span>
                  <code className="text-xs font-mono bg-white px-3 py-2 rounded border border-gray-200 block break-all">
                    {record.contentHash}
                  </code>
                </div>

                {record.blockchainTxId && (
                  <div className="mb-3">
                    <span className="text-sm font-medium text-gray-700 block mb-1">Transaction ID</span>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono bg-white px-3 py-2 rounded border border-gray-200 block break-all flex-1">
                        {record.blockchainTxId}
                      </code>
                      <a
                        href={getBlockchainExplorerUrl(record.blockchainTxId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 flex-shrink-0"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-sm font-medium text-gray-700 block mb-1">Recorded</span>
                    <span className="text-sm text-gray-900">
                      {new Date(record.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {record.confirmedAt && (
                    <div>
                      <span className="text-sm font-medium text-gray-700 block mb-1">Confirmed</span>
                      <span className="text-sm text-gray-900">
                        {new Date(record.confirmedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {record.blockchainStatus === 'confirmed' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-900">Verified on Blockchain</p>
                      <p className="text-xs text-green-700 mt-1">
                        This record has been permanently recorded on the Internet Computer blockchain and cannot be altered or deleted.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {record.blockchainStatus === 'pending' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-900">Pending Confirmation</p>
                      <p className="text-xs text-yellow-700 mt-1">
                        This record is awaiting blockchain confirmation. This typically takes a few minutes.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {record.blockchainStatus === 'failed' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-900">Verification Failed</p>
                      <p className="text-xs text-red-700 mt-1">
                        Blockchain submission failed. The record is still saved in the database but not on the blockchain.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getStatusConfig(status: BlockchainRecord['blockchainStatus']) {
  switch (status) {
    case 'confirmed':
      return {
        icon: CheckCircle,
        color: 'text-green-700',
        bgColor: 'bg-green-100',
        label: 'Verified on Blockchain'
      };
    case 'pending':
      return {
        icon: Clock,
        color: 'text-yellow-700',
        bgColor: 'bg-yellow-100',
        label: 'Pending Verification'
      };
    case 'failed':
      return {
        icon: XCircle,
        color: 'text-red-700',
        bgColor: 'bg-red-100',
        label: 'Verification Failed'
      };
  }
}

function getSizeClasses(size: 'sm' | 'md' | 'lg') {
  switch (size) {
    case 'sm':
      return 'text-xs';
    case 'md':
      return 'text-sm';
    case 'lg':
      return 'text-base';
  }
}

function getIconSize(size: 'sm' | 'md' | 'lg') {
  switch (size) {
    case 'sm':
      return 'w-3 h-3';
    case 'md':
      return 'w-4 h-4';
    case 'lg':
      return 'w-5 h-5';
  }
}
