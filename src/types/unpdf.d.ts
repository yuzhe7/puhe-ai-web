/**
 * unpdf 的本地最小类型声明。
 * 该包不同版本的 exports 条件导出在 `moduleResolution: bundler` 下偶发无法命中 .d.mts，
 * 这里显式声明我们在 API Route 中实际用到的两个函数，避免 TS7016。
 */
declare module 'unpdf' {
  export interface PDFDocumentProxy {
    numPages: number;
    [key: string]: unknown;
  }
  export function getDocumentProxy(data: Uint8Array | ArrayBuffer): Promise<PDFDocumentProxy>;
  export function extractText(
    document: PDFDocumentProxy,
    options?: { mergePages?: boolean },
  ): Promise<{ totalPages: number; text: string | string[] }>;
}
