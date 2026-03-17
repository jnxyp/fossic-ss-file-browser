export const PROTOCOL_NAME = 'ss-file-browser/v1';
export const ALLOWED_ORIGINS = ['https://paratranz.cn'];

export enum MessageType {
  PT_NAVIGATE_TO_STRING = 'PT_NAVIGATE_TO_STRING',
  PT_PING = 'PT_PING',
  PT_ERROR = 'PT_ERROR',
  PT_ACK = 'PT_ACK',
  FB_READY = 'FB_READY',
  FB_ERROR = 'FB_ERROR',
  FB_NAVIGATE_TO_PARATRANZ_STRING = 'FB_NAVIGATE_TO_PARATRANZ_STRING',
}

export interface BaseMessage {
  protocol: typeof PROTOCOL_NAME;
  type: MessageType;
  requestId: string;
  timestamp?: number;
}

export interface NavigateToStringPayload {
  jarName: string;
  className: string;
  utf8ConstId: string;
}

export interface NavigateToParatranzPayload {
  locator: string;
  value: string;
  utf8ConstId: string;
  dataset: 'original' | 'localization';
}

export interface ReadyPayload {
  connected: boolean;
  appOrigin: string;
  dataset?: string;
  revision?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  detail?: unknown;
}

export type AppMessage =
  | (BaseMessage & { type: MessageType.PT_NAVIGATE_TO_STRING; payload: NavigateToStringPayload })
  | (BaseMessage & { type: MessageType.PT_PING })
  | (BaseMessage & { type: MessageType.PT_ERROR; payload: ErrorPayload })
  | (BaseMessage & { type: MessageType.PT_ACK; payload: { accepted: boolean; message?: string } })
  | (BaseMessage & { type: MessageType.FB_READY; payload: ReadyPayload })
  | (BaseMessage & { type: MessageType.FB_ERROR; payload: ErrorPayload })
  | (BaseMessage & { type: MessageType.FB_NAVIGATE_TO_PARATRANZ_STRING; payload: NavigateToParatranzPayload });
