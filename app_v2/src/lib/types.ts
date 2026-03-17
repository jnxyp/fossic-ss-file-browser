export type Dataset = 'original' | 'localization';
export type ViewMode = 'original' | 'parallel' | 'localization';

export interface JarInfo {
  jarName: string;
  name: string;
  hasOriginal: boolean;
  hasLocalization: boolean;
}

export interface FileInfo {
  path: string;
  hasOriginal: boolean;
  hasLocalization: boolean;
}

export interface StringEntry {
  id: number;
  ownerClassName: string;
  cpIndex: number | null;
  utf8Index: number;
  constTable: string;
  value: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface MetaInfo {
  revision: string;
  lastUpdated: string;
  schemaVersion: string;
}

export interface SearchMatch {
  type: 'class' | 'string';
  dataset?: Dataset;
  value?: string;
  matchedPath?: string;
  utf8Index?: number;
  ownerClassName?: string;
  startLine?: number;
}

export interface SearchResult {
  jarName: string;
  sourcePath: string;
  hasOriginal: boolean;
  hasLocalization: boolean;
  matches: SearchMatch[];
}
