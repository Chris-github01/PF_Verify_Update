import { Clock, FileText, RefreshCw, AlertCircle, TrendingUp } from 'lucide-react';
import type { RevisionTimelineEvent } from '../types/revision.types';

interface RevisionTimelineProps {
  events: RevisionTimelineEvent[];
  supplierName: string;
}

export function RevisionTimeline({ events, supplierName }: RevisionTimelineProps) {
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'import':
        return <FileText className="w-5 h-5 text-blue-600" />;
      case 'revision':
        return <RefreshCw className="w-5 h-5 text-purple-600" />;
      case 'rfi':
        return <AlertCircle className="w-5 h-5 text-orange-600" />;
      case 'promotion':
        return <TrendingUp className="w-5 h-5 text-green-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'import':
        return 'bg-blue-100 border-blue-200';
      case 'revision':
        return 'bg-purple-100 border-purple-200';
      case 'rfi':
        return 'bg-orange-100 border-orange-200';
      case 'promotion':
        return 'bg-green-100 border-green-200';
      default:
        return 'bg-gray-100 border-gray-200';
    }
  };

  const sortedEvents = [...events].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Revision History - {supplierName}
      </h3>

      {sortedEvents.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No revision history available</p>
      ) : (
        <div className="space-y-4">
          {sortedEvents.map((event, index) => (
            <div key={event.id} className="relative">
              {/* Timeline line */}
              {index < sortedEvents.length - 1 && (
                <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-200" />
              )}

              {/* Event card */}
              <div className="flex gap-4">
                <div className={`flex-shrink-0 w-12 h-12 rounded-full ${getEventColor(event.event_type)} border-2 flex items-center justify-center`}>
                  {getEventIcon(event.event_type)}
                </div>

                <div className="flex-1 pb-4">
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-semibold text-gray-900">
                          Version {event.revision_number}
                          {event.rfi_reference && (
                            <span className="ml-2 text-sm text-orange-600">
                              ({event.rfi_reference})
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {event.event_description}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-gray-500">
                          {new Date(event.created_at).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(event.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    {(event.price_change !== undefined || event.items_changed !== undefined) && (
                      <div className="flex gap-4 mt-3 pt-3 border-t border-gray-200">
                        {event.price_change !== undefined && event.price_change !== 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Price Change:</span>
                            <span className={`text-sm font-semibold ${
                              event.price_change > 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {event.price_change > 0 ? '+' : ''}
                              ${Math.abs(event.price_change).toLocaleString()}
                            </span>
                          </div>
                        )}

                        {event.items_changed !== undefined && event.items_changed > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Items Changed:</span>
                            <span className="text-sm font-semibold text-purple-600">
                              {event.items_changed}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
