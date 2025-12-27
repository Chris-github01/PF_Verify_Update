import { useState, useEffect } from 'react';
import { X, Send, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrganisation } from '../lib/organisationContext';
import { fetchProjectDataForCopilot, type CopilotProjectData } from '../lib/copilot/copilotDataProvider';
import { sendCopilotMessage, type CopilotMessage } from '../lib/copilot/copilotAI';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId?: string;
  allProjects: { id: string; name: string }[];
  onNavigate: (path: string, projectId?: string) => void;
}

export default function CopilotDrawer({
  isOpen,
  onClose,
  currentProjectId,
  allProjects,
  onNavigate,
}: CopilotDrawerProps) {
  const { currentOrganisation } = useOrganisation();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your AI Copilot. I can help you navigate the app, answer questions about your quotes, and provide insights. What can I help you with?",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [projectData, setProjectData] = useState<CopilotProjectData | null>(null);

  useEffect(() => {
    if (isOpen && currentProjectId) {
      loadProjectData();
    }
  }, [isOpen, currentProjectId]);

  const loadProjectData = async () => {
    if (!currentProjectId) return;

    try {
      const data = await fetchProjectDataForCopilot(currentProjectId);
      setProjectData(data);
    } catch (error) {
      console.error('Error loading project data for copilot:', error);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    setMessage('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const response = await sendCopilotMessage({
        messages: [
          ...conversationMessages,
          { role: 'user', content: userMessage }
        ],
        projectData: projectData,
        organisationId: currentOrganisation?.id,
      });

      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);

      const lowerMessage = userMessage.toLowerCase();
      if (lowerMessage.includes('navigate') || lowerMessage.includes('go to') || lowerMessage.includes('show me')) {
        if (lowerMessage.includes('quote')) {
          setTimeout(() => onNavigate('quotes', currentProjectId), 1500);
        } else if (lowerMessage.includes('review')) {
          setTimeout(() => onNavigate('review', currentProjectId), 1500);
        } else if (lowerMessage.includes('scope') || lowerMessage.includes('matrix')) {
          setTimeout(() => onNavigate('scope', currentProjectId), 1500);
        } else if (lowerMessage.includes('report')) {
          setTimeout(() => onNavigate('reports', currentProjectId), 1500);
        } else if (lowerMessage.includes('contract')) {
          setTimeout(() => onNavigate('contract', currentProjectId), 1500);
        }
      }
    } catch (error) {
      console.error('Error sending copilot message:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "I apologize, but I'm having trouble processing your request. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-30 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center">
                  <Sparkles size={18} className="text-white" />
                </div>
                <h2 className="text-lg font-semibold">AI Copilot</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-900 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200">
              {projectData && (
                <div className="mb-2 text-xs text-gray-500 flex items-center gap-2">
                  <Sparkles size={12} />
                  <span>
                    Context: {projectData.project.name} ({projectData.quotes.length} quotes, {projectData.quotes.flatMap(q => q.items).length} items)
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Ask me anything..."
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !message.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
