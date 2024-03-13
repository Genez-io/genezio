export const storageJs = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

class LocalStorageWrapper {
  setItem(key, value) {
    localStorage.setItem(key, value);
  }

  getItem(key) {
    return localStorage.getItem(key);
  }

  removeItem(key) {
    localStorage.removeItem(key);
  }

  clear() {
    localStorage.clear();
  }
}

export class StorageManager {
  static storage = null;
  static getStorage() {
    if (!this.storage) {
      this.storage = new LocalStorageWrapper();
    }
    return this.storage;
  }
  static setStorage(storage) {
    this.storage = storage;
  }
}

`;
