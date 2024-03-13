export const storageTs = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

export interface Storage {
    setItem(key: string, value: string): void;
    
    getItem(key: string): string | null;
    
    removeItem(key: string): void;
    
    clear(): void;
}

class LocalStorageWrapper implements Storage {
  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  clear(): void {
    localStorage.clear();
  }
}

export class StorageManager {
  private static storage: Storage|null = null;
  static getStorage(): Storage {
    if (!this.storage) {
      this.storage = new LocalStorageWrapper();
    }
    return this.storage;
  }
  static setStorage(storage: Storage): void {
    this.storage = storage;
  }
}

`;
