import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { getArtifactsPath } from './manifest';

interface StringIndexEntry {
  utf8_index: number;
  line: number;
}

type StringIndexData = Record<string, StringIndexEntry[]>;

/**
 * 从 Zip 包中读取指定文件的内容
 * @param jarName Jar/Zip 文件名 (例如 starfarer.api.jar)
 * @param className 类路径 (例如 com/fs/starfarer/api/impl/campaign/FleetAssignment)
 * @param dataset 数据集类型
 */
export async function readFileFromJar(
  jarName: string, 
  className: string, 
  dataset: 'original' | 'localization' = 'localization'
): Promise<string | null> {
  const artifactsPath = getArtifactsPath();

  // 路径约定: artifacts/[A|B]/[dataset]/[baseName].zip
  // jarName 可能已带 .zip（来自侧边栏），也可能是 .jar（来自 postMessage）
  const zipName = jarName.endsWith('.zip') ? jarName : `${jarName.replace(/\.jar$/, '')}.zip`;
  const zipPath = path.join(artifactsPath, dataset, zipName);

  if (!fs.existsSync(zipPath)) {
    console.error(`Zip 文件不存在: ${zipPath}`);
    return null;
  }

  try {
    const zip = new AdmZip(zipPath);
    // 将 .class 路径转换为 .java 路径
    const javaFilePath = className.endsWith('.java') ? className : `${className.replace(/\.class$/, '')}.java`;
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

/**
 * 根据 utf8_index 获取文件中所有匹配的行号（多重匹配支持）
 * @param jarName Jar/Zip 文件名
 * @param className 类路径
 * @param stringId 字符串 ID (形如 #160)
 * @param dataset 数据集类型
 */
export async function findLinesByStringId(
  jarName: string,
  className: string,
  stringId: string,
  dataset: 'original' | 'localization' = 'localization'
): Promise<number[]> {
  const artifactsPath = getArtifactsPath();
  // 索引文件位置：artifacts/[A|B]/[dataset]/[baseName].strings.json
  const baseName = jarName.replace(/\.(jar|zip)$/, '');
  const indexFile = path.join(artifactsPath, dataset, `${baseName}.strings.json`);

  if (!fs.existsSync(indexFile)) return [];

  try {
    const content = fs.readFileSync(indexFile, 'utf-8');
    const indexData = JSON.parse(content) as StringIndexData;

    const utf8Index = parseInt(stringId.replace('#', ''), 10);
    const normalizedClass = className.replace(/\.(class|java)$/, '');

    const fileEntries = indexData[normalizedClass];
    if (!fileEntries) return [];

    // 返回所有匹配该 utf8_index 的行号
    return fileEntries
      .filter(entry => entry.utf8_index === utf8Index)
      .map(entry => entry.line);
  } catch (error) {
    console.error('查询索引失败:', error);
    return [];
  }
}
