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
  phone: string
  targetRole: string
  city: string
  email: string
  summary: string
  experience: string
  skills: string
  education: string
}

export type ResumeDocument = {
  id: string
  fileName: string
  format: 'pdf' | 'docx'
  size: number
  importedAt: string
  rawText: string
  warnings: string[]
  fields: ResumeData
  selectedFields: (keyof ResumeData)[]
  status: 'pending' | 'confirmed'
  confirmedAt?: string
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
  resumeDocuments: ResumeDocument[]
}

export type LegacyData = { companies?: Company[]; resume?: ResumeData }

export type WorkspaceAPI = {
  load: (legacy: LegacyData) => Promise<Workspace>
  saveCompanies: (companies: Company[]) => Promise<Workspace>
  saveResume: (resume: ResumeData) => Promise<Workspace>
  importResume: () => Promise<{ workspace: Workspace; documentId: string } | null>
  saveResumeReview: (
    id: string,
    fields: ResumeData,
    selected: (keyof ResumeData)[]
  ) => Promise<Workspace>
  confirmResumeReview: (
    id: string,
    fields: ResumeData,
    selected: (keyof ResumeData)[],
    currentDraft: ResumeData
  ) => Promise<Workspace>
  openResumeOriginal: (id: string) => Promise<void>
  deleteResumeDocument: (id: string) => Promise<Workspace>
  addIntent: (companyId: string, jobId: string) => Promise<Workspace>
  backup: () => Promise<boolean>
  restore: () => Promise<Workspace | null>
}
