export type JobStatus = 'pending' | 'navigating' | 'waiting_for_3d' | 'downloading' | 'done' | 'error';

export interface Job {
  id: string;
  status: JobStatus;
  message: string;
  filename?: string;
  error?: string;
}

const jobs = new Map<string, Job>();

export function createJob(id: string): Job {
  const job: Job = { id, status: 'pending', message: 'Job created' };
  jobs.set(id, job);
  return job;
}

export function updateJob(id: string, patch: Partial<Job>): void {
  const job = jobs.get(id);
  if (job) jobs.set(id, { ...job, ...patch });
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}
