import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { getArtifactsPath } from './manifest';

interface StringIndexEntry {
  utf8_index: number;
  line: number;
  const_table?: string;
}

type StringIndexData = Record<string, StringIndexEntry[]>;

function normalizeSourceClassPath(className: string) {
  return className.replace(/\$[^/]+(?=\.class$|\.java$)/, '');
}

function parseConstTableSuffix(className: string) {
  const match = className.match(/(\$[^/]+)(?=\.class$|\.java$)/);
  return match?.[1] ?? '';
}

export async function readFileFromJar(
  jarName: string,
  className: string,
  dataset: 'original' | 'localization' = 'localization'
): Promise<string | null> {
  const artifactsPath = getArtifactsPath();
  const zipName = jarName.endsWith('.zip') ? jarName : `${jarName.replace(/\.jar$/, '')}.zip`;
  const zipPath = path.join(artifactsPath, dataset, zipName);

  if (!fs.existsSync(zipPath)) {
    console.error(`Zip 文件不存在: ${zipPath}`);
    return null;
  }

  try {
    const zip = new AdmZip(zipPath);
    const normalizedClassName = normalizeSourceClassPath(className);
    const javaFilePath = normalizedClassName.endsWith('.java')
      ? normalizedClassName
      : `${normalizedClassName.replace(/\.class$/, '')}.java`;
    const entry = zip.getEntry(javaFilePath);

    if (!entry) {
      console.warn(`未在 ${jarName} 中找到文件: ${javaFilePath}`);
      return null;
    }

    return entry.getData().toString('utf8');
  } catch (error) {
    console.error(`解析 Zip 失败: ${zipPath}`, error);
    return null;
  }
}

export async function findLinesByUtf8ConstId(
  jarName: string,
  className: string,
  utf8ConstId: string,
  dataset: 'original' | 'localization' = 'localization'
): Promise<number[]> {
  const artifactsPath = getArtifactsPath();
  const baseName = jarName.replace(/\.(jar|zip)$/, '');
  const indexFile = path.join(artifactsPath, dataset, `${baseName}.strings.json`);

  if (!fs.existsSync(indexFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(indexFile, 'utf-8');
    const indexData = JSON.parse(content) as StringIndexData;

    const utf8Index = parseInt(utf8ConstId.replace('#', ''), 10);
    const normalizedClass = normalizeSourceClassPath(className).replace(/\.(class|java)$/, '');
    const expectedConstTable = parseConstTableSuffix(className);

    const fileEntries = indexData[normalizedClass];
    if (!fileEntries) {
      return [];
    }

    return fileEntries
      .filter(entry => entry.utf8_index === utf8Index)
      .filter(entry => (entry.const_table ?? '') === expectedConstTable)
      .map(entry => entry.line);
  } catch (error) {
    console.error('查询索引失败:', error);
    return [];
  }
}
