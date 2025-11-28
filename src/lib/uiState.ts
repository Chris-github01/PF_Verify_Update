export const uiState = {
  set: (key: string, value: any) => localStorage.setItem(key, JSON.stringify(value)),
  get: (key: string) => {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  },
};

export function getPageUIState(page: string) {
  return {
    get: (key: string) => uiState.get(`${page}_${key}`),
    set: (key: string, value: any) => uiState.set(`${page}_${key}`, value),
  };
}

export function setProjectUIState(projectId: string, key: string, value: any) {
  uiState.set(`project_${projectId}_${key}`, value);
}

export function getProjectUIState(projectId: string, key: string) {
  return uiState.get(`project_${projectId}_${key}`);
}
