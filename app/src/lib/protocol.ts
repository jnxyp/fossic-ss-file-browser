/**
 * ss-file-browser 通信协议 v1
 */

export const PROTOCOL_NAME = 'ss-file-browser/v1';

/**
 * 消息来源白名单
 */
export const ALLOWED_ORIGINS = ['https://paratranz.cn'];

/**
 * 消息类型枚举
 */
export enum MessageType {
  // ParaTranz -> Browser (导航请求)
  PT_NAVIGATE_TO_STRING = 'PT_NAVIGATE_TO_STRING',
  // ParaTranz -> Browser (心跳)
  PT_PING = 'PT_PING',
  
  // Browser -> ParaTranz (就绪通知)
  FB_READY = 'FB_READY',
  // Browser -> ParaTranz (错误反馈)
  FB_ERROR = 'FB_ERROR',
}

/**
 * 数据集类型
 */
export type DatasetType = 'original' | 'localization';

/**
 * 错误码定义
 */
export enum ErrorCode {
  BAD_PAYLOAD = 'BAD_PAYLOAD',           // 数据格式错误
  DATASET_NOT_FOUND = 'DATASET_NOT_FOUND', // 数据集不存在
  CLASS_NOT_FOUND = 'CLASS_NOT_FOUND',     // 类文件不存在
  STRING_NOT_FOUND = 'STRING_NOT_FOUND',   // 字符串索引未命中
  INTERNAL_ERROR = 'INTERNAL_ERROR',       // 内部错误
}

/**
 * 基础消息接口
 */
export interface BaseMessage {
  protocol: typeof PROTOCOL_NAME;
  type: MessageType;
  requestId: string; // 用于匹配请求响应的唯一 ID
  timestamp?: number;
}

/**
 * 导航请求消息负载
 */
export interface NavigatePayload {
  dataset: DatasetType;
  className: string;   // 例如 com/fs/starfarer/api/impl/campaign/FleetAssignment (路径格式)
  stringId: string;    // 例如 #160 (对应 utf8_index)
}

/**
 * 错误消息负载
 */
export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  detail?: any;
}

/**
 * 就绪消息负载
 */
export interface ReadyPayload {
  connected: boolean;
  appOrigin: string;
}

/**
 * 统一消息联合类型
 */
export type AppMessage = 
  | (BaseMessage & { type: MessageType.PT_NAVIGATE_TO_STRING; payload: NavigatePayload })
  | (BaseMessage & { type: MessageType.PT_PING })
  | (BaseMessage & { type: MessageType.FB_READY; payload: ReadyPayload })
  | (BaseMessage & { type: MessageType.FB_ERROR; payload: ErrorPayload });
