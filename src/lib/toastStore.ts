import { useState, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  body?: string;
  createdAt: number;
  duration?: number;
}

class ToastStore {
  private listeners: Set<(messages: ToastMessage[]) => void> = new Set();
  private messages: ToastMessage[] = [];

  subscribe(listener: (messages: ToastMessage[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(listener => listener([...this.messages]));
  }

  show(options: Omit<ToastMessage, 'id' | 'createdAt'>) {
    const message: ToastMessage = {
      ...options,
      id: Math.random().toString(36).substring(2, 11),
      createdAt: Date.now(),
      duration: options.duration || 5000,
    };

    this.messages.push(message);
    this.notify();

    if (message.duration && message.duration > 0) {
      setTimeout(() => {
        this.dismiss(message.id);
      }, message.duration);
    }
  }

  dismiss(id: string) {
    this.messages = this.messages.filter(m => m.id !== id);
    this.notify();
  }

  remove(id: string) {
    this.dismiss(id);
  }

  clear() {
    this.messages = [];
    this.notify();
  }

  showAccessDenied(customBody?: string) {
    this.show({
      type: 'warning',
      title: 'Access denied',
      body: customBody || "You don't have permission to manage organisation members. If you need access, please contact your organisation admin.",
      duration: 6000,
    });
  }
}

export const toastStore = new ToastStore();

export function useToasts() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    return toastStore.subscribe(setMessages);
  }, []);

  return {
    messages,
    show: (options: Omit<ToastMessage, 'id' | 'createdAt'>) => toastStore.show(options),
    dismiss: (id: string) => toastStore.dismiss(id),
    clear: () => toastStore.clear(),
    showAccessDenied: (customBody?: string) => toastStore.showAccessDenied(customBody),
  };
}
