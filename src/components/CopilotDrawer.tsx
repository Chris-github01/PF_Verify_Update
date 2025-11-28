import { useState } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your AI Copilot. I can help you navigate the app, answer questions about your quotes, and provide insights. What can I help you with?",
    },
  ]);

  const handleSend = () => {
    if (!message.trim()) return;

    setMessages((prev) => [...prev, { role: 'user', content: message }]);

    const lowerMessage = message.toLowerCase();
    let response = "I'm still learning! This is a placeholder response. In production, I would be powered by AI to provide intelligent assistance.";

    if (lowerMessage.includes('quote') || lowerMessage.includes('import')) {
      response = "To import quotes, navigate to the Quotes tab and upload your PDF or Excel files. I can help you with parsing issues if you encounter any.";
      setTimeout(() => onNavigate('quotes', currentProjectId), 2000);
    } else if (lowerMessage.includes('report') || lowerMessage.includes('award')) {
      response = "The Award Report is generated in the Reports section. It uses AI to analyze all quotes and recommend the best supplier based on price, coverage, and risk.";
      setTimeout(() => onNavigate('reports', currentProjectId), 2000);
    } else if (lowerMessage.includes('scope') || lowerMessage.includes('matrix')) {
      response = "The Scope Matrix shows a side-by-side comparison of all suppliers' pricing. It highlights variances and helps identify gaps in coverage.";
      setTimeout(() => onNavigate('scope', currentProjectId), 2000);
    }

    setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
    }, 500);

    setMessage('');
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
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask me anything..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSend}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
