import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Folders,
  Upload,
  TrendingUp,
  FileText,
  LayoutDashboard,
  Settings,
  FileSpreadsheet,
  Sparkles,
  Grid3x3,
  Scale,
  Brain,
  ListChecks,
  Layers,
  Trophy,
  BarChart3,
  FileDown,
} from 'lucide-react';
import type { PrimaryTab } from './AppBar';
type SecondaryTab = string;

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activePrimaryTab: PrimaryTab;
  activeSecondaryTab: SecondaryTab;
  onPrimaryTabChange: (tab: PrimaryTab) => void;
  onSecondaryTabChange: (tab: SecondaryTab) => void;
}

const drawerSections = [
  {
    id: 'project' as PrimaryTab,
    label: 'Project',
    icon: Folders,
    items: [
      { id: 'dashboard' as SecondaryTab, label: 'Project Dashboard', icon: LayoutDashboard },
      { id: 'projectsettings' as SecondaryTab, label: 'Project Settings', icon: Settings },
    ],
  },
  {
    id: 'import' as PrimaryTab,
    label: 'Import',
    icon: Upload,
    items: [
      { id: 'importquotes' as SecondaryTab, label: 'Import Quotes (PDF)', icon: Upload },
      { id: 'importboq' as SecondaryTab, label: 'Import Excel BOQ', icon: FileSpreadsheet },
      { id: 'review' as SecondaryTab, label: 'Review & Clean', icon: Sparkles },
    ],
  },
  {
    id: 'analysis' as PrimaryTab,
    label: 'Analysis',
    icon: TrendingUp,
    items: [
      { id: 'scope' as SecondaryTab, label: 'Scope Matrix', icon: Grid3x3 },
      { id: 'equalisation' as SecondaryTab, label: 'Equalisation', icon: Scale },
      { id: 'tradeanalysis' as SecondaryTab, label: 'Trade Analysis', icon: TrendingUp },
      { id: 'quoteintel' as SecondaryTab, label: 'Quote Intelligence', icon: Brain },
      { id: 'basetracker' as SecondaryTab, label: 'Base Tracker', icon: ListChecks },
      { id: 'claimsvariations' as SecondaryTab, label: 'Claims & Variations', icon: Layers },
    ],
  },
  {
    id: 'reports' as PrimaryTab,
    label: 'Reports',
    icon: FileText,
    items: [
      { id: 'award' as SecondaryTab, label: 'Award Report', icon: Trophy },
      { id: 'insights' as SecondaryTab, label: 'Insights Dashboard', icon: BarChart3 },
      { id: 'exports' as SecondaryTab, label: 'Exports', icon: FileDown },
    ],
  },
];

export default function MobileDrawer({
  isOpen,
  onClose,
  activePrimaryTab,
  activeSecondaryTab,
  onPrimaryTabChange,
  onSecondaryTabChange,
}: MobileDrawerProps) {
  const handleItemClick = (primaryTab: PrimaryTab, secondaryTab: SecondaryTab) => {
    onPrimaryTabChange(primaryTab);
    onSecondaryTabChange(secondaryTab);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
          />

          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-80 bg-gray-900 border-r border-white/10 shadow-2xl z-50 overflow-y-auto lg:hidden"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-gray-900 z-10">
              <h2 className="text-lg font-bold text-white">Navigation</h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-6">
              {drawerSections.map((section) => {
                const SectionIcon = section.icon;
                const isSectionActive = activePrimaryTab === section.id;

                return (
                  <div key={section.id}>
                    <div className="flex items-center gap-2 mb-3">
                      <SectionIcon className={isSectionActive ? 'text-cyan-400' : 'text-gray-400'} size={18} />
                      <h3 className={`text-sm font-semibold uppercase tracking-wide ${isSectionActive ? 'text-cyan-400' : 'text-gray-400'}`}>
                        {section.label}
                      </h3>
                    </div>

                    <div className="space-y-1">
                      {section.items.map((item) => {
                        const ItemIcon = item.icon;
                        const isActive = activeSecondaryTab === item.id && activePrimaryTab === section.id;

                        return (
                          <button
                            key={item.id}
                            onClick={() => handleItemClick(section.id, item.id)}
                            className={`
                              w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all
                              ${
                                isActive
                                  ? 'bg-cyan-500/20 text-white border border-cyan-500/50'
                                  : 'text-gray-300 hover:text-white hover:bg-white/5'
                              }
                            `}
                          >
                            <ItemIcon size={16} />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
