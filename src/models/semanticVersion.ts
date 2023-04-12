export class SemanticVersion {
    major: number;
    minor: number;
    patch: number;
  
    constructor(versionString: string) {
      const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)$/);
      if (!match) {
        throw new Error(`Invalid SemVer version string: ${versionString}`);
      }
  
      this.major = Number(match[1]);
      this.minor = Number(match[2]);
      this.patch = Number(match[3]);
    }
  
    toString(): string {
      return `${this.major}.${this.minor}.${this.patch}`;
    }
  
    isGreaterThan(other: SemanticVersion): boolean {
      if (this.major > other.major) {
        return true;
      } else if (this.major < other.major) {
        return false;
      } else if (this.minor > other.minor) {
        return true;
      } else if (this.minor < other.minor) {
        return false;
      } else if (this.patch > other.patch) {
        return true;
      } else {
        return false;
      }
    }
  
    isLessThan(other: SemanticVersion): boolean {
      return other.isGreaterThan(this);
    }
  
    isEqualTo(other: SemanticVersion): boolean {
      return this.major === other.major && this.minor === other.minor && this.patch === other.patch;
    }
  }