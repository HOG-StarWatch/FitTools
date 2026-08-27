/**
 * 统一的 JSON / 错误响应工厂。
 * 让所有处理器对客户端暴露一致的 Content-Type、Cache-Control 与错误格式。
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * 构造带下载文件名与可选附加头（X-Elevation-*）的通用下载响应。
 * 替代原先散落在 handlers.ts / lib.ts 的重复 header 拼接。
 */
export function downloadResponse(
  body: string | ArrayBuffer,
  contentType: string,
  filename: string,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename=${filename}`,
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}
