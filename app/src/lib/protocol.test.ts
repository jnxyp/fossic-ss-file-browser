import { describe, it, expect } from 'vitest';
import { PROTOCOL_NAME, ALLOWED_ORIGINS, MessageType } from './protocol';

describe('Protocol Definitions', () => {
  it('协议版本应一致', () => {
    expect(PROTOCOL_NAME).toBe('ss-file-browser/v1');
  });

  it('应仅允许 ParaTranz 域名', () => {
    expect(ALLOWED_ORIGINS).toEqual(['https://paratranz.cn']);
  });

  it('核心消息类型已定义', () => {
    expect(MessageType.PT_NAVIGATE_TO_STRING).toBe('PT_NAVIGATE_TO_STRING');
    expect(MessageType.FB_READY).toBe('FB_READY');
  });
});
