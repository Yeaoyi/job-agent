import { app, dialog, ipcMain, shell } from 'electron'
import { readFile, rename, writeFile, stat } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Company, LegacyData, ResumeData, ResumeDocument, Workspace } from '../shared/data'
import { emptyResume, resumeKeys, mergeReviewedResume } from '../shared/resume'
import {
  MAX_DOCUMENTS,
  MAX_RESUME_BYTES,
  originalPath,
  parseInWorker,
  readOriginal,
  removeOriginal,
  storeOriginal
} from './resume-files'
const filePath = (): string => join(app.getPath('userData'), 'workspace-v1.json')
const string = (value: unknown): string => (typeof value === 'string' ? value : '')
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

function normalizeCompanies(value: unknown): Company[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => string(record(item).name).trim())
    .map((item) => {
      const company = record(item)
      return {
        id: string(company.id) || randomUUID(),
        name: string(company.name).trim(),
        industry: string(company.industry),
        city: string(company.city),
        recruitmentUrl: string(company.recruitmentUrl),
        jobs: Array.isArray(company.jobs)
          ? company.jobs
              .filter((job) => string(record(job).title).trim())
              .map((job) => {
                const fields = record(job)
                return {
                  id: string(fields.id) || randomUUID(),
                  title: string(fields.title).trim(),
                  type: string(fields.type),
                  salary: string(fields.salary),
                  jd: string(fields.jd),
                  applyUrl: string(fields.applyUrl)
                }
              })
          : []
      }
    })
}

function normalizeResume(value: unknown): ResumeData {
  const data = record(value)
  return {
    name: string(data.name),
    phone: string(data.phone),
    targetRole: string(data.targetRole),
    city: string(data.city),
    email: string(data.email),
    summary: string(data.summary),
    experience: string(data.experience),
    skills: string(data.skills),
    education: string(data.education)
  }
}

function normalizeWorkspace(value: unknown): Workspace {
  const data = record(value)
  if (data.version !== 1) throw new Error('备份文件版本不受支持。')
  if (
    !Array.isArray(data.companies) ||
    !Array.isArray(data.resumeVersions) ||
    !Array.isArray(data.applicationIntents) ||
    !data.resume
  ) {
    throw new Error('数据文件内容不完整。')
  }
  const requireFields = (value: unknown, fields: string[]): void => {
    const item = record(value)
    if (fields.some((field) => typeof item[field] !== 'string'))
      throw new Error('备份中存在无效字段。')
  }
  const ids = new Set<string>()
  const checkId = (id: unknown): void => {
    if (typeof id !== 'string' || !id || ids.has(id))
      throw new Error('备份包含缺失或重复的记录编号。')
    ids.add(id)
  }
  for (const company of data.companies) {
    requireFields(company, ['id', 'name', 'industry', 'city', 'recruitmentUrl'])
    const item = record(company)
    checkId(item.id)
    if (!string(item.name).trim() || !Array.isArray(item.jobs)) throw new Error('企业数据无效。')
    for (const job of item.jobs) {
      requireFields(job, ['id', 'title', 'type', 'salary', 'jd', 'applyUrl'])
      checkId(record(job).id)
      if (!string(record(job).title).trim()) throw new Error('岗位名称不能为空。')
    }
  }
  // New fields default to empty for pre-parser workspaces and backups.
  const resumeFields = resumeKeys.filter((key) => key !== 'phone' && key !== 'education')
  requireFields(data.resume, resumeFields)
  for (const version of data.resumeVersions) {
    requireFields(version, ['id', 'createdAt'])
    checkId(record(version).id)
    requireFields(record(version).data, resumeFields)
  }
  for (const intent of data.applicationIntents) {
    requireFields(intent, ['id', 'companyId', 'jobId', 'companyName', 'jobTitle', 'createdAt'])
    checkId(record(intent).id)
    if (record(intent).status !== 'intent') throw new Error('投递意向状态无效。')
  }
  const documents = data.resumeDocuments ?? []
  if (!Array.isArray(documents) || documents.length > MAX_DOCUMENTS)
    throw new Error('简历文件记录无效或数量过多。')
  for (const doc of documents) {
    const item = record(doc)
    requireFields(doc, ['id', 'fileName', 'format', 'importedAt', 'rawText', 'status'])
    checkId(item.id)
    if (
      !/^[0-9a-f-]{36}$/i.test(string(item.id)) ||
      !['pdf', 'docx'].includes(string(item.format)) ||
      !['pending', 'confirmed'].includes(string(item.status)) ||
      !Number.isInteger(item.size) ||
      (item.size as number) <= 0 ||
      (item.size as number) > MAX_RESUME_BYTES ||
      string(item.rawText).length > 200_000 ||
      !Array.isArray(item.warnings) ||
      item.warnings.some((entry) => typeof entry !== 'string') ||
      !Array.isArray(item.selectedFields) ||
      item.selectedFields.some((key) => !resumeKeys.includes(key as keyof ResumeData))
    )
      throw new Error('简历解析记录无效。')
    requireFields(item.fields, resumeKeys)
  }
  return {
    version: 1,
    companies: normalizeCompanies(data.companies),
    resume: normalizeResume(data.resume),
    resumeDocuments: documents.map((entry) => {
      const item = record(entry)
      return {
        id: string(item.id),
        fileName: basename(string(item.fileName)),
        format: item.format as 'pdf' | 'docx',
        size: item.size as number,
        importedAt: string(item.importedAt),
        rawText: string(item.rawText),
        warnings: item.warnings as string[],
        fields: normalizeResume(item.fields),
        selectedFields: [...new Set(item.selectedFields as (keyof ResumeData)[])],
        status: item.status as 'pending' | 'confirmed',
        ...(item.confirmedAt ? { confirmedAt: string(item.confirmedAt) } : {})
      }
    }),
    resumeVersions: data.resumeVersions
      .map((entry) => {
        const item = record(entry)
        return {
          id: string(item.id),
          createdAt: string(item.createdAt),
          data: normalizeResume(item.data)
        }
      })
      .filter((item) => item.id && item.createdAt),
    applicationIntents: data.applicationIntents
      .map((entry) => {
        const item = record(entry)
        return {
          id: string(item.id),
          companyId: string(item.companyId),
          jobId: string(item.jobId),
          companyName: string(item.companyName),
          jobTitle: string(item.jobTitle),
          createdAt: string(item.createdAt),
          status: 'intent' as const
        }
      })
      .filter((item) => item.id && item.companyId && item.jobId)
  }
}

let workspace: Workspace | null = null
let queue = Promise.resolve()
let importingResume = false

async function persist(next: Workspace): Promise<Workspace> {
  const path = filePath()
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(next, null, 2), { flag: 'wx' })
  await rename(temporary, path)
  workspace = next
  return next
}

function mutate(
  change: (current: Workspace) => Workspace,
  replacement?: Workspace
): Promise<Workspace> {
  const task = queue.then(async () => {
    if (replacement) return persist(replacement)
    if (!workspace) throw new Error('本地数据尚未加载。')
    return persist(change(workspace))
  })
  queue = task.then(
    () => undefined,
    () => undefined
  )
  return task
}

export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:load', async (_event, legacy: LegacyData) => {
    await queue
    if (workspace) return workspace
    try {
      workspace = normalizeWorkspace(JSON.parse(await readFile(filePath(), 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const imported = record(legacy)
      return persist({
        version: 1,
        companies: normalizeCompanies(imported.companies),
        resume: normalizeResume(imported.resume ?? emptyResume),
        resumeVersions: [],
        resumeDocuments: [],
        applicationIntents: []
      })
    }
    return workspace
  })

  ipcMain.handle('workspace:save-companies', (_event, companies: Company[]) =>
    mutate((current) => ({ ...current, companies: normalizeCompanies(companies) }))
  )

  ipcMain.handle('workspace:save-resume', (_event, resume: ResumeData) =>
    mutate((current) => {
      const data = normalizeResume(resume)
      return {
        ...current,
        resume: data,
        resumeVersions: [
          { id: randomUUID(), createdAt: new Date().toISOString(), data },
          ...current.resumeVersions
        ]
      }
    })
  )

  ipcMain.handle('resume:import', async () => {
    if (importingResume) throw new Error('已有简历正在解析，请稍候。')
    if (!workspace) throw new Error('本地数据尚未加载。')
    if (workspace.resumeDocuments.length >= MAX_DOCUMENTS)
      throw new Error('最多保存 10 份简历文件，请先删除不再需要的记录。')
    importingResume = true
    try {
      const result = await dialog.showOpenDialog({
        title: '导入简历并解析',
        properties: ['openFile'],
        filters: [{ name: '简历文件（PDF / DOCX）', extensions: ['pdf', 'docx'] }]
      })
      if (result.canceled || !result.filePaths[0]) return null
      const path = result.filePaths[0]
      const format = extname(path).slice(1).toLowerCase()
      if (format !== 'pdf' && format !== 'docx')
        throw new Error('仅支持 PDF 和 DOCX。旧版 DOC 请先另存为 DOCX。')
      const info = await stat(path)
      if (!info.isFile() || info.size <= 0 || info.size > MAX_RESUME_BYTES)
        throw new Error('请选择非空且不超过 10 MB 的简历文件。')
      const bytes = await readFile(path)
      if (bytes.length > MAX_RESUME_BYTES) throw new Error('简历文件超过 10 MB。')
      const parsed = await parseInWorker(bytes, format)
      const doc: ResumeDocument = {
        id: randomUUID(),
        fileName: basename(path),
        format,
        size: bytes.length,
        importedAt: new Date().toISOString(),
        ...parsed,
        selectedFields: resumeKeys.filter((key) => parsed.fields[key].trim()),
        status: 'pending'
      }
      await storeOriginal(doc, bytes)
      try {
        const saved = await mutate((current) => {
          if (current.resumeDocuments.length >= MAX_DOCUMENTS)
            throw new Error('最多保存 10 份简历文件。')
          return { ...current, resumeDocuments: [doc, ...current.resumeDocuments] }
        })
        return { workspace: saved, documentId: doc.id }
      } catch (error) {
        await removeOriginal(doc)
        throw error
      }
    } finally {
      importingResume = false
    }
  })

  const reviewDocument = (
    current: Workspace,
    id: string,
    fields: ResumeData,
    selected: (keyof ResumeData)[]
  ): ResumeDocument => {
    const doc = current.resumeDocuments.find((entry) => entry.id === id)
    if (!doc) throw new Error('简历文件记录不存在，请重新选择。')
    if (!Array.isArray(selected) || selected.some((key) => !resumeKeys.includes(key)))
      throw new Error('校对字段无效。')
    return { ...doc, fields: normalizeResume(fields), selectedFields: [...new Set(selected)] }
  }
  ipcMain.handle(
    'resume:save-review',
    (_event, id: string, fields: ResumeData, selected: (keyof ResumeData)[]) =>
      mutate((current) => {
        const doc = reviewDocument(current, id, fields, selected)
        return {
          ...current,
          resumeDocuments: current.resumeDocuments.map((entry) =>
            entry.id === id ? { ...doc, status: 'pending', confirmedAt: undefined } : entry
          )
        }
      })
  )
  ipcMain.handle(
    'resume:confirm-review',
    (
      _event,
      id: string,
      fields: ResumeData,
      selected: (keyof ResumeData)[],
      currentDraft: ResumeData
    ) =>
      mutate((current) => {
        const doc = reviewDocument(current, id, fields, selected)
        if (!selected.length) throw new Error('请至少选择一项要写入简历的字段。')
        const data = mergeReviewedResume(
          normalizeResume(currentDraft),
          doc.fields,
          doc.selectedFields
        )
        const now = new Date().toISOString()
        return {
          ...current,
          resume: data,
          resumeVersions: [{ id: randomUUID(), createdAt: now, data }, ...current.resumeVersions],
          resumeDocuments: current.resumeDocuments.map((entry) =>
            entry.id === id ? { ...doc, status: 'confirmed', confirmedAt: now } : entry
          )
        }
      })
  )
  ipcMain.handle('resume:open-original', async (_event, id: string) => {
    const doc = workspace?.resumeDocuments.find((entry) => entry.id === id)
    if (!doc) throw new Error('简历文件记录不存在。')
    const error = await shell.openPath(originalPath(doc))
    if (error) throw new Error(`无法打开原文件：${error}`)
  })
  ipcMain.handle('resume:delete', async (_event, id: string) => {
    const doc = workspace?.resumeDocuments.find((entry) => entry.id === id)
    if (!doc) throw new Error('简历文件记录不存在。')
    // Keep a rollback copy until the workspace change succeeds.
    const bytes = await readOriginal(doc).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    })
    await removeOriginal(doc)
    try {
      return await mutate((current) => ({
        ...current,
        resumeDocuments: current.resumeDocuments.filter((entry) => entry.id !== id)
      }))
    } catch (error) {
      if (bytes) await storeOriginal(doc, bytes)
      throw error
    }
  })

  ipcMain.handle('workspace:add-intent', (_event, companyId: string, jobId: string) =>
    mutate((current) => {
      const company = current.companies.find((item) => item.id === companyId)
      const job = company?.jobs.find((item) => item.id === jobId)
      if (!company || !job) throw new Error('岗位已不存在，请刷新后重试。')
      if (
        current.applicationIntents.some(
          (item) => item.companyId === companyId && item.jobId === jobId
        )
      ) {
        throw new Error('这个岗位的投递意向已经记录。')
      }
      return {
        ...current,
        applicationIntents: [
          {
            id: randomUUID(),
            companyId,
            jobId,
            companyName: company.name,
            jobTitle: job.title,
            createdAt: new Date().toISOString(),
            status: 'intent'
          },
          ...current.applicationIntents
        ]
      }
    })
  )

  ipcMain.handle('workspace:backup', async () => {
    await queue
    if (!workspace) throw new Error('本地数据尚未加载。')
    const result = await dialog.showSaveDialog({
      title: '备份本地数据',
      defaultPath: 'job-agent-backup.json',
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    // Snapshot after the native dialog closes; include originals so the backup is portable.
    await queue
    const snapshot = workspace
    const resumeFiles: Record<string, string> = {}
    for (const doc of snapshot.resumeDocuments)
      resumeFiles[doc.id] = (await readOriginal(doc)).toString('base64')
    await writeFile(result.filePath, JSON.stringify({ ...snapshot, resumeFiles }, null, 2), 'utf8')
    return true
  })

  ipcMain.handle('workspace:restore', async () => {
    const result = await dialog.showOpenDialog({
      title: '恢复本地数据',
      properties: ['openFile'],
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    if (importingResume) throw new Error('请等待当前简历解析完成后再恢复备份。')
    if ((await stat(result.filePaths[0])).size > 150 * 1024 * 1024)
      throw new Error('备份超过 150 MB，无法恢复。')
    const source = record(JSON.parse(await readFile(result.filePaths[0], 'utf8')))
    const restored = normalizeWorkspace(source)
    const originals = record(source.resumeFiles)
    const staged: ResumeDocument[] = []
    const previousDocuments = workspace?.resumeDocuments ?? []
    try {
      for (const doc of restored.resumeDocuments) {
        const encoded = originals[doc.id]
        if (
          typeof encoded !== 'string' ||
          encoded.length > Math.ceil(MAX_RESUME_BYTES / 3) * 4 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
        )
          throw new Error('备份缺少有效的简历原文件。')
        const bytes = Buffer.from(encoded, 'base64')
        if (
          bytes.length !== doc.size ||
          (doc.format === 'pdf'
            ? !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))
            : bytes.length < 2 || bytes.readUInt16LE(0) !== 0x4b50)
        )
          throw new Error('备份中的简历原文件与记录不符。')
        doc.id = randomUUID()
        await storeOriginal(doc, bytes)
        staged.push(doc)
      }
      const saved = await mutate(() => restored, restored)
      // Old originals are no longer referenced after a successful replacement.
      await Promise.allSettled(previousDocuments.map(removeOriginal))
      return saved
    } catch (error) {
      await Promise.all(staged.map(removeOriginal))
      throw error
    }
  })
}
