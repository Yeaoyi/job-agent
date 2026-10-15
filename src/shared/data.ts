export type Job = {
  id: string
  title: string
  type: string
  salary: string
  jd: string
  applyUrl: string
}

export type Company = {
  id: string
  name: string
  industry: string
  city: string
  recruitmentUrl: string
  jobs: Job[]
}

export type ResumeData = {
  name: string
  targetRole: string
  city: string
  email: string
  summary: string
  experience: string
  skills: string
}

export type ResumeVersion = {
  id: string
  createdAt: string
  data: ResumeData
}

export type ApplicationIntent = {
  id: string
  companyId: string
  jobId: string
  companyName: string
  jobTitle: string
  createdAt: string
  status: 'intent'
}

export type Workspace = {
  version: 1
  companies: Company[]
  resume: ResumeData
  resumeVersions: ResumeVersion[]
  applicationIntents: ApplicationIntent[]
}

export type LegacyData = { companies?: Company[]; resume?: ResumeData }

export type WorkspaceAPI = {
  load: (legacy: LegacyData) => Promise<Workspace>
  saveCompanies: (companies: Company[]) => Promise<Workspace>
  saveResume: (resume: ResumeData) => Promise<Workspace>
  addIntent: (companyId: string, jobId: string) => Promise<Workspace>
  backup: () => Promise<boolean>
  restore: () => Promise<Workspace | null>
}
