import { parentPort, workerData } from 'node:worker_threads'
import { parseResume } from './resume-parser'

parseResume(Buffer.from(workerData.bytes), workerData.format).then(
  (result) => parentPort?.postMessage({ result }),
  (error) =>
    parentPort?.postMessage({
      error: error instanceof Error ? error.message : '文件解析失败，请检查文件是否损坏。'
    })
)
