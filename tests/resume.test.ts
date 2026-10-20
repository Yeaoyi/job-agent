import assert from 'node:assert/strict'
import test from 'node:test'
import { extractResumeFields, mergeReviewedResume, emptyResume } from '../src/shared/resume'
import { parseResume } from '../src/main/resume-parser'

function textPdf(text: string): Buffer {
  const body = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let document = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(document))
    document += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xref = Buffer.byteLength(document)
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(document)
}

test('extracts explicit labels and common resume sections without generating facts', () => {
  const fields = extractResumeFields(`姓名：林晓宇
联系电话：138 0013 8000
邮箱：lin@example.com
求职意向：前端开发工程师
意向城市：上海

教育经历
2022.09 - 2026.06 某大学 软件工程 本科

项目经历
求职 Agent：使用 React 和 TypeScript 制作桌面应用。

专业技能
React、TypeScript、Git

个人简介
关注桌面端体验和求职工具。`)

  assert.equal(fields.name, '林晓宇')
  assert.equal(fields.phone, '138 0013 8000')
  assert.equal(fields.email, 'lin@example.com')
  assert.equal(fields.targetRole, '前端开发工程师')
  assert.equal(fields.city, '上海')
  assert.match(fields.education, /软件工程/)
  assert.match(fields.experience, /求职 Agent/)
  assert.match(fields.skills, /TypeScript/)
  assert.match(fields.summary, /桌面端体验/)
  assert.equal(fields.summary.includes('人工智能专家'), false)
})

test('only selected reviewed fields replace existing resume fields', () => {
  const merged = mergeReviewedResume(
    { ...emptyResume, name: '原姓名', email: 'old@example.com', experience: '原项目' },
    { ...emptyResume, name: '新姓名', email: 'new@example.com', skills: 'React' },
    ['name', 'skills']
  )
  assert.equal(merged.name, '新姓名')
  assert.equal(merged.skills, 'React')
  assert.equal(merged.email, 'old@example.com')
  assert.equal(merged.experience, '原项目')
})

test('rejects invalid DOCX before attempting extraction', async () => {
  await assert.rejects(() => parseResume(Buffer.from('not a docx'), 'docx'), /不是有效的 DOCX/)
})

test('rejects a PDF without a valid PDF signature', async () => {
  await assert.rejects(() => parseResume(Buffer.from('not a pdf'), 'pdf'), /不是有效的 PDF/)
})

test('extracts text from a valid text PDF locally', async () => {
  const parsed = await parseResume(textPdf('Local Resume Content'), 'pdf')
  assert.match(parsed.rawText, /Local Resume Content/)
  assert.ok(parsed.warnings.some((warning) => warning.includes('PDF 多栏')))
})
