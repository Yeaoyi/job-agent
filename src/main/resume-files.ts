import { app } from 'electron'
import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import type { ResumeDocument } from '../shared/data'
import type { ParsedResume } from './resume-parser'

export const MAX_RESUME_BYTES = 10 * 1024 * 1024
export const MAX_DOCUMENTS = 10
const directory = (): string => join(app.getPath('userData'), 'resume-files')

export function originalPath(doc: ResumeDocument): string {
  if (!/^[0-9a-f-]{36}$/i.test(doc.id) || !['pdf', 'docx'].includes(doc.format))
    throw new Error('简历文件编号无效。')
  return join(directory(), `${doc.id}.${doc.format}`)
}

export async function storeOriginal(doc: ResumeDocument, bytes: Buffer): Promise<void> {
  await mkdir(directory(), { recursive: true })
  await writeFile(originalPath(doc), bytes, { flag: 'wx' })
}

export const readOriginal = (doc: ResumeDocument): Promise<Buffer> => readFile(originalPath(doc))
export async function removeOriginal(doc: ResumeDocument): Promise<void> {
  try {
    await unlink(originalPath(doc))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export function parseInWorker(bytes: Buffer, format: 'pdf' | 'docx'): Promise<ParsedResume> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, 'resume-worker.js'), {
      workerData: { bytes, format },
      resourceLimits: { maxOldGenerationSizeMb: 256 }
    })
    let settled = false
    const finish = (error?: Error, result?: ParsedResume): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void worker.terminate()
      if (error) reject(error)
      else resolve(result!)
    }
    const timer = setTimeout(
      () => finish(new Error('解析超过 30 秒，请精简简历或转换格式后重试。')),
      30_000
    )
    worker.once('message', (message: { result?: ParsedResume; error?: string }) =>
      finish(message.error ? new Error(message.error) : undefined, message.result)
    )
    worker.once('error', (error) => finish(new Error(`解析失败：${error.message}`)))
    worker.once('exit', () => {
      if (!settled) finish(new Error('解析进程提前结束，请检查文件或重试。'))
    })
  })
}
