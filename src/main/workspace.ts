import { app, dialog, ipcMain } from 'electron'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Company, LegacyData, ResumeData, Workspace } from '../shared/data'

const emptyResume: ResumeData = {
  name: '',
  targetRole: '',
  city: '',
  email: '',
  summary: '',
  experience: '',
  skills: ''
}
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
    targetRole: string(data.targetRole),
    city: string(data.city),
    email: string(data.email),
    summary: string(data.summary),
    experience: string(data.experience),
    skills: string(data.skills)
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
  const resumeFields = Object.keys(emptyResume)
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
  return {
    version: 1,
    companies: normalizeCompanies(data.companies),
    resume: normalizeResume(data.resume),
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
    await writeFile(result.filePath, JSON.stringify(workspace, null, 2), 'utf8')
    return true
  })

  ipcMain.handle('workspace:restore', async () => {
    const result = await dialog.showOpenDialog({
      title: '恢复本地数据',
      properties: ['openFile'],
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const source = await readFile(result.filePaths[0], 'utf8')
    const restored = normalizeWorkspace(JSON.parse(source))
    return mutate(() => restored, restored)
  })
}
