export interface ProjectMeta {
  name: string;
  client: string;
  created: string;
  description?: string;
}

export interface ProjectSnapshot {
  id?: string;
  projectKey: string;
  projectMeta: ProjectMeta;
  suppliers: string[];
  normalisedLines: any[];
  mappings: any[];
  comparisonRows: any[];
  awardSummary: any;
  settings: any;
  snapshotDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SnapshotLibrary {
  [projectKey: string]: ProjectSnapshot;
}
