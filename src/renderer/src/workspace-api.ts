import type { Workspace, WorkspaceAPI } from '../../shared/data'

const previewKey = 'job-agent.preview-workspace.v1'
let preview: Workspace | null = null

function store(next: Workspace): Workspace {
  preview = next
  localStorage.setItem(previewKey, JSON.stringify(next))
  return next
}

const browserPreview: WorkspaceAPI = {
  async load(legacy) {
    if (preview) return preview
    const saved = localStorage.getItem(previewKey)
    if (saved) return store(JSON.parse(saved) as Workspace)
    return store({
      version: 1,
      companies: legacy.companies ?? [],
      resume: legacy.resume ?? {
        name: '',
        targetRole: '',
        city: '',
        email: '',
        summary: '',
        experience: '',
        skills: ''
      },
      resumeVersions: [],
      applicationIntents: []
    })
  },
  async saveCompanies(companies) {
    if (!preview) throw new Error('数据尚未加载。')
    return store({ ...preview, companies })
  },
  async saveResume(resume) {
    if (!preview) throw new Error('数据尚未加载。')
    return store({
      ...preview,
      resume,
      resumeVersions: [
        { id: crypto.randomUUID(), createdAt: new Date().toISOString(), data: resume },
        ...preview.resumeVersions
      ]
    })
  },
  async addIntent(companyId, jobId) {
    if (!preview) throw new Error('数据尚未加载。')
    const company = preview.companies.find((item) => item.id === companyId)
    const job = company?.jobs.find((item) => item.id === jobId)
    if (!company || !job) throw new Error('岗位已不存在。')
    if (
      preview.applicationIntents.some(
        (item) => item.companyId === companyId && item.jobId === jobId
      )
    )
      throw new Error('这个岗位的投递意向已经记录。')
    return store({
      ...preview,
      applicationIntents: [
        {
          id: crypto.randomUUID(),
          companyId,
          jobId,
          companyName: company.name,
          jobTitle: job.title,
          createdAt: new Date().toISOString(),
          status: 'intent'
        },
        ...preview.applicationIntents
      ]
    })
  },
  async backup() {
    throw new Error('请在 Electron 桌面应用内导出备份。')
  },
  async restore() {
    throw new Error('请在 Electron 桌面应用内恢复备份。')
  }
}

export const dataAPI: WorkspaceAPI = window.api ?? browserPreview
