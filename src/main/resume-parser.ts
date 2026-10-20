import mammoth from 'mammoth'
import { extractResumeFields } from '../shared/resume'
import type { ResumeData } from '../shared/data'

export const MAX_RESUME_BYTES = 10 * 1024 * 1024
export type ParsedResume = { rawText: string; fields: ResumeData; warnings: string[] }

export async function parseResume(buffer: Buffer, format: 'pdf' | 'docx'): Promise<ParsedResume> {
  if (!buffer.length || buffer.length > MAX_RESUME_BYTES)
    throw new Error('请选择非空且不超过 10 MB 的简历文件。')
  const warnings: string[] = []
  let text = ''
  if (format === 'pdf') {
    if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')))
      throw new Error('文件不是有效的 PDF。')
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true
    })
    try {
      const pdf = await task.promise
      if (pdf.numPages > 30) throw new Error('简历超过 30 页，请精简后重新导入。')
      let emptyPages = 0
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        const page = await pdf.getPage(pageNo)
        const content = await page.getTextContent()
        let pageText = ''
        let lastY: number | undefined
        for (const item of content.items) {
          if (!('str' in item)) continue
          const y = item.transform[5]
          if (lastY !== undefined && Math.abs(lastY - y) > 3 && !pageText.endsWith('\n'))
            pageText += '\n'
          pageText += item.str + (item.hasEOL ? '\n' : ' ')
          lastY = y
        }
        if (!pageText.trim()) emptyPages++
        text += `${pageText}\n\n`
        if (text.length > 200_000) throw new Error('简历文本过长，请精简后重新导入。')
        page.cleanup()
      }
      if (emptyPages)
        warnings.push(`${emptyPages} 页没有可提取文字，可能包含扫描图片；请对照原文件补充遗漏。`)
      warnings.push('PDF 多栏、表格和特殊字体可能影响文字顺序，请对照原文件检查。')
    } catch (error) {
      if (error instanceof Error && error.name === 'PasswordException')
        throw new Error('PDF 已加密，请移除密码后重新导入。')
      throw error
    } finally {
      await task.destroy()
    }
  } else {
    if (buffer.length < 2 || buffer.readUInt16LE(0) !== 0x4b50)
      throw new Error('文件不是有效的 DOCX，请用 Word 另存为 .docx。')
    const result = await mammoth.extractRawText({ buffer })
    text = result.value
    if (result.messages.length)
      warnings.push('文档包含未能完整解析的格式或元素，请对照原文件检查。')
    warnings.push('DOCX 中的图片、页眉页脚和文本框可能不会被提取，请对照原文件检查。')
  }
  const rawText = text.split('\0').join('').replace(/\r\n?/g, '\n').trim()
  if (!rawText) throw new Error('未提取到文字。扫描件或图片简历请先用 OCR 转成文字型 PDF / DOCX。')
  if (rawText.length > 200_000) throw new Error('简历文本过长，请精简后重新导入。')
  const fields = extractResumeFields(rawText)
  warnings.push('当前使用本地规则识别，未识别字段留空；这不是 AI 分析结果。')
  return { rawText, fields, warnings }
}
