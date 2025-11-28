import { useState, useEffect } from 'react';
import { ChevronDown, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';

interface ProjectSwitcherProps {
  currentProjectId: string;
  currentProjectName: string;
  onProjectChange: (projectId: string) => void;
  onBackToDashboard: () => void;
}

interface Project {
  id: string;
  name: string;
  client: string | null;
  reference: string | null;
}

export default function ProjectSwitcher({
  currentProjectId,
  currentProjectName,
  onProjectChange,
  onBackToDashboard,
}: ProjectSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadProjects();
    }
  }, [isOpen]);

  async function loadProjects() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, client, reference')
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 transition-colors"
      >
        <span className="font-medium text-gray-700">{currentProjectName}</span>
        <ChevronDown size={16} className="text-gray-500" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute left-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto"
            >
              <div className="p-2">
                <button
                  onClick={() => {
                    onBackToDashboard();
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Home size={16} />
                  <span>Back to Dashboard</span>
                </button>

                {loading ? (
                  <div className="px-3 py-8 text-center text-gray-500">
                    Loading projects...
                  </div>
                ) : projects.length > 0 ? (
                  <>
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-t border-gray-200 mt-2">
                      Switch Project
                    </div>
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => {
                          if (project.id !== currentProjectId) {
                            onProjectChange(project.id);
                          }
                          setIsOpen(false);
                        }}
                        className={`w-full flex flex-col items-start gap-1 px-3 py-2 text-sm rounded-lg transition-colors ${
                          project.id === currentProjectId
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span className="font-medium">{project.name}</span>
                        {(project.client || project.reference) && (
                          <span className="text-xs text-gray-500">
                            {[project.client, project.reference]
                              .filter(Boolean)
                              .join(' • ')}
                          </span>
                        )}
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="px-3 py-8 text-center text-gray-500">
                    No other projects found
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
